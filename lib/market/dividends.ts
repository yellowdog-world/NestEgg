/**
 * Yahoo Finance v8 chart API를 사용해 배당 이벤트를 조회합니다.
 * KRX 종목은 {ticker}.KS 심볼로 변환합니다.
 */

const HEADERS = { "User-Agent": "Mozilla/5.0" };
// 배당은 변경 빈도가 낮으므로 30분 캐시
const CACHE = { next: { revalidate: 1800 } } as const;

export interface DividendEvent {
  date: string;        // YYYY-MM-DD
  perShare: number;
  currency: "KRW" | "USD";
}

async function fetchYahooDividends(
  symbol: string,
  period1: number,
  period2: number,
): Promise<DividendEvent[]> {
  try {
    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
      `?events=dividends&period1=${period1}&period2=${period2}&interval=1d`;
    const res = await fetch(url, { ...CACHE, headers: HEADERS });
    if (!res.ok) return [];
    const json = await res.json() as {
      chart?: {
        result?: Array<{
          events?: { dividends?: Record<string, { amount: number; date: number }> };
        }>;
      };
    };
    const rawDivs = json?.chart?.result?.[0]?.events?.dividends;
    if (!rawDivs) return [];
    const currency: "KRW" | "USD" = symbol.endsWith(".KS") ? "KRW" : "USD";
    return Object.values(rawDivs).map((d) => ({
      date: new Date(d.date * 1000).toISOString().slice(0, 10),
      perShare: d.amount,
      currency,
    }));
  } catch {
    return [];
  }
}

/**
 * 여러 티커의 배당 이력을 병렬로 조회합니다.
 * @param items  { ticker, market } 배열
 * @param fromDate  조회 시작일 (YYYY-MM-DD)
 * @returns  Map<ticker, DividendEvent[]>  — 배당이 없는 티커는 포함되지 않음
 */
export async function fetchDividendHistoryBatch(
  items: { ticker: string; market: string }[],
  fromDate: string,
): Promise<Map<string, DividendEvent[]>> {
  if (!items.length) return new Map();

  const period1 = Math.floor(new Date(fromDate).getTime() / 1000);
  const period2 = Math.floor(Date.now() / 1000);

  // 중복 티커 제거
  const unique = Array.from(new Map(items.map((i) => [i.ticker, i])).values());

  const results = await Promise.allSettled(
    unique.map(async ({ ticker, market }) => {
      const symbol = market === "KRX" ? `${ticker}.KS` : ticker;
      const events = await fetchYahooDividends(symbol, period1, period2);
      return { ticker, events };
    }),
  );

  const map = new Map<string, DividendEvent[]>();
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.events.length > 0) {
      map.set(r.value.ticker, r.value.events);
    }
  }
  return map;
}

/**
 * 연간 배당 이벤트 수를 기반으로 배당 유형을 추정합니다.
 */
export function inferDividendType(
  events: DividendEvent[],
): "monthly" | "regular" {
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  const recentCount = events.filter((e) => e.date >= oneYearAgo).length;
  return recentCount >= 10 ? "monthly" : "regular";
}
