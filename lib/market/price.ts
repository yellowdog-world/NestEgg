import { createClient } from "@supabase/supabase-js";
import { MARKET_CACHE } from "./cache-config";

/** 시장 데이터 캐시 전용 클라이언트 — 유저 세션 불필요, service role로 직접 접근 */
function getCacheClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const NAVER_STOCK_BASE = "https://m.stock.naver.com/api/stock";
const STOOQ_QUOTE = "https://stooq.com/q/l/";

const HEADERS = { "User-Agent": "Mozilla/5.0" };

export interface PriceResult {
  ticker: string;
  price: number;
  prevClose: number;
  change: number;
  changePercent: number;
  currency: string;
}

function parseKrNum(s: string | undefined): number {
  if (!s) return 0;
  return parseFloat(String(s).replace(/,/g, ""));
}

// 네이버 금융 — KRX 6자리 종목코드
async function fetchNaver(code: string): Promise<PriceResult | null> {
  try {
    const res = await fetch(`${NAVER_STOCK_BASE}/${code}/basic`, {
      headers: HEADERS,
      next: { revalidate: 0 },  // DB 캐시 사용하므로 Next.js fetch 캐시 비활성화
    });
    if (!res.ok) return null;
    const d = await res.json();
    if (!d.closePrice) return null;

    const price = parseKrNum(d.closePrice);
    const change = parseKrNum(d.compareToPreviousClosePrice);
    const changePercent = parseFloat(String(d.fluctuationsRatio ?? "0"));

    return {
      ticker: code,
      price,
      prevClose: price - change,
      change,
      changePercent,
      currency: "KRW",
    };
  } catch {
    return null;
  }
}

// Stooq JSON에는 volume이 빈 값으로 오는 경우가 있어 파싱 전 정제 필요
async function stooqFetch(symbol: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(
      `${STOOQ_QUOTE}?s=${symbol}&f=sd2t2ohlcvn&e=json`,
      { headers: HEADERS, next: { revalidate: 0 } },
    );
    if (!res.ok) return null;
    const text = await res.text();
    const sanitized = text.replace(/:\s*,/g, ":null,").replace(/:\s*}/g, ":null}");
    const json = JSON.parse(sanitized);
    return (json?.symbols?.[0] as Record<string, unknown>) ?? null;
  } catch {
    return null;
  }
}

// Stooq — 미국 주식/ETF (심볼.US 형식)
async function fetchStooqUS(ticker: string): Promise<PriceResult | null> {
  const q = await stooqFetch(`${ticker.toLowerCase()}.us`);
  const price = q?.close as number | undefined;
  if (!price) return null;

  const open = (q?.open as number | undefined) ?? price;
  return {
    ticker,
    price,
    prevClose: open,
    change: price - open,
    changePercent: open ? ((price - open) / open) * 100 : 0,
    currency: "USD",
  };
}

// Stooq — USD/KRW 환율
async function fetchStooqUsdKrw(): Promise<PriceResult | null> {
  const q = await stooqFetch("usdkrw");
  const price = q?.close as number | undefined;
  if (!price) return null;

  const open = (q?.open as number | undefined) ?? price;
  return {
    ticker: "USDKRW=X",
    price,
    prevClose: open,
    change: price - open,
    changePercent: open ? ((price - open) / open) * 100 : 0,
    currency: "KRW",
  };
}

/** 외부 API 직접 호출 (캐시 없음) — 내부 구현용 */
async function fetchFromExternalApis(
  items: { ticker: string; market: string }[],
): Promise<Map<string, PriceResult>> {
  const results = await Promise.allSettled(
    items.map(async (item) => {
      if (item.market === "KRX") return fetchNaver(item.ticker);
      if (item.market === "FOREX") return fetchStooqUsdKrw();
      return fetchStooqUS(item.ticker);
    }),
  );

  const map = new Map<string, PriceResult>();
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled" && r.value) {
      map.set(items[i].ticker, r.value);
    }
  }
  return map;
}

export function toYahooSymbol(ticker: string, market: string): string {
  if (market === "KRX") return `${ticker}.KS`;
  return ticker;
}

/**
 * 종목 시세 일괄 조회.
 *
 * 내부적으로 DB 캐시(TTL: MARKET_CACHE.PRICE_TTL_SECONDS)를 사용합니다.
 * - 캐시 히트: DB 조회(~30ms)만으로 반환
 * - 캐시 미스: 외부 API(Naver/Stooq) 호출 후 DB에 저장 → 다음 요청자도 공유
 */
export async function fetchPriceMap(
  items: { ticker: string; market: string }[],
): Promise<Map<string, PriceResult>> {
  if (!items.length) return new Map();

  const unique = Array.from(
    new Map(items.map((i) => [`${i.ticker}:${i.market}`, i])).values(),
  );

  // 캐시 클라이언트 초기화 실패 시 외부 API 직접 조회로 폴백
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return fetchFromExternalApis(unique);
  }
  const db = getCacheClient();

  // ── DB 캐시 조회 ────────────────────────────────────────────────────────
  const cutoff = new Date(Date.now() - MARKET_CACHE.PRICE_TTL_SECONDS * 1000).toISOString();
  const { data: cached } = await db
    .from("market_price_cache")
    .select("ticker, market, price, prev_close, change_val, change_percent, currency")
    .in("ticker", unique.map((i) => i.ticker))
    .gte("fetched_at", cutoff);

  const result = new Map<string, PriceResult>();
  for (const c of cached ?? []) {
    result.set(c.ticker, {
      ticker: c.ticker,
      price: Number(c.price),
      prevClose: Number(c.prev_close ?? c.price),
      change: Number(c.change_val ?? 0),
      changePercent: Number(c.change_percent ?? 0),
      currency: c.currency,
    });
  }

  // ── 캐시 미스 항목 외부 API 조회 ────────────────────────────────────────
  const stale = unique.filter((i) => !result.has(i.ticker));
  if (stale.length > 0) {
    const fresh = await fetchFromExternalApis(stale);

    const rows = [...fresh.entries()].map(([, r]) => ({
      ticker: r.ticker,
      market: stale.find((i) => i.ticker === r.ticker)?.market ?? "KRX",
      price: r.price,
      prev_close: r.prevClose,
      change_val: r.change,
      change_percent: r.changePercent,
      currency: r.currency,
      fetched_at: new Date().toISOString(),
    }));

    if (rows.length) {
      await db.from("market_price_cache").upsert(rows, { onConflict: "ticker,market" });
    }

    for (const [ticker, r] of fresh) result.set(ticker, r);
  }

  return result;
}

export async function fetchUsdKrwRate(): Promise<number> {
  const r = await fetchStooqUsdKrw();
  return r?.price ?? 1380;
}
