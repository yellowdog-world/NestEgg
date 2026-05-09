import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { extractHoldingsFromImage } from "@/lib/ocr/claude";
import { resolveSecurity } from "@/lib/market/resolve-security";

const Body = z.object({
  imagePath: z.string().min(1),                    // Supabase Storage path
  accountId: z.string().uuid(),
  capturedAt: z.string().optional(),               // 사용자가 제공한 캡처 시각
  userHint: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }
  const { imagePath, accountId, capturedAt, userHint } = parsed.data;

  // 계정 소유 확인
  const { data: account } = await supabase
    .from("accounts")
    .select("id,user_id,type,broker")
    .eq("id", accountId)
    .single();
  if (!account || account.user_id !== user.id) {
    return NextResponse.json({ error: "account_not_found" }, { status: 404 });
  }

  // Storage에서 이미지 다운로드 (서버 → ANTHROPIC_API_KEY 노출 방지)
  const { data: file, error: dlErr } = await supabase.storage.from("snapshots-raw").download(imagePath);
  if (dlErr || !file) {
    return NextResponse.json({ error: "storage_download_failed", detail: dlErr?.message }, { status: 500 });
  }
  const arr = new Uint8Array(await file.arrayBuffer());
  const base64 = Buffer.from(arr).toString("base64");
  const mediaType = (file.type || "image/jpeg") as "image/jpeg" | "image/png" | "image/webp" | "image/gif";

  // Claude Vision 호출
  let ocr;
  try {
    ocr = await extractHoldingsFromImage(base64, mediaType, { userHint });
  } catch (e) {
    return NextResponse.json(
      { error: "ocr_failed", detail: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }

  // ── 사후검증 1: 시스템적 avg/market 스왑 자동교정 ─────────────────────────────
  // 증상: OCR이 매입가/현재가를 전체적으로 뒤집어 읽고, 평가손익을 eval_amount에 저장.
  // 조건: 가격이 있는 종목 중 절반 이상이 avg>market + profit_loss=null + eval_amount>0
  {
    const tradeable = ocr.data.holdings.filter(
      (h) => h.avg_price != null && h.market_price != null && h.avg_price > 0 && h.market_price > 0,
    );
    const swapCandidates = tradeable.filter(
      (h) => h.avg_price! > h.market_price! && h.profit_loss == null && (h.eval_amount ?? 0) > 0,
    );

    if (tradeable.length >= 2 && swapCandidates.length >= 2 && swapCandidates.length / tradeable.length >= 0.5) {
      for (const h of ocr.data.holdings) {
        if (h.avg_price != null && h.market_price != null && h.avg_price > h.market_price) {
          [h.avg_price, h.market_price] = [h.market_price, h.avg_price];
          if (h.profit_loss == null && h.eval_amount != null) {
            h.profit_loss = h.eval_amount;
            h.eval_amount = null;
          }
        }
      }
      const swapNote = `[avg_market 자동교정] 매입가/현재가 전위(轉位) 감지 — 자동 교정 적용. 값을 반드시 확인하세요`;
      ocr.data.confidence = "low";
      ocr.data.notes = ocr.data.notes ? `${ocr.data.notes} | ${swapNote}` : swapNote;
    }
  }

  // ── 사후검증 2: avg_price ≈ market_price 감지 ────────────────────────────────
  // OCR이 키움증권 등에서 매입가/현재가 행을 혼동하면 수익률이 ≈0%로 나타남.
  const suspiciousNames: string[] = [];
  for (const h of ocr.data.holdings) {
    if (h.avg_price == null || h.market_price == null || h.avg_price === 0) continue;

    const priceDiffPct = Math.abs(h.market_price - h.avg_price) / h.avg_price;

    // 두 가격이 2% 이내인데 profit_loss가 있으면 행을 잘못 읽은 것
    if (priceDiffPct < 0.02 && h.profit_loss != null && Math.abs(h.profit_loss) > 0) {
      suspiciousNames.push(h.raw_name);
      continue;
    }
    // profit_loss(또는 eval_amount 대체값) > 0인데 avg >= market 이면 방향 오류
    const effectivePL = h.profit_loss ?? h.eval_amount;
    if (effectivePL != null && effectivePL > 0 && h.avg_price >= h.market_price) {
      suspiciousNames.push(h.raw_name);
    }
  }
  if (suspiciousNames.length > 0) {
    const warning = `[avg_price 의심] ${suspiciousNames.join(", ")} — 매입가/현재가 행 혼동 가능`;
    ocr.data.confidence = "low";
    ocr.data.notes = ocr.data.notes ? `${ocr.data.notes} | ${warning}` : warning;
  }

  // snapshots insert (status=draft)
  const finalCapturedAt = capturedAt ?? new Date().toISOString();
  const { data: snapshot, error: snapErr } = await supabase
    .from("snapshots")
    .insert({
      user_id: user.id,
      account_id: accountId,
      captured_at: finalCapturedAt,
      source: "ocr",
      image_path: imagePath,
      ocr_raw: { ...(ocr.raw as object), notes: ocr.data.notes, confidence: ocr.data.confidence },
      ocr_model: ocr.model,
      status: "draft",
      total_eval: ocr.data.total_eval_amount,
    })
    .select()
    .single();
  if (snapErr || !snapshot) {
    return NextResponse.json({ error: "insert_snapshot_failed", detail: snapErr?.message }, { status: 500 });
  }

  // holdings insert — securities 매핑 포함
  if (ocr.data.holdings.length) {
    const rows = await Promise.all(
      ocr.data.holdings.map(async (h) => {
        const sec = await resolveSecurity(supabase, h.raw_name, h.ticker);
        return {
          snapshot_id: snapshot.id,
          raw_name: h.raw_name,
          quantity: h.quantity,
          avg_price: h.avg_price,
          market_price: h.market_price,
          eval_amount: h.eval_amount,
          profit_loss: h.profit_loss,
          currency: h.currency,
          security_ticker: sec?.ticker ?? null,
          security_market: sec?.market ?? null,
        };
      }),
    );
    const { error: hErr } = await supabase.from("holdings").insert(rows);
    if (hErr) {
      return NextResponse.json({ error: "insert_holdings_failed", detail: hErr.message }, { status: 500 });
    }
  }

  // 예수금 holding 삽입
  if (ocr.data.cash_balance && ocr.data.cash_balance > 0) {
    const cashCurrency = ocr.data.cash_currency ?? "KRW";
    await supabase.from("holdings").insert({
      snapshot_id: snapshot.id,
      raw_name: cashCurrency === "USD" ? "USD 예수금" : "예수금",
      quantity: 1,
      avg_price: ocr.data.cash_balance,
      eval_amount: ocr.data.cash_balance,
      market_price: null,
      profit_loss: null,
      currency: cashCurrency,
      security_ticker: null,
      security_market: null,
    });
  }

  return NextResponse.json({
    snapshotId: snapshot.id,
    confidence: ocr.data.confidence,
    notes: ocr.data.notes,
    usage: ocr.usage,
  });
}
