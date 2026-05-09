import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { HoldingsEditor } from "@/components/assets/HoldingsEditor";

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

  const initial = (holdings ?? []).map((h) => ({
    raw_name: h.raw_name,
    ticker: (h.security_ticker as string | null) ?? undefined,
    quantity: Number(h.quantity),
    avg_price: h.avg_price !== null ? Number(h.avg_price) : null,
    market_price: h.market_price !== null ? Number(h.market_price) : null,
    eval_amount: h.eval_amount !== null ? Number(h.eval_amount) : null,
    profit_loss: h.profit_loss !== null ? Number(h.profit_loss) : null,
    currency: (h.currency ?? "KRW") as "KRW" | "USD",
  }));

  const ocrNote = (snapshot.ocr_raw as { notes?: string; confidence?: string } | null)?.notes;
  const confidence = (snapshot.ocr_raw as { confidence?: string } | null)?.confidence;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link href="/assets" className="text-sm text-neutral-600 hover:text-neutral-900">
          ← 자산
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">OCR 결과 확인</h1>
        <p className="mt-1 text-sm text-neutral-600">
          AI가 추출한 종목을 확인하고 필요하면 수정한 뒤 [확인 완료]를 누르세요.
        </p>
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

      {ocrNote && (
        <div className={`rounded-md px-3 py-2 text-sm ${
          ocrNote.includes("[avg_market 자동교정]") ? "border border-blue-200 bg-blue-50 text-blue-900"
          : ocrNote.includes("[avg_price 의심]") ? "border border-red-200 bg-red-50 text-red-900"
          : "bg-amber-50 text-amber-900"
        }`}>
          {ocrNote.includes("[avg_market 자동교정]") ? (
            <>
              <p className="font-semibold">🔄 매입가/현재가 자동 교정됨</p>
              <p className="mt-1">AI가 매입가와 현재가가 전체적으로 뒤바뀐 것을 감지하여 <strong>자동으로 교정</strong>했습니다.</p>
              <p className="mt-1">값이 올바른지 확인하세요. 틀렸다면 표 우측의 <strong>⇄</strong> 버튼으로 개별 행을 되돌릴 수 있습니다.</p>
            </>
          ) : ocrNote.includes("[avg_price 의심]") ? (
            <>
              <p className="font-semibold">⚠️ 매입가 오독 가능성 감지됨</p>
              <p className="mt-1">{ocrNote.replace("[avg_price 의심] ", "").replace(" — 매입가/현재가 행 혼동 가능", "")} 종목의 <strong>평단가</strong>를 반드시 확인하세요.</p>
              <p className="mt-1 text-xs opacity-75">표 우측 ⇄ 버튼으로 평단가/현재가를 한 번에 교체할 수 있습니다.</p>
            </>
          ) : (
            <p>🤖 AI 노트: {ocrNote}</p>
          )}
        </div>
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
