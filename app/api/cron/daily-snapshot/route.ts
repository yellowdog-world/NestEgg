import { createClient } from "@supabase/supabase-js";
import { fetchPriceMap, fetchUsdKrwRate } from "@/lib/market/price";
import { lookupTicker } from "@/lib/market/ticker-map";

// Vercel Cron: 매일 22:00 UTC = 한국 07:00 KST
// vercel.json에 설정 필요: { "crons": [{ "path": "/api/cron/daily-snapshot", "schedule": "0 22 * * *" }] }

export async function GET(req: Request) {
  // Vercel이 CRON_SECRET을 Authorization 헤더로 자동 전달
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

  // 1. confirmed 홀딩이 있는 모든 유저 수집
  const { data: snapshots } = await supabase
    .from("snapshots")
    .select("id, user_id, account_id, accounts(broker, type)")
    .eq("status", "confirmed");

  if (!snapshots?.length) return Response.json({ ok: true, processed: 0 });

  // 유저별 최근 스냅샷
  const latestByAccountByUser = new Map<string, Map<string, (typeof snapshots)[0]>>();
  for (const s of snapshots) {
    if (!latestByAccountByUser.has(s.user_id)) {
      latestByAccountByUser.set(s.user_id, new Map());
    }
    const m = latestByAccountByUser.get(s.user_id)!;
    if (!m.has(s.account_id)) m.set(s.account_id, s);
  }

  // 2. 모든 스냅샷의 홀딩 조회
  const allSnapshotIds = [...latestByAccountByUser.values()]
    .flatMap((m) => [...m.values()])
    .map((s) => s.id);

  const { data: allHoldings } = await supabase
    .from("holdings")
    .select("snapshot_id, raw_name, quantity, avg_price, currency, securities(ticker, market)")
    .in("snapshot_id", allSnapshotIds);

  // 3. 티커 수집 후 시세 일괄 조회
  const tickerSet = new Map<string, { ticker: string; market: string }>();
  let hasUsd = false;

  for (const h of allHoldings ?? []) {
    const sec = h.securities as { ticker?: string; market?: string } | null;
    const info = sec?.ticker ? { ticker: sec.ticker, market: sec.market ?? "KRX" } : lookupTicker(h.raw_name);
    if (info) tickerSet.set(info.ticker, info);
    if (h.currency === "USD") hasUsd = true;
  }
  if (hasUsd) tickerSet.set("USDKRW=X", { ticker: "USDKRW=X", market: "FOREX" });

  const priceMap = await fetchPriceMap([...tickerSet.values()]);
  const usdKrw = priceMap.get("USDKRW=X")?.price ?? (await fetchUsdKrwRate());

  // 4. 유저별 포트폴리오 총액 계산 후 upsert
  type HoldingRow = NonNullable<typeof allHoldings>[number];
  const holdingsBySnapshot = new Map<string, HoldingRow[]>();
  for (const h of allHoldings ?? []) {
    if (!holdingsBySnapshot.has(h.snapshot_id)) holdingsBySnapshot.set(h.snapshot_id, []);
    holdingsBySnapshot.get(h.snapshot_id)!.push(h);
  }

  const rows = [];
  for (const [userId, accountMap] of latestByAccountByUser) {
    let totalKrw = 0;
    const accountBreakdowns = [];

    for (const [, snap] of accountMap) {
      const holdings = holdingsBySnapshot.get(snap.id) ?? [];
      let accountTotal = 0;
      const holdingDetails = [];

      for (const h of holdings) {
        const sec = (Array.isArray(h.securities) ? h.securities[0] : h.securities) as { ticker?: string; market?: string } | null;
        const info = sec?.ticker ? { ticker: sec.ticker, market: sec.market ?? "KRX" } : lookupTicker(h.raw_name);
        const live = info ? priceMap.get(info.ticker) : null;
        const qty = Number(h.quantity);

        if (live) {
          const evalKrw = live.currency === "USD" ? qty * live.price * usdKrw : qty * live.price;
          accountTotal += evalKrw;
          holdingDetails.push({
            raw_name: h.raw_name,
            ticker: info?.ticker,
            quantity: qty,
            price: live.price,
            currency: live.currency,
            eval_krw: Math.round(evalKrw),
          });
        }
      }

      totalKrw += accountTotal;
      accountBreakdowns.push({
        account_id: snap.account_id,
        broker: (snap.accounts as { broker?: string } | null)?.broker,
        type: (snap.accounts as { type?: string } | null)?.type,
        total_krw: Math.round(accountTotal),
        holdings: holdingDetails,
      });
    }

    rows.push({
      user_id: userId,
      snapshot_date: today,
      total_krw: Math.round(totalKrw),
      usd_krw_rate: usdKrw,
      breakdown: { accounts: accountBreakdowns },
    });
  }

  const { error } = await supabase
    .from("portfolio_daily_snapshots")
    .upsert(rows, { onConflict: "user_id,snapshot_date" });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true, processed: rows.length, date: today });
}
