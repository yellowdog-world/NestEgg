import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { HoldingsEditor } from "@/components/assets/HoldingsEditor";
import { ReOcrButton } from "@/components/assets/ReOcrButton";

export default async function ConfirmSnapshotPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return notFound();

  const { data: snapshot } = await supabase
    .from("snapshots")
    .select("*, accounts(broker,nickname,type)")
    .eq("id", id)
    .single();
  if (!snapshot || snapshot.user_id !== user.id) return notFound();

  const { data: holdings } = await supabase
    .from("holdings")
    .select("*")
    .eq("snapshot_id", id)
    .order("created_at");

  // ocr_raw.holdings: Claude가 반환한 원본값 (우리 사후교정 이전)
  type OcrRawHolding = {
    raw_name?: string;
    quantity?: number | string | null;
    avg_price?: number | string | null;
    market_price?: number | string | null;
    eval_amount?: number | string | null;
    profit_loss?: number | string | null;
  };
  const ocrRawHoldings: OcrRawHolding[] =
    ((snapshot.ocr_raw as Record<string, unknown> | null)?.holdings as OcrRawHolding[]) ?? [];

  function toNum(v: number | string | null | undefined): number | null {
    if (v == null || v === "") return null;
    const n = Number(String(v).replace(/,/g, ""));
    return isNaN(n) || n === 0 ? null : n;
  }

  // non-cash 홀딩 순서와 ocr_raw 순서가 일치 (예수금은 별도 삽입)
  let ocrIdx = 0;
  const initial = (holdings ?? []).map((h) => {
    const isCash = h.raw_name.includes("예수금");
    const raw = isCash ? null : ocrRawHoldings[ocrIdx];
    if (!isCash) ocrIdx++;
    return {
      raw_name: h.raw_name,
      ticker: (h.security_ticker as string | null) ?? undefined,
      quantity: Number(h.quantity),
      avg_price: h.avg_price !== null ? Number(h.avg_price) : null,
      market_price: h.market_price !== null ? Number(h.market_price) : null,
      eval_amount: h.eval_amount !== null ? Number(h.eval_amount) : null,
      profit_loss: h.profit_loss !== null ? Number(h.profit_loss) : null,
      currency: (h.currency ?? "KRW") as "KRW" | "USD",
      // OCR이 읽은 모든 숫자값 (교정 전) → 행별 후보 드롭다운에 사용
      _ocr_qty:    raw ? toNum(raw.quantity)     : null,
      _ocr_avg:    raw ? toNum(raw.avg_price)    : null,
      _ocr_market: raw ? toNum(raw.market_price) : null,
      _ocr_eval:   raw ? toNum(raw.eval_amount)  : null,
      _ocr_pl:     raw ? toNum(raw.profit_loss)  : null,
    };
  });

  const ocrNote = (snapshot.ocr_raw as { notes?: string; confidence?: string } | null)?.notes;
  const confidence = (snapshot.ocr_raw as { confidence?: string } | null)?.confidence;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link href="/assets" className="text-sm text-neutral-600 hover:text-neutral-900">
          ← 자산
        </Link>
        <div className="mt-1 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">OCR 결과 확인</h1>
            <p className="mt-1 text-sm text-neutral-600">
              종목명·티커·수량·평단가를 확인하고 [확인 완료]를 누르세요.
            </p>
          </div>
          {snapshot.image_path && (
            <ReOcrButton
              imagePath={snapshot.image_path}
              accountId={snapshot.account_id}
            />
          )}
        </div>
      </header>

      <section className="flex flex-wrap gap-3 rounded-lg bg-neutral-100 p-3 text-sm">
        <span>
          <strong>계좌:</strong>{" "}
          {snapshot.accounts?.broker ?? "—"}{" "}
          {snapshot.accounts?.nickname ? `(${snapshot.accounts.nickname})` : ""}
        </span>
        <span>
          <strong>캡처 시각:</strong> {new Date(snapshot.captured_at).toLocaleString("ko-KR")}
        </span>
        <span>
          <strong>신뢰도:</strong>{" "}
          <ConfidenceBadge level={confidence as "high" | "medium" | "low" | undefined} />
        </span>
      </section>

      {/* 자동 교정 여부 — 한 줄 compact 표시 */}
      {ocrNote && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ✦ AI가 일부 값을 자동 교정했습니다. 주황색 셀은 직접 확인해 주세요.
        </p>
      )}

      <HoldingsEditor snapshotId={id} accountId={snapshot.account_id} initial={initial} />
    </div>
  );
}

function ConfidenceBadge({ level }: { level?: "high" | "medium" | "low" }) {
  if (!level) return <span className="text-neutral-500">—</span>;
  const cls =
    level === "high"
      ? "bg-emerald-100 text-emerald-800"
      : level === "medium"
        ? "bg-amber-100 text-amber-800"
        : "bg-red-100 text-red-800";
  const label = level === "high" ? "높음" : level === "medium" ? "보통" : "낮음";
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}
