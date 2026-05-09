const NAVER_STOCK_BASE = "https://m.stock.naver.com/api/stock";
const STOOQ_QUOTE = "https://stooq.com/q/l/";

const HEADERS = { "User-Agent": "Mozilla/5.0" };
const CACHE = { next: { revalidate: 900 } } as const; // 15분

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
      ...CACHE,
      headers: HEADERS,
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
      { ...CACHE, headers: HEADERS },
    );
    if (!res.ok) return null;
    const text = await res.text();
    // "volume":, 처럼 값이 없는 필드를 null로 교체
    const sanitized = text.replace(/:\s*,/g, ":null,").replace(/:\s*}/g, ":null}");
    const json = JSON.parse(sanitized);
    return (json?.symbols?.[0] as Record<string, unknown>) ?? null;
  } catch {
    return null;
  }
}

// Stooq — 미국 주식/ETF  (심볼.US 형식)
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

export function toYahooSymbol(ticker: string, market: string): string {
  if (market === "KRX") return `${ticker}.KS`;
  return ticker;
}

export async function fetchPriceMap(
  items: { ticker: string; market: string }[],
): Promise<Map<string, PriceResult>> {
  if (!items.length) return new Map();

  const unique = Array.from(
    new Map(items.map((i) => [`${i.ticker}:${i.market}`, i])).values(),
  );

  const results = await Promise.allSettled(
    unique.map(async (item) => {
      if (item.market === "KRX") return fetchNaver(item.ticker);
      if (item.market === "FOREX") return fetchStooqUsdKrw();
      return fetchStooqUS(item.ticker);
    }),
  );

  const map = new Map<string, PriceResult>();
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled" && r.value) {
      map.set(unique[i].ticker, r.value);
    }
  }
  return map;
}

export async function fetchUsdKrwRate(): Promise<number> {
  const r = await fetchStooqUsdKrw();
  return r?.price ?? 1380;
}
