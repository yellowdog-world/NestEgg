export const preferredRegion = "icn1";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchPriceMap } from "@/lib/market/price";
import { lookupTicker } from "@/lib/market/ticker-map";
import { fetchDividendHistoryBatch, inferDividendType } from "@/lib/market/dividends";
import { type HoldingWithLive } from "@/components/assets/AccountCard";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // ── 1+2. 계좌 + 스냅샷 병렬 조회 ──────────────────────────────────────────
  const [{ data: accounts }, { data: snapshots }] = await Promise.all([
    supabase
      .from("accounts")
      .select("id,type,broker,nickname,principal_krw")
      .order("created_at", { ascending: true }),
    supabase
      .from("snapshots")
      .select("id,account_id,captured_at,total_eval")
      .eq("status", "confirmed")
      .order("captured_at", { ascending: false }),
  ]);

  const snapshotList = snapshots ?? [];

  const latestCapturedAtByAccount = new Map<string, string>();
  for (const s of snapshotList) {
    if (!latestCapturedAtByAccount.has(s.account_id)) {
      latestCapturedAtByAccount.set(s.account_id, s.captured_at);
    }
  }

  // ── 3+4. holdings + allHoldingsForCost 병렬 조회 ──────────────────────────
  const accountIds = (accounts ?? []).map((a) => a.id);
  const allSnapshotIds = snapshotList.map((s) => s.id);

  const [holdingsRaw, allHoldingsForCost] = await Promise.all([
    accountIds.length
      ? supabase
          .from("holdings")
          .select("id,raw_name,quantity,avg_price,currency,account_id,security_ticker,security_market")
          .in("account_id", accountIds)
          .then((r) => r.data ?? [])
      : Promise.resolve([] as { id: string; raw_name: string; quantity: number; avg_price: number | null; currency: string; account_id: string; security_ticker: string | null; security_market: string | null }[]),
    allSnapshotIds.length
      ? supabase
          .from("holdings")
          .select("snapshot_id,quantity,avg_price,currency,raw_name,account_id")
          .in("snapshot_id", allSnapshotIds)
          .then((r) => r.data ?? [])
      : Promise.resolve([] as { snapshot_id: string; quantity: number; avg_price: number | null; currency: string; raw_name: string; account_id: string }[]),
  ]);

  // ── 5. 티커 수집 ──────────────────────────────────────────────────────────
  const tickerSet = new Map<string, { ticker: string; market: string }>();
  let hasUsd = false;
  const divQtyByTicker = new Map<string, { qty: number; name: string; market: string }>();

  for (const h of holdingsRaw) {
    const info = h.security_ticker
      ? { ticker: h.security_ticker, market: h.security_market ?? "KRX" }
      : lookupTicker(h.raw_name);
    if (info) tickerSet.set(info.ticker, info);
    if (h.currency === "USD") hasUsd = true;

    if (!h.raw_name.includes("예수금") && info?.ticker) {
      const prev = divQtyByTicker.get(info.ticker) ?? { qty: 0, name: h.raw_name, market: info.market };
      prev.qty += Number(h.quantity);
      divQtyByTicker.set(info.ticker, prev);
    }
  }
  if (hasUsd) tickerSet.set("USDKRW=X", { ticker: "USDKRW=X", market: "FOREX" });

  const TWO_YEARS_AGO = new Date(Date.now() - 2 * 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const divTickerItems = [...divQtyByTicker.entries()]
    .filter(([, v]) => v.qty > 0)
    .map(([ticker, v]) => ({ ticker, market: v.market }));

  // ── 6. 시세 + 배당 이력 병렬 조회 ─────────────────────────────────────────
  const [priceMap, dividendHistoryMap] = await Promise.all([
    fetchPriceMap([...tickerSet.values()]),
    fetchDividendHistoryBatch(divTickerItems, TWO_YEARS_AGO),
  ]);

  const usdKrw = priceMap.get("USDKRW=X")?.price ?? 1380;

  // ── 7. 스냅샷별 원금(cost) 계산 ───────────────────────────────────────────
  const costBySnapshotId = new Map<string, number>();
  for (const h of allHoldingsForCost) {
    const qty = Number(h.quantity);
    const avgP = h.avg_price != null ? Number(h.avg_price) : 0;
    const tickerInfo = lookupTicker(h.raw_name);
    const currency = tickerInfo?.currency ?? (h.currency as "KRW" | "USD");
    const cost = currency === "USD" ? qty * avgP * usdKrw : qty * avgP;
    costBySnapshotId.set(h.snapshot_id, (costBySnapshotId.get(h.snapshot_id) ?? 0) + cost);
  }

  // ── 8+9. holdings 그룹화 + 계좌별 enriched 데이터 ─────────────────────────
  type HoldingRow = NonNullable<typeof holdingsRaw>[number];
  const holdingsByAccount = new Map<string, HoldingRow[]>();
  for (const h of holdingsRaw) {
    if (!holdingsByAccount.has(h.account_id)) holdingsByAccount.set(h.account_id, []);
    holdingsByAccount.get(h.account_id)!.push(h);
  }

  const accountList = accounts ?? [];
  let totalLiveKrw = 0;

  const enrichedAccounts = accountList.map((a) => {
    const rawHoldings = holdingsByAccount.get(a.id) ?? [];

    const holdings: HoldingWithLive[] = rawHoldings.map((h) => {
      const info = h.security_ticker
        ? { ticker: h.security_ticker, market: h.security_market ?? "KRX" }
        : lookupTicker(h.raw_name);

      const live = info ? priceMap.get(info.ticker) : null;
      const qty = Number(h.quantity);
      const avgP = h.avg_price !== null ? Number(h.avg_price) : null;

      let liveEvalKrw: number | null = null;
      let liveReturnPct: number | null = null;
      const isCash = h.raw_name.includes("예수금");

      if (isCash && avgP !== null) {
        liveEvalKrw = h.currency === "USD" ? qty * avgP * usdKrw : qty * avgP;
      } else if (live) {
        liveEvalKrw = live.currency === "USD" ? qty * live.price * usdKrw : qty * live.price;
        if (avgP !== null && avgP > 0) {
          liveReturnPct = ((live.price - avgP) / avgP) * 100;
        }
      }

      return {
        id: h.id,
        raw_name: h.raw_name,
        quantity: qty,
        avg_price: avgP,
        currency: h.currency,
        ticker: info?.ticker ?? null,
        market: info?.market ?? null,
        isCash,
        livePrice: live?.price ?? null,
        livePriceChangePercent: live?.changePercent ?? null,
        liveCurrency: live?.currency ?? null,
        liveEvalKrw,
        liveReturnPct,
      };
    });

    const totalEvalKrw = holdings.reduce((s, h) => s + (h.liveEvalKrw ?? 0), 0);
    totalLiveKrw += totalEvalKrw;

    const totalCostKrw = rawHoldings.reduce((sum, h) => {
      const qty = Number(h.quantity);
      const avgP = h.avg_price !== null ? Number(h.avg_price) : 0;
      if (avgP === 0) return sum;
      if (h.raw_name.includes("예수금")) {
        return sum + (h.currency === "USD" ? qty * avgP * usdKrw : qty * avgP);
      }
      const lookedUp = lookupTicker(h.raw_name);
      const secMarket = h.security_market ?? "KRX";
      const currency = lookedUp?.currency ?? (secMarket === "KRX" ? "KRW" : (h.currency as "KRW" | "USD"));
      return sum + (currency === "USD" ? qty * avgP * usdKrw : qty * avgP);
    }, 0);

    return {
      account: a,
      capturedAt: latestCapturedAtByAccount.get(a.id) ?? null,
      holdings,
      totalEvalKrw,
      totalCostKrw,
    };
  });

  // ── 10. 시계열 포인트 ─────────────────────────────────────────────────────
  const liveEvalByAccountId = new Map<string, number>();
  for (const { account, totalEvalKrw } of enrichedAccounts) {
    if (totalEvalKrw > 0) liveEvalByAccountId.set(account.id, totalEvalKrw);
  }
  const liveEvalBySnapshotId = new Map<string, number>();
  for (const s of snapshotList) {
    if (!liveEvalBySnapshotId.has(s.id)) {
      const liveEval = liveEvalByAccountId.get(s.account_id);
      const isLatestForAccount = latestCapturedAtByAccount.get(s.account_id) === s.captured_at;
      if (liveEval && isLatestForAccount) liveEvalBySnapshotId.set(s.id, liveEval);
    }
  }

  const timelinePoints = buildTimelinePoints(
    [...snapshotList].sort((a, b) => (a.captured_at < b.captured_at ? -1 : 1)),
    costBySnapshotId,
    liveEvalBySnapshotId,
  );

  // ── 11. 보유 종목 기반 자동 배당 계산 ────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const autoDividends: {
    id: string; received_at: string; ticker: string; name: string;
    quantity: number; per_share: number; currency: string;
    amount_original: number; amount_krw: number;
    usd_krw_rate: number | null; dividend_type: string; account_id: null;
  }[] = [];

  for (const [ticker, events] of dividendHistoryMap) {
    const info = divQtyByTicker.get(ticker)!;
    const divType = inferDividendType(events);
    for (const event of events) {
      if (event.date > today) continue;
      const amountOrig = parseFloat((event.perShare * info.qty).toFixed(4));
      const amountKrw = parseFloat(
        (event.currency === "USD" ? amountOrig * usdKrw : amountOrig).toFixed(2),
      );
      autoDividends.push({
        id: `auto-${ticker}-${event.date}`,
        received_at: event.date,
        ticker,
        name: info.name,
        quantity: info.qty,
        per_share: event.perShare,
        currency: event.currency,
        amount_original: amountOrig,
        amount_krw: amountKrw,
        usd_krw_rate: event.currency === "USD" ? usdKrw : null,
        dividend_type: divType,
        account_id: null,
      });
    }
  }
  autoDividends.sort((a, b) => (a.received_at > b.received_at ? -1 : 1));

  // ── 12. 최근 1년 배당 합계 ────────────────────────────────────────────────
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const yearlyDivKrw = Math.round(
    autoDividends
      .filter((d) => d.received_at >= oneYearAgo)
      .reduce((s, d) => s + d.amount_krw, 0),
  );

  return NextResponse.json({
    totalLiveKrw,
    usdKrw,
    enrichedAccounts,
    timelinePoints,
    autoDividends,
    yearlyDivKrw,
    isFirstTime: accountList.length === 0,
  });
}

