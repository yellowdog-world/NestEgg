import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchPriceMap } from "@/lib/market/price";
import { lookupTicker } from "@/lib/market/ticker-map";
import { fetchDividendHistoryBatch } from "@/lib/market/dividends";
import { RetirementDashboard } from "@/components/assets/RetirementDashboard";

export const dynamic = "force-dynamic";

export default async function RetirementPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <p className="text-sm text-neutral-600">
        <Link className="text-blue-700 underline" href="/login">
          로그인
        </Link>
        이 필요합니다.
      </p>
    );
  }

  // ── 계좌 ──────────────────────────────────────────────────────────────────
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id,type,broker,nickname")
    .order("created_at", { ascending: true });

  // ── 최신 confirmed 스냅샷 ─────────────────────────────────────────────────
  const { data: snapshots } = await supabase
    .from("snapshots")
    .select("id,account_id,captured_at")
    .eq("status", "confirmed")
    .order("captured_at", { ascending: false });

  const latestByAccount = new Map<string, string>(); // accountId → snapshotId
  for (const s of snapshots ?? []) {
    if (!latestByAccount.has(s.account_id)) latestByAccount.set(s.account_id, s.id);
  }
  const latestSnapshotIds = [...latestByAccount.values()];

  // ── 홀딩 ──────────────────────────────────────────────────────────────────
  const { data: holdingsRaw } = latestSnapshotIds.length
    ? await supabase
        .from("holdings")
        .select(
          "id,raw_name,quantity,avg_price,currency,snapshot_id,security_ticker,security_market",
        )
        .in("snapshot_id", latestSnapshotIds)
    : { data: [] };

  // ── 시세 ──────────────────────────────────────────────────────────────────
  const tickerSet = new Map<string, { ticker: string; market: string }>();
  let hasUsd = false;
  for (const h of holdingsRaw ?? []) {
    const info = h.security_ticker
      ? { ticker: h.security_ticker, market: h.security_market ?? "KRX" }
      : lookupTicker(h.raw_name);
    if (info) tickerSet.set(info.ticker, info);
    if (h.currency === "USD") hasUsd = true;
  }
  if (hasUsd) tickerSet.set("USDKRW=X", { ticker: "USDKRW=X", market: "FOREX" });

  const priceMap = await fetchPriceMap([...tickerSet.values()]);
  const usdKrw = priceMap.get("USDKRW=X")?.price ?? 1380;

  // ── 계좌 유형별 평가금 분류 ────────────────────────────────────────────────
  const PENSION_TYPES = new Set(["pension_fund", "irp"]);

  type HoldingRow = NonNullable<typeof holdingsRaw>[number];
  const holdingsBySnapshot = new Map<string, HoldingRow[]>();
  for (const h of holdingsRaw ?? []) {
    const list = holdingsBySnapshot.get(h.snapshot_id) ?? [];
    list.push(h);
    holdingsBySnapshot.set(h.snapshot_id, list);
  }

  let pensionKrw = 0;
  let stocksKrw = 0;
  let cashKrw = 0;
  let totalEvalKrw = 0;
  let totalCostKrw = 0;
  const currentQtyByTicker = new Map<string, { qty: number; name: string; market: string }>();

  for (const account of accounts ?? []) {
    const snapshotId = latestByAccount.get(account.id);
    if (!snapshotId) continue;

    const isPension = PENSION_TYPES.has(account.type);
    for (const h of holdingsBySnapshot.get(snapshotId) ?? []) {
      const info = h.security_ticker
        ? { ticker: h.security_ticker, market: h.security_market ?? "KRX" }
        : lookupTicker(h.raw_name);
      const live = info ? priceMap.get(info.ticker) : null;
      const qty = Number(h.quantity);
      const avgP = h.avg_price !== null ? Number(h.avg_price) : null;
      const isCash = h.raw_name.includes("예수금");

      if (isCash && avgP !== null) {
        cashKrw += h.currency === "USD" ? qty * avgP * usdKrw : qty * avgP;
      } else if (live) {
        const evalKrw =
          live.currency === "USD" ? qty * live.price * usdKrw : qty * live.price;
        if (isPension) pensionKrw += evalKrw;
        else stocksKrw += evalKrw;

        totalEvalKrw += evalKrw;
        if (avgP !== null) {
          const costKrw =
            h.currency === "USD" ? qty * avgP * usdKrw : qty * avgP;
          totalCostKrw += costKrw;
        }

        if (info) {
          const prev = currentQtyByTicker.get(info.ticker) ?? {
            qty: 0,
            name: h.raw_name,
            market: info.market,
          };
          prev.qty += qty;
          currentQtyByTicker.set(info.ticker, prev);
        }
      }
    }
  }

  const avgReturnPct =
    totalCostKrw > 0 ? ((totalEvalKrw - totalCostKrw) / totalCostKrw) * 100 : null;

  // ── 최근 1년 배당 합계 ────────────────────────────────────────────────────
  const ONE_YEAR_AGO = new Date(Date.now() - 365 * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  const divItems = [...currentQtyByTicker.entries()]
    .filter(([, v]) => v.qty > 0)
    .map(([ticker, v]) => ({ ticker, market: v.market }));

  const divMap = divItems.length
    ? await fetchDividendHistoryBatch(divItems, ONE_YEAR_AGO)
    : new Map();

  let yearlyDivKrw = 0;
  for (const [ticker, events] of divMap) {
    const info = currentQtyByTicker.get(ticker)!;
    for (const ev of events) {
      if (ev.date < ONE_YEAR_AGO || ev.date > today) continue;
      const amt = ev.perShare * info.qty;
      yearlyDivKrw += ev.currency === "USD" ? amt * usdKrw : amt;
    }
  }

  const portfolioData = {
    totalKrw: pensionKrw + stocksKrw + cashKrw,
    pensionKrw,
    stocksKrw,
    cashKrw,
    monthlyDivKrw: Math.round(yearlyDivKrw / 12),
    usdKrw,
    avgReturnPct,
  };

  return <RetirementDashboard portfolioData={portfolioData} />;
}
