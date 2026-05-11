import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { extractHoldingsFromImage } from "@/lib/ocr/claude";
import { lookupByTicker, deriveTickerInfo } from "@/lib/market/ticker-map";
import { resolveTickerByPrice } from "@/lib/market/resolve-security";
import { fetchNaverName, fetchYahooName } from "@/lib/market/external-apis";
import { fetchPriceMap, fetchUsdKrwRate } from "@/lib/market/price";

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

  // ── 사전처리: 티커 → 정식 종목명 해석 (티커 우선순위) ─────────────────────────
  await Promise.all(
    ocr.data.holdings.map(async (h) => {
      const rawTicker = h.ticker?.trim().toUpperCase();
      if (!rawTicker) return;

      // 1. 정적 맵
      const staticHit = lookupByTicker(rawTicker);
      if (staticHit?.name) { h.raw_name = staticHit.name; return; }

      // 2. KRX 6자리 → Naver Finance
      if (/^\d{6}$/.test(rawTicker)) {
        const name = await fetchNaverName(rawTicker);
        if (name) { h.raw_name = name; return; }
      }

      // 3. US 티커 → Yahoo Finance
      const info = deriveTickerInfo(rawTicker);
      if (info) {
        const name = await fetchYahooName(rawTicker);
        if (name) { h.raw_name = name; return; }
      }
    }),
  );

  // ── 티커 기반 실시간 시세 조회 → market_price를 라이브 값으로 보정 ──────────────
  // 통화가 일치하는 티커만 사용 (예: KRW 종목에 QQQ 티커가 붙은 경우는 OCR 오류이므로 무시)
  {
    const tickerItems: { ticker: string; market: string }[] = [];
    for (const h of ocr.data.holdings) {
      const t = h.ticker?.trim().toUpperCase();
      if (!t) continue;
      const info = lookupByTicker(t)?.info ?? deriveTickerInfo(t);
      if (!info) continue;
      // 통화 불일치 → 티커가 잘못됨 → 스킵
      if ((info.currency ?? "KRW") !== (h.currency ?? "KRW")) continue;
      tickerItems.push({ ticker: t, market: info.market });
    }

    if (tickerItems.length > 0) {
      const priceMap = await fetchPriceMap(tickerItems);
      for (const h of ocr.data.holdings) {
        const t = h.ticker?.trim().toUpperCase();
        if (!t) continue;
        const info = lookupByTicker(t)?.info ?? deriveTickerInfo(t);
        if (!info || (info.currency ?? "KRW") !== (h.currency ?? "KRW")) continue;
        const live = priceMap.get(t);
        if (live) h.market_price = live.price;
      }
    }
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

  // ── 사후검증 2-extra: avg_price가 주당 단가가 아닌 총액으로 들어온 경우 교정 ────────
  //
  // Pattern A: 평가손익 총액이 avg에 → 교정: avg = market − avg/qty
  // Pattern B: 매입금액 총액이 avg에 → 교정: avg = avg / qty
  //
  // 핵심: batchMedian은 market_price 없이도 계산 (2-pass robust median)
  //       market_price가 없는 화면(IRP 매매비용 탭 등)에서도 동작
  {
    // ① 2-pass robust median: market_price 불필요, avg_price만으로 계산
    const allAvgs = ocr.data.holdings
      .filter((h) => !h.raw_name.includes("예수금") && h.avg_price != null && h.avg_price > 0 && h.quantity > 0)
      .map((h) => h.avg_price!)
      .sort((a, b) => a - b);

    let batchMedian: number | null = null;
    if (allAvgs.length >= 2) {
      const roughMedian = allAvgs[Math.floor(allAvgs.length / 2)];
      // 2차: roughMedian × 30 초과값 제거 후 재계산 (총액 outlier 제거)
      const filtered = allAvgs.filter((v) => v <= roughMedian * 30);
      if (filtered.length > 0) batchMedian = filtered[Math.floor(filtered.length / 2)];
    }

    const correctedNames: string[] = [];

    for (const h of ocr.data.holdings) {
      if (h.raw_name.includes("예수금") || h.avg_price == null || h.quantity <= 0) continue;

      // 음수 avg → profit_loss 이동
      if (h.avg_price < 0) {
        if (h.profit_loss == null) h.profit_loss = h.avg_price;
        h.avg_price = null;
        correctedNames.push(h.raw_name);
        continue;
      }

      // 기준가: live market 우선, 없으면 batchMedian
      const refPrice = h.market_price ?? batchMedian;
      if (refPrice == null) continue;

      // 기준가 대비 20배 초과 → 총액이 들어온 것으로 판단
      if (h.avg_price <= refPrice * 20) continue;

      const candidateB = h.avg_price / h.quantity;         // 총액÷수량
      const candidateA = h.market_price != null             // market 역산
        ? h.market_price - h.avg_price / h.quantity
        : null;

      let corrected: number | null = null;
      let pattern: "A" | "B" | null = null;

      if (h.market_price != null) {
        const bInRange = candidateB >= h.market_price * 0.3 && candidateB <= h.market_price * 3;
        const aValid   = candidateA != null && candidateA > 0 && candidateA < h.market_price * 0.95;

        if (bInRange && aValid) {
          const bRatio = candidateB / h.market_price;
          // candidateB가 현재가와 70%~140% 범위 → 매입금액 총액 (Pattern B)
          corrected = (bRatio >= 0.7 && bRatio <= 1.4) ? candidateB : (candidateA ?? candidateB);
          pattern   = (bRatio >= 0.7 && bRatio <= 1.4) ? "B" : "A";
        } else if (bInRange) { corrected = candidateB; pattern = "B"; }
        else if (aValid)     { corrected = candidateA; pattern = "A"; }
      } else if (batchMedian != null) {
        // live price 없음 → batch median으로 candidateB 검증
        if (candidateB >= batchMedian * 0.1 && candidateB <= batchMedian * 10) {
          corrected = candidateB; pattern = "B";
        }
      }

      if (corrected != null && corrected > 0) {
        if (pattern === "A" && h.profit_loss == null) h.profit_loss = h.avg_price;
        h.avg_price = parseFloat(corrected.toFixed(4));
        correctedNames.push(h.raw_name);
      }
    }

    if (correctedNames.length > 0) {
      const note = `[평단가 자동교정] ${correctedNames.join(", ")}`;
      ocr.data.notes = ocr.data.notes ? `${ocr.data.notes} | ${note}` : note;
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

  // ── 티커 보강: 정적 맵 → DB 이름 조회 → 현재가 기반 최근접 후보 선택 ──────────────
  await Promise.all(
    ocr.data.holdings.map(async (h) => {
      if (!h.ticker) {
        const resolved = await resolveTickerByPrice(supabase, h.raw_name, h.market_price);
        if (resolved) h.ticker = resolved;
      }
    }),
  );

  // snapshots insert (status=draft)
  // holdings는 DB에 즉시 삽입하지 않고 ocr_raw에 보존 → confirm 시점에만 DB 저장
  const finalCapturedAt = capturedAt ?? new Date().toISOString();
  const { data: snapshot, error: snapErr } = await supabase
    .from("snapshots")
    .insert({
      user_id: user.id,
      account_id: accountId,
      captured_at: finalCapturedAt,
      source: "ocr",
      image_path: imagePath,
      ocr_raw: {
        ...(ocr.raw as object),
        notes: ocr.data.notes,
        confidence: ocr.data.confidence,
        // 사후교정이 완료된 holdings — confirm 페이지에서 초기값으로 사용
        processed_holdings: ocr.data.holdings,
        cash_balance: ocr.data.cash_balance ?? null,
        cash_currency: ocr.data.cash_currency ?? null,
      },
      ocr_model: ocr.model,
      status: "draft",
      total_eval: ocr.data.total_eval_amount,
    })
    .select()
    .single();
  if (snapErr || !snapshot) {
    return NextResponse.json({ error: "insert_snapshot_failed", detail: snapErr?.message }, { status: 500 });
  }

  return NextResponse.json({
    snapshotId: snapshot.id,
    confidence: ocr.data.confidence,
    notes: ocr.data.notes,
    usage: ocr.usage,
  });
}
