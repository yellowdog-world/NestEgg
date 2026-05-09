import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtKRWShort } from "@/lib/utils/format";
import { type HoldingWithLive } from "@/components/assets/AccountCard";
import { AssetsViewSwitcher } from "@/components/assets/AssetsViewSwitcher";
import { AssetsAnalytics } from "@/components/assets/AssetsAnalytics";
import { fetchPriceMap } from "@/lib/market/price";
import { lookupTicker } from "@/lib/market/ticker-map";
import { fetchDividendHistoryBatch, inferDividendType } from "@/lib/market/dividends";

export const dynamic = "force-dynamic";

export default async function AssetsPage() {
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

  // ── 1. 계좌 목록 ───────────────────────────────────────────────────────────
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id,type,broker,nickname")
    .order("created_at", { ascending: true });

  // ── 2. confirmed 스냅샷 전체 ───────────────────────────────────────────────
  const { data: snapshots } = await supabase
    .from("snapshots")
    .select("id,account_id,captured_at,total_eval")
    .eq("status", "confirmed")
    .order("captured_at", { ascending: false });

  const snapshotList = snapshots ?? [];

  // 계좌별 최근 스냅샷
  const latestByAccount = new Map<string, (typeof snapshotList)[0]>();
  for (const s of snapshotList) {
    if (!latestByAccount.has(s.account_id)) latestByAccount.set(s.account_id, s);
  }
  const latestSnapshotIds = [...latestByAccount.values()].map((s) => s.id);

  // ── 3. 최근 스냅샷 홀딩 (계좌 카드용) ────────────────────────────────────
  const { data: holdingsRaw } = latestSnapshotIds.length
    ? await supabase
        .from("holdings")
        .select("id,raw_name,quantity,avg_price,currency,snapshot_id,security_ticker,security_market")
        .in("snapshot_id", latestSnapshotIds)
    : { data: [] };

  // ── 4. 전체 스냅샷 홀딩 (시계열 원금 계산용) ──────────────────────────────
  const allSnapshotIds = snapshotList.map((s) => s.id);
  const { data: allHoldingsForCost } = allSnapshotIds.length
    ? await supabase
        .from("holdings")
        .select("snapshot_id,quantity,avg_price,currency,raw_name")
        .in("snapshot_id", allSnapshotIds)
    : { data: [] };

  // ── 5. 시세 조회용 티커 수집 ───────────────────────────────────────────────
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

  // ── 6. 시세 일괄 조회 ─────────────────────────────────────────────────────
  const priceMap = await fetchPriceMap([...tickerSet.values()]);
  const usdKrw = priceMap.get("USDKRW=X")?.price ?? 1380;

  // ── 7. 스냅샷별 원금(cost) 계산 ───────────────────────────────────────────
  // DB의 currency 컬럼이 잘못 저장된 경우(KRX ETF가 USD로 저장)를 방지하기 위해
  // lookupTicker로 실제 통화를 우선 결정한다.
  const costBySnapshotId = new Map<string, number>();
  for (const h of allHoldingsForCost ?? []) {
    const qty = Number(h.quantity);
    const avgP = h.avg_price != null ? Number(h.avg_price) : 0;
    const tickerInfo = lookupTicker(h.raw_name);
    const currency = tickerInfo?.currency ?? (h.currency as "KRW" | "USD");
    const cost = currency === "USD" ? qty * avgP * usdKrw : qty * avgP;
    costBySnapshotId.set(h.snapshot_id, (costBySnapshotId.get(h.snapshot_id) ?? 0) + cost);
  }

  // ── 8. 홀딩 그룹화 ────────────────────────────────────────────────────────
  type HoldingRow = NonNullable<typeof holdingsRaw>[number];
  const holdingsBySnapshot = new Map<string, HoldingRow[]>();
  for (const h of holdingsRaw ?? []) {
    if (!holdingsBySnapshot.has(h.snapshot_id)) holdingsBySnapshot.set(h.snapshot_id, []);
    holdingsBySnapshot.get(h.snapshot_id)!.push(h);
  }

  // ── 9. 계좌별 enriched 데이터 ─────────────────────────────────────────────
  const accountList = accounts ?? [];
  let totalLiveKrw = 0;

  const enrichedAccounts = accountList.map((a) => {
    const latest = latestByAccount.get(a.id);
    const rawHoldings = latest ? (holdingsBySnapshot.get(latest.id) ?? []) : [];

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
        liveEvalKrw =
          live.currency === "USD" ? qty * live.price * usdKrw : qty * live.price;
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

    // 투자원금: lookupTicker로 통화 오류 교정 후 계산
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
      snapshotId: latest?.id ?? null,
      capturedAt: latest?.captured_at ?? null,
      holdings,
      totalEvalKrw,
      totalCostKrw,
    };
  });

  // ── 10. 시계열 포인트 ─────────────────────────────────────────────────────
  // 최근 스냅샷은 라이브 평가금으로 덮어써서 OCR 오류를 교정한다
  const liveEvalBySnapshotId = new Map<string, number>();
  for (const { snapshotId, totalEvalKrw } of enrichedAccounts) {
    if (snapshotId && totalEvalKrw > 0) liveEvalBySnapshotId.set(snapshotId, totalEvalKrw);
  }

  const timelinePoints = buildTimelinePoints(
    [...snapshotList].sort((a, b) => (a.captured_at < b.captured_at ? -1 : 1)),
    costBySnapshotId,
    liveEvalBySnapshotId,
  );

  // ── 11. 보유 종목 기반 자동 배당 계산 ────────────────────────────────────────
  // (a) 계좌별 최근 스냅샷 기준으로 티커별 현재 보유 수량 합산
  const currentQtyByTicker = new Map<
    string,
    { qty: number; name: string; market: string }
  >();
  for (const { holdings } of enrichedAccounts) {
    for (const h of holdings) {
      if (h.isCash || !h.ticker) continue;
      const prev = currentQtyByTicker.get(h.ticker) ?? {
        qty: 0,
        name: h.raw_name,
        market: h.market ?? "KRX",
      };
      prev.qty += h.quantity;
      currentQtyByTicker.set(h.ticker, prev);
    }
  }

  // (b) 보유 중인 티커 목록으로 Yahoo Finance 배당 이력 조회 (2년치)
  const divTickerItems = [...currentQtyByTicker.entries()]
    .filter(([, v]) => v.qty > 0)
    .map(([ticker, v]) => ({ ticker, market: v.market }));

  const TWO_YEARS_AGO = new Date(Date.now() - 2 * 365 * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  const dividendHistoryMap = await fetchDividendHistoryBatch(
    divTickerItems,
    TWO_YEARS_AGO,
  );

  // (c) 주당배당금 × 보유수량 → DividendRow 계산
  const today = new Date().toISOString().slice(0, 10);
  const autoDividends: {
    id: string; received_at: string; ticker: string; name: string;
    quantity: number; per_share: number; currency: string;
    amount_original: number; amount_krw: number;
    usd_krw_rate: number | null; dividend_type: string; account_id: null;
  }[] = [];

  for (const [ticker, events] of dividendHistoryMap) {
    const info = currentQtyByTicker.get(ticker)!;
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

  // ── 12. 최근 1년 배당 합계 (시뮬 브릿지용) ───────────────────────────────────
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const yearlyDivKrw = Math.round(
    autoDividends
      .filter((d) => d.received_at >= oneYearAgo)
      .reduce((s, d) => s + d.amount_krw, 0),
  );

  // ── 빈 상태: 계좌가 아직 없는 신규 사용자 ──────────────────────────────────
  const isFirstTime = accountList.length === 0;

  if (isFirstTime) {
    return (
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">내 자산</h1>
        </header>

        <div className="rounded-2xl border border-amber-200 bg-gradient-to-b from-amber-50 to-white p-6">
          <div className="mb-6 text-center">
            <span className="text-5xl">🐕</span>
            <h2 className="mt-3 text-lg font-semibold text-neutral-800">
              어서오세요! 자산을 등록해 볼까요?
            </h2>
            <p className="mt-1.5 text-sm text-neutral-500">
              증권사 앱 화면을 캡처하면 AI가 종목·수량·평단가를 자동으로 읽어드려요.
            </p>
          </div>

          {/* 플로우 스텝 */}
          <div className="mb-6 flex items-start gap-0">
            {[
              { step: "1", icon: "🏦", title: "계좌 등록", desc: "증권사·계좌 유형 입력" },
              { step: "2", icon: "📷", title: "화면 캡처", desc: "보유 종목 화면 촬영" },
              { step: "3", icon: "✨", title: "AI 자동 추출", desc: "종목·수량·평단가 완성" },
            ].map((s, i) => (
              <div key={s.step} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500 text-white">
                  <span className="text-lg">{s.icon}</span>
                </div>
                <p className="text-xs font-semibold text-neutral-800">{s.title}</p>
                <p className="text-center text-[11px] text-neutral-500">{s.desc}</p>
                {i < 2 && (
                  <div className="absolute mt-4 hidden" />
                )}
              </div>
            ))}
          </div>

          {/* 화살표를 별도 레이어로 */}
          <div className="relative -mt-16 mb-8 flex items-center justify-around px-10">
            <span className="text-neutral-300 text-lg">→</span>
            <span className="text-neutral-300 text-lg">→</span>
          </div>

          <Link
            href="/assets/upload"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white shadow hover:bg-amber-600 active:scale-95 transition-transform"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            지금 바로 시작하기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 헤더 */}
      <header className="flex items-start justify-between gap-3">
        {/* 타이틀 + 총액 */}
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">내 자산</h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            총{" "}
            <span className="text-lg font-semibold text-neutral-900">
              {fmtKRWShort(totalLiveKrw > 0 ? totalLiveKrw : 0)}
            </span>
          </p>
          <p className="mt-0.5 text-[11px] text-neutral-400">
            Naver/Stooq 최대 15분 지연 · USD/KRW{" "}
            {usdKrw.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}
          </p>
        </div>

        {/* 액션 버튼 */}
        <div className="flex shrink-0 flex-col gap-2">
          <Link
            href="/assets/history"
            className="flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 active:scale-95 transition-transform"
          >
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            히스토리
          </Link>
          <Link
            href="/assets/upload"
            className="flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-amber-500 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-600 active:scale-95 transition-transform"
          >
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
            </svg>
            캡처 등록
          </Link>
        </div>
      </header>

      {/* 분석 탭 (수익 / 배당 / 추이 / 비중) */}
      <AssetsAnalytics
        accounts={enrichedAccounts}
        usdKrw={usdKrw}
        timelinePoints={timelinePoints}
        dividends={autoDividends}
      />

      {/* 뷰 스위처 (계좌별 / 유형별 / 증권사별 / 종목별) */}
      <AssetsViewSwitcher accounts={enrichedAccounts} usdKrw={usdKrw} />

      {/* 시뮬레이터 바로가기 */}
      {totalLiveKrw > 0 && (
        <section className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
          <p className="mb-2.5 text-xs font-medium uppercase tracking-wide text-neutral-500">
            내 자산으로 시뮬레이터 실행
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/sim/fire?currentAssets=${totalLiveKrw}`}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 active:scale-95 transition-transform"
            >
              🎯 FIRE 계산기
            </Link>
            <Link
              href={`/sim/depletion?startAssets=${totalLiveKrw}`}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 active:scale-95 transition-transform"
            >
              📉 자산 고갈 시뮬
            </Link>
            {yearlyDivKrw > 0 && (
              <Link
                href={`/sim/retire-cashflow?dividendYearly=${yearlyDivKrw}`}
                className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 active:scale-95 transition-transform"
              >
                💰 은퇴 현금흐름
              </Link>
            )}
          </div>
          <p className="mt-2 text-[11px] text-neutral-400">
            현재 자산 {fmtKRWShort(totalLiveKrw)}
            {yearlyDivKrw > 0 && ` · 최근 1년 배당 ${fmtKRWShort(yearlyDivKrw)}`}
            을(를) 시뮬 기본값으로 채워줍니다.
          </p>
        </section>
      )}
    </div>
  );
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
    // 라이브 평가금 우선, 없으면 저장된 값 사용 (단 50만원 미만은 OCR 오류로 간주해 0 처리)
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
    .filter((p) => p.total > 0 || p.cost > 0); // 유효한 포인트만
}
