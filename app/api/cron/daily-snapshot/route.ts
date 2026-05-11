import { createClient } from "@supabase/supabase-js";
import { fetchPriceMap, fetchUsdKrwRate } from "@/lib/market/price";
import { lookupTicker } from "@/lib/market/ticker-map";
import { aggregateByCategory } from "@/lib/market/asset-category";

// Vercel Cron: 매일 22:00 UTC = 한국 07:00 KST (월~금)
// vercel.json: { "crons": [{ "path": "/api/cron/daily-snapshot", "schedule": "0 22 * * 1-5" }] }

// 계좌 유형 → 한글 레이블 (account_breakdown label 생성용)
const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  pension_fund: "연저펀",
  isa: "ISA",
  irp: "IRP",
  regular: "일반계좌",
  corp: "법인",
  bank: "은행",
  overseas: "해외증권",
};

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const today = new Date().toISOString().slice(0, 10);

  // ── 1. 계좌 조회 ──────────────────────────────────────────────────────────
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, user_id, type, broker, nickname");

  if (!accounts?.length) return Response.json({ ok: true, processed: 0 });

  // ── 2. holdings 직접 조회 (account_id 기준) ───────────────────────────────
  const accountIds = accounts.map((a) => a.id);

  const { data: holdingsRaw } = await supabase
    .from("holdings")
    .select("account_id, raw_name, quantity, avg_price, currency, security_ticker, security_market")
    .in("account_id", accountIds);

  const holdings = holdingsRaw ?? [];

  // ── 3. 시세 일괄 조회 ─────────────────────────────────────────────────────
  const tickerSet = new Map<string, { ticker: string; market: string }>();
  let hasUsd = false;

  for (const h of holdings) {
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
    const accountBreakdowns: {
      account_id: string;
      broker: string | null;
      type: string;
      nickname: string | null;
      total_krw: number;
      holdings: {
        raw_name: string;
        ticker: string | null;
        market: string | null;
        currency: string;
        eval_krw: number;
      }[];
    }[] = [];

    for (const acc of userAccounts) {
      const accHoldings = holdingsByAccount.get(acc.id) ?? [];
      let accountTotal = 0;
      const holdingDetails: {
        raw_name: string;
        ticker: string | null;
        market: string | null;
        currency: string;
        eval_krw: number;
      }[] = [];

      for (const h of accHoldings) {
        const qty = Number(h.quantity);
        const avgP = h.avg_price !== null ? Number(h.avg_price) : null;
        const isCash = h.raw_name.includes("예수금");

        let evalKrw = 0;

        if (isCash) {
          if (avgP !== null)
            evalKrw = h.currency === "USD" ? qty * avgP * usdKrw : qty * avgP;
        } else {
          const info = h.security_ticker
            ? { ticker: h.security_ticker, market: h.security_market ?? "KRX" }
            : lookupTicker(h.raw_name);
          const live = info ? priceMap.get(info.ticker) : null;

          if (live) {
            evalKrw = live.currency === "USD" ? qty * live.price * usdKrw : qty * live.price;
          } else if (avgP !== null) {
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
          currency: h.currency,
          eval_krw: Math.round(evalKrw),
        });
      }

      totalKrw += accountTotal;
      if (accountTotal > 0) {
        accountBreakdowns.push({
          account_id: acc.id,
          broker: acc.broker,
          type: acc.type,
          nickname: acc.nickname,
          total_krw: Math.round(accountTotal),
          holdings: holdingDetails,
        });
      }
    }

    if (totalKrw === 0) continue;

    const allHoldingFlat = accountBreakdowns.flatMap((a) => a.holdings);

    // ── 6. 다차원 집계 ────────────────────────────────────────────────────

    // ① 카테고리별
    const categoryBreakdown = aggregateByCategory(allHoldingFlat);

    // ② USD 노출
    const usdTotalKrw = Math.round(
      allHoldingFlat.filter((h) => h.currency === "USD").reduce((s, h) => s + h.eval_krw, 0),
    );

    // ③ 증권사별
    const brokerBreakdown: Record<string, number> = {};
    for (const acc of accountBreakdowns) {
      const key = acc.broker ?? "(미지정)";
      brokerBreakdown[key] = Math.round((brokerBreakdown[key] ?? 0) + acc.total_krw);
    }

    // ④ 계좌 유형별
    const accountTypeBreakdown: Record<string, number> = {};
    for (const acc of accountBreakdowns) {
      accountTypeBreakdown[acc.type] = Math.round(
        (accountTypeBreakdown[acc.type] ?? 0) + acc.total_krw,
      );
    }

    // ⑤ 계좌별 (account_id → { total_krw, label })
    const accountBreakdownMap: Record<string, { total_krw: number; label: string }> = {};
    for (const acc of accountBreakdowns) {
      const typeLabel = ACCOUNT_TYPE_LABEL[acc.type] ?? acc.type;
      const parts = [acc.broker, typeLabel, acc.nickname].filter(Boolean);
      const label = parts.length ? parts.join(" ") : acc.account_id.slice(0, 8);
      accountBreakdownMap[acc.account_id] = { total_krw: acc.total_krw, label };
    }

    // ⑥ 종목별 (ticker or raw_name → { name, eval_krw })
    const holdingsBreakdown: Record<string, { name: string; eval_krw: number }> = {};
    for (const h of allHoldingFlat) {
      const key = h.ticker ?? h.raw_name;
      const prev = holdingsBreakdown[key] ?? { name: h.raw_name, eval_krw: 0 };
      holdingsBreakdown[key] = { name: prev.name, eval_krw: Math.round(prev.eval_krw + h.eval_krw) };
    }

    rows.push({
      user_id: userId,
      snapshot_date: today,
      total_krw: Math.round(totalKrw),
      usd_krw_rate: usdKrw,
      breakdown: {
        accounts: accountBreakdowns,
        // ─ 집계 차원들 ─
        category_breakdown: categoryBreakdown,   // 전략 카테고리
        usd_total_krw: usdTotalKrw,              // 환 노출
        broker_breakdown: brokerBreakdown,        // 증권사별
        account_type_breakdown: accountTypeBreakdown, // 계좌 유형별
        account_breakdown: accountBreakdownMap,   // 계좌별
        holdings_breakdown: holdingsBreakdown,    // 종목별
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
