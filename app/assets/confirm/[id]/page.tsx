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

  // ocr_raw 타입 정의
  type OcrRawHolding = {
    raw_name?: string;
    quantity?: number | string | null;
    avg_price?: number | string | null;
    market_price?: number | string | null;
    eval_amount?: number | string | null;
    profit_loss?: number | string | null;
  };
  type ProcessedHolding = {
    raw_name: string;
    ticker?: string | null;
    quantity: number;
    avg_price?: number | null;
    market_price?: number | null;
    eval_amount?: number | null;
    profit_loss?: number | null;
    currency?: string | null;
  };
  type OcrRaw = {
    holdings?: OcrRawHolding[];          // Claude 원본 (교정 전)
    processed_holdings?: ProcessedHolding[];  // 사후교정 완료본
    cash_balance?: number | null;
    cash_currency?: string | null;
    notes?: string;
    confidence?: string;
  };

  const ocrRaw = (snapshot.ocr_raw as OcrRaw | null) ?? {};
  const ocrRawHoldings: OcrRawHolding[] = ocrRaw.holdings ?? [];
  const processedHoldings: ProcessedHolding[] = ocrRaw.processed_holdings ?? [];
  const cashBalance = ocrRaw.cash_balance ?? null;
  const cashCurrency = ocrRaw.cash_currency ?? "KRW";

  // 이 계좌에 이미 확정 저장된 holdings (이전 OCR/편집 결과)
  const { data: existingHoldings } = await supabase
    .from("holdings")
    .select("raw_name, quantity, avg_price, market_price, eval_amount, profit_loss, currency, security_ticker")
    .eq("account_id", snapshot.account_id)
    .order("created_at");

  function toNum(v: number | string | null | undefined): number | null {
    if (v == null || v === "") return null;
    const n = Number(String(v).replace(/,/g, ""));
    return isNaN(n) || n === 0 ? null : n;
  }

  // OCR 신규 종목명 집합 — 기존 holdings 중 중복 제거용
  const newNames = new Set(
    processedHoldings.map((h) => h.raw_name.replace(/\s+/g, "").toLowerCase()),
  );

  // processed_holdings(교정 완료)와 ocr_raw.holdings(원본) 인덱스가 1:1 대응
  const initial = [
    ...processedHoldings.map((h, i) => {
      const raw = ocrRawHoldings[i] ?? null;
      return {
        raw_name: h.raw_name,
        ticker: h.ticker ?? undefined,
        quantity: Number(h.quantity),
        avg_price: h.avg_price != null ? Number(h.avg_price) : null,
        market_price: h.market_price != null ? Number(h.market_price) : null,
        eval_amount: h.eval_amount != null ? Number(h.eval_amount) : null,
        profit_loss: h.profit_loss != null ? Number(h.profit_loss) : null,
        currency: (h.currency ?? "KRW") as "KRW" | "USD",
        // OCR이 읽은 원본값 (교정 전) → 행별 후보 드롭다운에 사용
        _ocr_qty:    raw ? toNum(raw.quantity)     : null,
        _ocr_avg:    raw ? toNum(raw.avg_price)    : null,
        _ocr_market: raw ? toNum(raw.market_price) : null,
        _ocr_eval:   raw ? toNum(raw.eval_amount)  : null,
        _ocr_pl:     raw ? toNum(raw.profit_loss)  : null,
      };
    }),
    // 예수금 — 별도 필드에서 복원
    ...(cashBalance && cashBalance > 0
      ? [{
          raw_name: cashCurrency === "USD" ? "USD 예수금" : "예수금",
          ticker: undefined as string | undefined,
          quantity: 1,
          avg_price: cashBalance,
          market_price: null as number | null,
          eval_amount: cashBalance,
          profit_loss: null as number | null,
          currency: (cashCurrency ?? "KRW") as "KRW" | "USD",
        }]
      : []),
    // 기존 등록 종목 — OCR 신규와 이름이 겹치는 것은 제외 (중복 방지)
    ...(existingHoldings ?? [])
      .filter((e) => !newNames.has(e.raw_name.replace(/\s+/g, "").toLowerCase()))
      .map((e) => ({
        raw_name: e.raw_name,
        ticker: (e.security_ticker as string | null) ?? undefined,
        quantity: Number(e.quantity),
        avg_price: e.avg_price != null ? Number(e.avg_price) : null,
        market_price: e.market_price != null ? Number(e.market_price) : null,
        eval_amount: e.eval_amount != null ? Number(e.eval_amount) : null,
        profit_loss: e.profit_loss != null ? Number(e.profit_loss) : null,
        currency: (e.currency ?? "KRW") as "KRW" | "USD",
        _isExisting: true as const,
      })),
  ];

  const ocrNote = (snapshot.ocr_raw as { notes?: string; confidence?: string } | null)?.notes;
  const confidence = (snapshot.ocr_raw as { confidence?: string } | null)?.confidence;
  const existingCount = (existingHoldings ?? []).filter(
    (e) => !newNames.has(e.raw_name.replace(/\s+/g, "").toLowerCase()),
  ).length;

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

      {/* 기존 종목 포함 안내 */}
      {existingCount > 0 && (
        <p className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800">
          이 계좌에 이미 등록된 종목 <strong>{existingCount}개</strong>가 아래 목록 하단에 포함되어 있습니다.
          확인 완료 시 OCR 신규 종목과 함께 저장됩니다. 필요 없는 항목은 × 로 삭제하세요.
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
