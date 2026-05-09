const HEADERS = { "User-Agent": "Mozilla/5.0" };

/** KRX 6자리 코드 → Naver Finance에서 종목명 조회 */
export async function fetchNaverName(krxCode: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://m.stock.naver.com/api/stock/${krxCode}/basic`,
      { headers: HEADERS, next: { revalidate: 3600 } },
    );
    if (!res.ok) return null;
    const d = await res.json() as { stockName?: string };
    return d.stockName ?? null;
  } catch {
    return null;
  }
}

/** US 티커 → Yahoo Finance에서 종목명 조회 */
export async function fetchYahooName(ticker: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`,
      { headers: HEADERS, next: { revalidate: 3600 } },
    );
    if (!res.ok) return null;
    const d = await res.json() as {
      chart?: { result?: Array<{ meta?: { longName?: string; shortName?: string } }> };
    };
    const meta = d.chart?.result?.[0]?.meta;
    return meta?.longName ?? meta?.shortName ?? null;
  } catch {
    return null;
  }
}
