import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { HoldingsDirectEditor } from "@/components/assets/HoldingsDirectEditor";
import { lookupTicker } from "@/lib/market/ticker-map";

export default async function HoldingsEditPage({
  params,
}: {
  params: Promise<{ snapshotId: string }>;
}) {
  const { snapshotId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return notFound();

  const { data: snapshot } = await supabase
    .from("snapshots")
    .select("id, user_id, account_id, accounts(broker, nickname, type)")
    .eq("id", snapshotId)
    .single();
  if (!snapshot || snapshot.user_id !== user.id) return notFound();

  const { data: holdings } = await supabase
    .from("holdings")
    .select("id, raw_name, quantity, avg_price, currency, security_ticker")
    .eq("snapshot_id", snapshotId)
    .order("created_at");

  type HoldingRow = NonNullable<typeof holdings>[number];

  const initial = (holdings ?? []).map((h: HoldingRow) => {
    const dbTicker = h.security_ticker ?? null;
    // 정적 맵이 있으면 DB보다 신뢰 (OCR이 잘못 연결했을 수 있음)
    const mappedTicker = lookupTicker(h.raw_name)?.ticker ?? null;
    const ticker = mappedTicker ?? dbTicker ?? "";
    return {
      raw_name: h.raw_name,
      ticker,
      quantity: Number(h.quantity),
      avg_price: h.avg_price != null ? Number(h.avg_price) : null,
      currency: (h.currency ?? "KRW") as "KRW" | "USD",
    };
  });

  const acct = snapshot.accounts as unknown as { broker: string | null; nickname: string | null; type: string } | null;
  const acctLabel = [acct?.broker, acct?.nickname].filter(Boolean).join(" · ") || "계좌";

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link href="/assets" className="text-sm text-neutral-600 hover:text-neutral-900">
          ← 자산
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">종목 편집</h1>
        <p className="mt-1 text-sm text-neutral-500">{acctLabel}</p>
      </header>

      <HoldingsDirectEditor snapshotId={snapshotId} initial={initial} />
    </div>
  );
}
