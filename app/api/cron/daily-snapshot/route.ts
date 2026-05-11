import { createClient } from "@supabase/supabase-js";
import { fetchPriceMap, fetchUsdKrwRate } from "@/lib/market/price";
import { lookupTicker } from "@/lib/market/ticker-map";
import { aggregateByCategory } from "@/lib/market/asset-category";

// Vercel Cron: 매일 22:00 UTC = 한국 07:00 KST
// vercel.json에 설정 필요: { "crons": [{ "path": "/api/cron/daily-snapshot", "schedule": "0 22 * * 1-5" }] }

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // service_role로 RLS 우회 (배치 처리)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const today = new Date().toISOString().slice(0, 10);

  // ── 1. 모든 유저의 계좌 조회 ──────────────────────────────────────────────
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, user_id, type, broker, nickname");

  if (!accounts?.length) return Response.json({ ok: true, processed: 0 });

  // ── 2. 계좌별 holdings 직접 조회 (account_id 기준 — assets 페이지와 동일) ─
  const accountIds = accounts.map((a) => a.id);

  const { data: holdingsRaw } = await supabase
    .from("holdings")
    .select("account_id, raw_name, quantity, avg_price, currency, security_ticker, security_market")
    .in("account_id", accountIds);

  const holdings = holdingsRaw ?? [];

  // ── 3. 티커 수집 후 시세 일괄 조회 ───────────────────────────────────────
  const tickerSet = new Map<string, { ticker: string; market: string }>();
  let hasUsd = false;

  for (const h of holdings) {
    // 예수금은 live price 불필요 (avg_price × qty 로 처리)
    if (h.raw_name.includes("예수금")) continue;

    const info = h.security_ticker
      ? { ticker: h.security_ticker, market: h.security_market ?? "KRX" }
      : lookupTicker(h.raw_name);
    if (info) tickerSet.set(info.ticker, info);
    if (h.currency === "USD") hasUsd = true;
  }
  if (hasUsd) tickerSet.set("USDKRW=X", { ticker: "USDKRW=X", market: "FOREX" });

  const priceMap = await fetchPriceMap([...tickerSet.values()]);
  const usdKrw = priceMap.get("USDKRW=X")?.price ?? (await fetchUsdKrwRate());

  // ── 4. holdings → account 그룹화 ─────────────────────────────────────────
  type HRow = NonNullable<typeof holdingsRaw>[number];
  const holdingsByAccount = new Map<string, HRow[]>();
  for (const h of holdings) {
    if (!holdingsByAccount.has(h.account_id)) holdingsByAccount.set(h.account_id, []);
    holdingsByAccount.get(h.account_id)!.push(h);
  }

  // ── 5. 유저별 집계 ────────────────────────────────────────────────────────
  const userAccountMap = new Map<string, typeof accounts>();
  for (const a of accounts) {
    if (!userAccountMap.has(a.user_id)) userAccountMap.set(a.user_id, []);
    userAccountMap.get(a.user_id)!.push(a);
  }

  const rows = [];

  for (const [userId, userAccounts] of userAccountMap) {
    let totalKrw = 0;
    const accountBreakdowns = [];

    for (const acc of userAccounts) {
      const accHoldings = holdingsByAccount.get(acc.id) ?? [];
      let accountTotal = 0;
      const holdingDetails = [];

      for (const h of accHoldings) {
        const qty = Number(h.quantity);
        const avgP = h.avg_price !== null ? Number(h.avg_price) : null;
        const isCash = h.raw_name.includes("예수금");

        let evalKrw = 0;

        if (isCash) {
          // 예수금: avg_price = 실제 잔액 (assets 페이지와 동일 처리)
          if (avgP !== null) {
            evalKrw = h.currency === "USD" ? qty * avgP * usdKrw : qty * avgP;
          }
        } else {
          const info = h.security_ticker
            ? { ticker: h.security_ticker, market: h.security_market ?? "KRX" }
            : lookupTicker(h.raw_name);
          const live = info ? priceMap.get(info.ticker) : null;

          if (live) {
            evalKrw = live.currency === "USD" ? qty * live.price * usdKrw : qty * live.price;
          } else if (avgP !== null) {
            // live price 없으면 avg_price로 fallback (미분류 종목 누락 방지)
            evalKrw = h.currency === "USD" ? qty * avgP * usdKrw : qty * avgP;
          }
        }

        if (evalKrw === 0) continue;

        const info = h.security_ticker
          ? { ticker: h.security_ticker, market: h.security_market ?? "KRX" }
          : lookupTicker(h.raw_name);

        accountTotal += evalKrw;
        holdingDetails.push({
          raw_name: h.raw_name,
          ticker: info?.ticker ?? null,
          market: info?.market ?? null,
          quantity: qty,
          currency: h.currency,      // USD or KRW (환 노출 계산용)
          eval_krw: Math.round(evalKrw),
        });
      }

      totalKrw += accountTotal;
      if (accountTotal > 0) {
        accountBreakdowns.push({
          account_id: acc.id,
          broker: acc.broker,
          type: acc.type,
          total_krw: Math.round(accountTotal),
          holdings: holdingDetails,
        });
      }
    }

    if (totalKrw === 0) continue;

    const allHoldingFlat = accountBreakdowns.flatMap((a) => a.holdings);
    const categoryBreakdown = aggregateByCategory(allHoldingFlat);
    const usdTotalKrw = Math.round(
      allHoldingFlat.filter((h) => h.currency === "USD").reduce((s, h) => s + h.eval_krw, 0),
    );

    rows.push({
      user_id: userId,
      snapshot_date: today,
      total_krw: Math.round(totalKrw),
      usd_krw_rate: usdKrw,
      breakdown: {
        accounts: accountBreakdowns,
        category_breakdown: categoryBreakdown,
        usd_total_krw: usdTotalKrw,   // 환 노출 추이용
      },
    });
  }

  if (!rows.length) return Response.json({ ok: true, processed: 0 });

  const { error } = await supabase
    .from("portfolio_daily_snapshots")
    .upsert(rows, { onConflict: "user_id,snapshot_date" });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true, processed: rows.length, date: today });
}