function buildTimelinePoints(
  snaps: { id: string; account_id: string; captured_at: string; total_eval: number | null }[],
  costById: Map<string, number>,
  liveEvalById: Map<string, number>,
) {
  if (!snaps.length) return [];

  const byDate = new Map<string, Map<string, { eval: number; cost: number }>>();
  const lastSeen = new Map<string, { eval: number; cost: number }>();
  const dates: string[] = [];

  for (const s of snaps) {
    const date = s.captured_at.slice(0, 10);
    if (!byDate.has(date)) {
      byDate.set(date, new Map(lastSeen));
      dates.push(date);
    }
    const storedEval = Number(s.total_eval ?? 0);
    const evalAmt = liveEvalById.get(s.id) ?? (storedEval > 500_000 ? storedEval : 0);
    const costAmt = costById.get(s.id) ?? 0;
    byDate.get(date)!.set(s.account_id, { eval: evalAmt, cost: costAmt });
    lastSeen.set(s.account_id, { eval: evalAmt, cost: costAmt });
  }

  return dates
    .map((date) => {
      let totalEval = 0;
      let totalCost = 0;
      for (const v of byDate.get(date)!.values()) {
        totalEval += v.eval;
        totalCost += v.cost;
      }
      return { date, total: totalEval, cost: totalCost };
    })
    .filter((p) => p.total > 0 || p.cost > 0);
}
