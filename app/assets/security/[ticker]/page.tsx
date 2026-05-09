import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BackButton } from "./BackButton";
import { fetchPriceMap, fetchUsdKrwRate } from "@/lib/market/price";
import { deriveTickerInfo, lookupByTicker } from "@/lib/market/ticker-map";
import { fmtKRW, fmtUSD, fmtKRWShort, fmtNum } from "@/lib/utils/format";

const ACCOUNT_LABEL: Record<string, string> = {
  pension_fund: "연저펀",
  isa: "ISA",
  irp: "IRP",
  regular: "일반계좌",
  corp: "법인",
  bank: "은행",
  overseas: "해외증권",
};

const TYPE_COLOR: Record<string, string> = {
  pension_fund: "bg-violet-100 text-violet-700",
  isa: "bg-blue-100 text-blue-700",
  irp: "bg-indigo-100 text-indigo-700",
  regular: "bg-neutral-100 text-neutral-600",
  corp: "bg-orange-100 text-orange-700",
  bank: "bg-green-100 text-green-700",
  overseas: "bg-sky-100 text-sky-700",
};

export default async function SecurityDetailPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = await params;
  const decodedTicker = decodeURIComponent(ticker);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return notFound();

  // 이 종목을 보유한 모든 계좌의 최신 스냅샷 holdings 조회
  const { data: rows } = await supabase
    .from("holdings")
    .select(`
      id, raw_name, quantity, avg_price, currency,
      snapshot_id,
      snapshots!inner(id, captured_at, status, account_id,
        accounts(id, broker, nickname, type))
    `)
    .eq("security_ticker", decodedTicker)
    .eq("snapshots.user_id", user.id)
    .order("created_at", { ascending: false });

  if (!rows || rows.length === 0) return notFound();

  // 계좌별 최신 스냅샷만 추출 (같은 계좌의 중복 스냅샷 제거)
  const latestByAccount = new Map<string, typeof rows[number]>();
  for (const r of rows) {
    const snap = r.snapshots as unknown as {
      id: string; captured_at: string; status: string; account_id: string;
      accounts: { id: string; broker: string | null; nickname: string | null; type: string } | null;
    };
    const acctId = snap?.account_id;
    if (!acctId) continue;
    if (!latestByAccount.has(acctId)) latestByAccount.set(acctId, r);
  }
  const holdings = [...latestByAccount.values()];
  if (holdings.length === 0) return notFound();

  // 시세·환율 조회
  const tickerInfo = deriveTickerInfo(decodedTicker);
  const market = tickerInfo?.market ?? "KRX";
  const [priceMap, usdKrw] = await Promise.all([
    fetchPriceMap([{ ticker: decodedTicker, market }]),
    fetchUsdKrwRate(),
  ]);
  const live = priceMap.get(decodedTicker);
  const isUsd = tickerInfo?.currency === "USD";

  // 합산 계산
  let totalQty = 0;
  let totalCostKrw = 0;
  let totalCostOrig = 0; // 원화이면 KRW, 달러이면 USD
  for (const h of holdings) {
    const qty = Number(h.quantity);
    const avgP = h.avg_price != null ? Number(h.avg_price) : 0;
    totalQty += qty;
    const costKrw = isUsd ? qty * avgP * usdKrw : qty * avgP;
    totalCostKrw += costKrw;
    totalCostOrig += qty * avgP;
  }

  const totalEvalOrig = live ? totalQty * live.price : null;
  const totalEvalKrw = totalEvalOrig != null
    ? (isUsd ? totalEvalOrig * usdKrw : totalEvalOrig)
    : null;

  const gainKrw = totalEvalKrw != null ? totalEvalKrw - totalCostKrw : null;
  const gainPct = gainKrw != null && totalCostKrw > 0 ? (gainKrw / totalCostKrw) * 100 : null;

  const dailyGainOrig = live && totalQty > 0 ? totalQty * live.change : null;
  const dailyGainKrw = dailyGainOrig != null ? (isUsd ? dailyGainOrig * usdKrw : dailyGainOrig) : null;

  const weightedAvgOrig = totalQty > 0 ? totalCostOrig / totalQty : null;

  // 종목 이름
  const nameFromMap = lookupByTicker(decodedTicker)?.name;
  const nameFromDb = holdings[0]?.raw_name;
  const displayName = nameFromMap ?? nameFromDb ?? decodedTicker;

  const pos = (gainPct ?? 0) >= 0;
  const dailyPos = (live?.changePercent ?? 0) >= 0;

  return (
    <div className="flex flex-col gap-0">
      {/* 헤더 */}
      <div className="mb-5">
        <BackButton />
      </div>

      {/* 종목 타이틀 */}
      <div className="mb-5">
        <p className="text-base text-neutral-500 leading-snug">{displayName}</p>
        <div className="mt-0.5 flex items-center gap-2.5">
          <span className="font-mono text-2xl font-bold text-neutral-900">{decodedTicker}</span>
          {live && (
            <span className={`text-base font-semibold tabular-nums ${dailyPos ? "text-red-500" : "text-blue-500"}`}>
              {isUsd ? `$${live.price.toFixed(2)}` : fmtKRWShort(live.price)}
              {" "}({dailyPos ? "+" : ""}{live.changePercent.toFixed(2)}%)
            </span>
          )}
        </div>
      </div>

      {/* 평가금액 카드 */}
      <div className="rounded-2xl bg-neutral-900 px-5 py-5 text-white mb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-neutral-400 mb-1">총 평가금액</p>
            <p className="text-3xl font-bold tabular-nums leading-tight">
              {totalEvalOrig != null
                ? (isUsd ? fmtUSD(totalEvalOrig) : fmtKRW(totalEvalOrig))
                : "—"}
            </p>
            {isUsd && totalEvalKrw != null && (
              <p className="mt-0.5 text-sm text-neutral-400 tabular-nums">
                {fmtKRWShort(totalEvalKrw)}
              </p>
            )}
          </div>
          <span className="rounded-lg bg-neutral-700 px-3 py-1 text-sm font-medium text-neutral-300">
            {isUsd ? "USD" : "KRW"}
          </span>
        </div>
        <p className="mt-2 text-sm text-neutral-400 tabular-nums">
          원금 {isUsd ? fmtUSD(totalCostOrig) : fmtKRWShort(totalCostKrw)}
        </p>

        {/* 보유량 / 평단가 */}
        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-neutral-700 pt-4">
          <div>
            <p className="text-sm text-neutral-400">보유량</p>
            <p className="mt-0.5 text-xl font-bold tabular-nums">
              {fmtNum(totalQty)}주
            </p>
          </div>
          <div>
            <p className="text-sm text-neutral-400">평단가</p>
            <p className="mt-0.5 text-xl font-bold tabular-nums">
              {weightedAvgOrig != null
                ? (isUsd
                    ? `$${weightedAvgOrig.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : fmtKRWShort(weightedAvgOrig))
                : "—"}
            </p>
          </div>
        </div>
      </div>

      {/* 수익 정보 */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {/* 총 수익 */}
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-4">
          <p className="text-sm text-neutral-500">총 수익</p>
          {gainKrw != null ? (
            <>
              <p className={`mt-1 text-xl font-bold tabular-nums leading-tight ${pos ? "text-red-500" : "text-blue-500"}`}>
                {isUsd
                  ? (pos ? "+" : "") + fmtUSD(gainKrw / usdKrw)
                  : (pos ? "+" : "") + fmtKRWShort(gainKrw)}
              </p>
              {gainPct != null && (
                <p className={`text-base font-semibold tabular-nums ${pos ? "text-red-500" : "text-blue-500"}`}>
                  {pos ? "+" : ""}{gainPct.toFixed(2)}%
                </p>
              )}
            </>
          ) : (
            <p className="mt-1 text-xl text-neutral-300">—</p>
          )}
        </div>

        {/* 일간 수익 */}
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-4">
          <p className="text-sm text-neutral-500">일간 수익</p>
          {dailyGainOrig != null ? (
            <>
              <p className={`mt-1 text-xl font-bold tabular-nums leading-tight ${dailyPos ? "text-red-500" : "text-blue-500"}`}>
                {isUsd
                  ? (dailyPos ? "+" : "") + fmtUSD(dailyGainOrig)
                  : (dailyPos ? "+" : "") + fmtKRWShort(dailyGainKrw ?? 0)}
              </p>
              {live && (
                <p className={`text-base font-semibold tabular-nums ${dailyPos ? "text-red-500" : "text-blue-500"}`}>
                  {dailyPos ? "+" : ""}{live.changePercent.toFixed(2)}%
                </p>
              )}
            </>
          ) : (
            <p className="mt-1 text-xl text-neutral-300">—</p>
          )}
        </div>
      </div>

      {/* 계좌별 보유 */}
      <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
        <div className="border-b border-neutral-100 px-4 py-3">
          <h2 className="text-base font-semibold text-neutral-800">{holdings.length}개 계좌 보유</h2>
        </div>
        <div className="divide-y divide-neutral-50">
          {holdings.map((h) => {
            const snap = h.snapshots as unknown as {
              captured_at: string;
              accounts: { broker: string | null; nickname: string | null; type: string } | null;
            };
            const acct = snap?.accounts;
            const broker = acct?.broker ?? "—";
            const nickname = acct?.nickname;
            const acctType = acct?.type ?? "";
            const qty = Number(h.quantity);
            const avgP = h.avg_price != null ? Number(h.avg_price) : null;
            const evalOrig = live ? qty * live.price : null;
            const evalKrw = evalOrig != null ? (isUsd ? evalOrig * usdKrw : evalOrig) : null;
            const costKrw = avgP != null ? (isUsd ? qty * avgP * usdKrw : qty * avgP) : null;
            const acctGain = evalKrw != null && costKrw != null ? evalKrw - costKrw : null;
            const acctGainPct = acctGain != null && costKrw != null && costKrw > 0
              ? (acctGain / costKrw) * 100
              : null;
            const acctPos = (acctGainPct ?? 0) >= 0;

            return (
              <div key={h.id} className="flex items-center justify-between gap-3 px-4 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_COLOR[acctType] ?? "bg-neutral-100 text-neutral-600"}`}>
                      {ACCOUNT_LABEL[acctType] ?? acctType}
                    </span>
                    <span className="text-base font-medium text-neutral-800">{broker}</span>
                    {nickname && <span className="text-sm text-neutral-500">{nickname}</span>}
                  </div>
                  <p className="mt-1 text-sm text-neutral-500 tabular-nums">
                    {fmtNum(qty)}주
                    {avgP != null && (
                      <span className="ml-2">
                        · 평단 {isUsd
                          ? `$${avgP.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : fmtKRWShort(avgP)}
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-base font-bold tabular-nums text-neutral-900">
                    {evalOrig != null
                      ? (isUsd ? fmtUSD(evalOrig) : fmtKRWShort(evalOrig))
                      : "—"}
                  </p>
                  {acctGainPct != null && (
                    <p className={`text-sm font-semibold tabular-nums ${acctPos ? "text-red-500" : "text-blue-500"}`}>
                      {acctGain != null && (isUsd
                        ? (acctPos ? "+" : "") + fmtUSD(acctGain / usdKrw)
                        : (acctPos ? "+" : "") + fmtKRWShort(acctGain)
                      )}{" "}
                      ({acctPos ? "+" : ""}{acctGainPct.toFixed(1)}%)
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

