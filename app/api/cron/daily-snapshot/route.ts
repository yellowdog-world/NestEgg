import { createClient, SupabaseClient } from "@supabase/supabase-js";
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

// ── 보강된 holding 타입 ────────────────────────────────────────────────────────
type HoldingDetail = {
  raw_name: string;
  ticker: string | null;
  market: string | null;
  currency: string;
  eval_krw: number;
  cost_krw: number;     // avg_price × qty × 환율 (없으면 eval_krw)
  qty: number;
  account_type: string;
};

// ── 투자 목표 스냅샷 빌더 ────────────────────────────────────────────────────
async function buildGoalRows(
  supabase: SupabaseClient,
  userId: string,
  today: string,
  allHoldings: HoldingDetail[],
  usdKrw: number,
) {
  // 이 유저의 투자 목표 + 티커 맵 조회
  const { data: goals } = await supabase
    .from("investment_goals")
    .select("id")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (!goals?.length) return [];

  const goalIds = goals.map((g) => g.id);

  const { data: tickerMaps } = await supabase
    .from("goal_ticker_map")
    .select("goal_id, ticker, market, account_type_filter")
    .in("goal_id", goalIds);

  if (!tickerMaps?.length) return [];

  // goal_id → ticker 매핑 목록
  const mapByGoal = new Map<string, { ticker: string; market: string; account_type_filter: string | null }[]>();
  for (const tm of tickerMaps) {
    if (!mapByGoal.has(tm.goal_id)) mapByGoal.set(tm.goal_id, []);
    mapByGoal.get(tm.goal_id)!.push(tm);
  }

  const goalRows = [];

  for (const { id: goalId } of goals) {
    const tickers = mapByGoal.get(goalId) ?? [];
    if (!tickers.length) continue;

    // 이 목표에 속하는 holding 필터링
    const goalHoldings = allHoldings.filter((h) => {
      if (!h.ticker) return false;
      return tickers.some(
        (t) =>
          t.ticker === h.ticker &&
          t.market === h.market &&
          (t.account_type_filter === null || t.account_type_filter === h.account_type),
      );
    });

    if (!goalHoldings.length) continue;

    const totalKrw = goalHoldings.reduce((s, h) => s + h.eval_krw, 0);
    const costBasisKrw = goalHoldings.reduce((s, h) => s + h.cost_krw, 0);

    // account_type별 소계
    const byAccountType: Record<string, number> = {};
    for (const h of goalHoldings) {
      byAccountType[h.account_type] = Math.round((byAccountType[h.account_type] ?? 0) + h.eval_krw);
    }

    goalRows.push({
      user_id: userId,
      goal_id: goalId,
      snapshot_date: today,
      total_krw: Math.round(totalKrw),
      cost_basis_krw: Math.round(costBasisKrw),
      usd_krw_rate: usdKrw,
      breakdown: {
        by_account_type: byAccountType,
        holdings: goalHoldings.map((h) => ({
          ticker: h.ticker,
          name: h.raw_name,
          qty: h.qty,
          currency: h.currency,
          eval_krw: h.eval_krw,
          cost_krw: h.cost_krw,
          account_type: h.account_type,
        })),
      },
    });
  }

  return goalRows;
}

// ── 메인 cron handler ─────────────────────────────────────────────────────────

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

  // ── 3-b. securities 정식명 맵 (ticker → name) ──────────────────────────────
  const tickerList = [...tickerSet.keys()].filter((t) => t !== "USDKRW=X");
  const { data: securitiesRows } = tickerList.length
    ? await supabase.from("securities").select("ticker, name").in("ticker", tickerList)
    : { data: [] };
  const securitiesNameMap = new Map<string, string>(
    (securitiesRows ?? []).map((s) => [s.ticker, s.name]),
  );

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
  const goalRowsAll: Awaited<ReturnType<typeof buildGoalRows>> = [];

  for (const [userId, userAccounts] of userAccountMap) {
    let totalKrw = 0;
    const accountBreakdowns: {
      account_id: string;
      broker: string | null;
      type: string;
      nickname: string | null;
      total_krw: number;
      holdings: HoldingDetail[];
    }[] = [];

    for (const acc of userAccounts) {
      const accHoldings = holdingsByAccount.get(acc.id) ?? [];
      let accountTotal = 0;
      const holdingDetails: HoldingDetail[] = [];

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

        // 취득원가 추정: avg_price × qty × 환율 (없으면 eval_krw로 대체)
        const costKrw = avgP !== null
          ? Math.round(qty * avgP * (h.currency === "USD" ? usdKrw : 1))
          : Math.round(evalKrw);

        // 표시명: securities 정식명 > raw_name(OCR 원문)
        const displayName = info?.ticker
          ? (securitiesNameMap.get(info.ticker) ?? h.raw_name)
          : h.raw_name;

        accountTotal += evalKrw;
        holdingDetails.push({
          raw_name: displayName,
          ticker: info?.ticker ?? null,
          market: info?.market ?? null,
          currency: h.currency,
          eval_krw: Math.round(evalKrw),
          cost_krw: costKrw,
          qty,
          account_type: acc.type,
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

    // account_type을 포함한 flat holdings (goal 집계에도 사용)
    const allHoldingFlat = accountBreakdowns.flatMap((a) =>
      a.holdings.map((h) => ({ ...h, account_type: a.type })),
    );

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
        category_breakdown: categoryBreakdown,        // 전략 카테고리
        usd_total_krw: usdTotalKrw,                   // 환 노출
        broker_breakdown: brokerBreakdown,             // 증권사별
        account_type_breakdown: accountTypeBreakdown,  // 계좌 유형별
        account_breakdown: accountBreakdownMap,        // 계좌별
        holdings_breakdown: holdingsBreakdown,         // 종목별
      },
    });

    // ── 7. 투자 목표별 스냅샷 집계 ───────────────────────────────────────────
    const goalRows = await buildGoalRows(supabase, userId, today, allHoldingFlat, usdKrw);
    goalRowsAll.push(...goalRows);
  }

  if (!rows.length) return Response.json({ ok: true, processed: 0 });

  // ── 8. DB 저장 ─────────────────────────────────────────────────────────────
  const { error } = await supabase
    .from("portfolio_daily_snapshots")
    .upsert(rows, { onConflict: "user_id,snapshot_date" });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // 목표별 스냅샷 저장 (목표가 없으면 skip)
  if (goalRowsAll.length) {
    const { error: goalError } = await supabase
      .from("goal_daily_snapshots")
      .upsert(goalRowsAll, { onConflict: "user_id,goal_id,snapshot_date" });

    if (goalError) {
      console.error("goal_daily_snapshots upsert error:", goalError.message);
      // 메인 스냅샷은 성공했으므로 goal 오류는 로그만 남기고 계속
    }
  }

  return Response.json({
    ok: true,
    processed: rows.length,
    goal_snapshots: goalRowsAll.length,
    date: today,
  });
}
