/**
 * Yahoo Finance v8 chart API를 사용해 배당 이벤트를 조회합니다.
 * KRX 종목은 {ticker}.KS 심볼로 변환합니다.
 */

import { createClient } from "@supabase/supabase-js";
import { MARKET_CACHE } from "./cache-config";

/** 배당 데이터 캐시 전용 클라이언트 — 유저 세션 불필요, service role로 직접 접근 */
function getCacheClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const HEADERS = { "User-Agent": "Mozilla/5.0" };

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
    const res = await fetch(url, {
      headers: HEADERS,
      next: { revalidate: 0 },  // DB 캐시 사용하므로 Next.js fetch 캐시 비활성화
    });
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
 *
 * 내부적으로 DB 캐시(TTL: MARKET_CACHE.DIVIDEND_TTL_SECONDS)를 사용합니다.
 * - 캐시 히트: DB 조회만으로 반환
 * - 캐시 미스: Yahoo Finance 호출 후 DB 저장 → 다음 요청자도 공유
 *
 * @param items     { ticker, market } 배열
 * @param fromDate  조회 시작일 (YYYY-MM-DD) — 캐시 미스 시 외부 API 호출에만 사용
 */
export async function fetchDividendHistoryBatch(
  items: { ticker: string; market: string }[],
  fromDate: string,
): Promise<Map<string, DividendEvent[]>> {
  if (!items.length) return new Map();

  const unique = Array.from(new Map(items.map((i) => [i.ticker, i])).values());

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return fetchDividendsFromYahoo(unique, fromDate);
  }
  const db = getCacheClient();

  // ── DB 캐시 조회 ────────────────────────────────────────────────────────
  const cutoff = new Date(Date.now() - MARKET_CACHE.DIVIDEND_TTL_SECONDS * 1000).toISOString();
  const { data: cached } = await db
    .from("market_dividend_cache")
    .select("ticker, events")
    .in("ticker", unique.map((i) => i.ticker))
    .gte("fetched_at", cutoff);

  const result = new Map<string, DividendEvent[]>();
  for (const c of cached ?? []) {
    const events = (c.events as DividendEvent[]) ?? [];
    if (events.length > 0) result.set(c.ticker, events);
  }

  // ── 캐시 미스 항목 Yahoo Finance 조회 ───────────────────────────────────
  const stale = unique.filter((i) => !result.has(i.ticker));
  if (stale.length > 0) {
    const fresh = await fetchDividendsFromYahoo(stale, fromDate);

    // 배당 없는 종목도 빈 배열로 저장 → TTL 만료 전까지 Yahoo 재조회 방지
    const rows = stale.map((item) => ({
      ticker: item.ticker,
      events: fresh.get(item.ticker) ?? [],
      fetched_at: new Date().toISOString(),
    }));

    await db.from("market_dividend_cache").upsert(rows, { onConflict: "ticker" });

    for (const [ticker, events] of fresh) result.set(ticker, events);
  }

  return result;
}

/** Yahoo Finance 직접 호출 (내부 구현용) */
async function fetchDividendsFromYahoo(
  items: { ticker: string; market: string }[],
  fromDate: string,
): Promise<Map<string, DividendEvent[]>> {
  const period1 = Math.floor(new Date(fromDate).getTime() / 1000);
  const period2 = Math.floor(Date.now() / 1000);

  const results = await Promise.allSettled(
    items.map(async ({ ticker, market }) => {
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
