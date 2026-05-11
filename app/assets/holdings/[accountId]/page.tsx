import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { HoldingsDirectEditor } from "@/components/assets/HoldingsDirectEditor";
import { lookupTicker } from "@/lib/market/ticker-map";

export default async function HoldingsEditPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return notFound();

  const { data: account } = await supabase
    .from("accounts")
    .select("id, user_id, broker, nickname, type")
    .eq("id", accountId)
    .single();
  if (!account || account.user_id !== user.id) return notFound();

  // account_id 기준으로 현재 holdings 직접 조회 (스냅샷 무관)
  const { data: holdings } = await supabase
    .from("holdings")
    .select("id, raw_name, quantity, avg_price, currency, security_ticker")
    .eq("account_id", accountId)
    .order("created_at");

  type HoldingRow = NonNullable<typeof holdings>[number];

  const initial = (holdings ?? []).map((h: HoldingRow) => {
    const dbTicker = h.security_ticker ?? null;
    // DB 저장값(사용자가 명시적으로 입력) 우선 — 정적 맵은 DB가 없을 때만 fallback
    const ticker = dbTicker ?? lookupTicker(h.raw_name)?.ticker ?? "";
    return {
      raw_name: h.raw_name,
      ticker,
      quantity: Number(h.quantity),
      avg_price: h.avg_price != null ? Number(h.avg_price) : null,
      currency: (h.currency ?? "KRW") as "KRW" | "USD",
    };
  });

  const acctLabel = [account.broker, account.nickname].filter(Boolean).join(" · ") || "계좌";

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link href="/assets" className="text-sm text-neutral-600 hover:text-neutral-900">
          ← 자산
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">종목 편집</h1>
        <p className="mt-1 text-sm text-neutral-500">{acctLabel}</p>
      </header>

      <HoldingsDirectEditor accountId={accountId} initial={initial} />
    </div>
  );
}
