import type { SupabaseClient } from "@supabase/supabase-js";
import { lookupTicker, deriveTickerInfo } from "./ticker-map";
import { fetchNaverName, fetchYahooName } from "./external-apis";

/**
 * raw_name (또는 OCR 티커)으로 securities 행을 찾거나 생성하고
 * { ticker, market } 을 반환. 매핑 불가능한 경우 null.
 */
export async function resolveSecurity(
  supabase: SupabaseClient,
  rawName: string,
  ocrTicker?: string | null,
): Promise<{ ticker: string; market: string } | null> {
  const nameInfo = lookupTicker(rawName);
  const ocrInfo = ocrTicker ? lookupTicker(ocrTicker) ?? deriveTickerInfo(ocrTicker) : null;
  const info = nameInfo ?? ocrInfo;

  // 정적 맵 미스 → DB 이름 검색 fallback (시딩된 ETF/종목 자동 매핑)
  if (!info) {
    const byName = await lookupByDbName(supabase, rawName);
    if (byName) return byName;
    return null;
  }

  const { data: existing } = await supabase
    .from("securities")
    .select("ticker, market")
    .eq("ticker", info.ticker)
    .eq("market", info.market)
    .maybeSingle();

  if (existing) return { ticker: existing.ticker, market: existing.market };

  // rawName이 티커 심볼 그대로이거나 비어 있으면 외부 API로 정식 이름 조회
  const name = await resolveName(rawName, info.ticker, info.market);

  const { error } = await supabase.from("securities").insert({
    ticker: info.ticker,
    market: info.market,
    name,
    currency: info.currency,
  });

  if (error) return null;
  return { ticker: info.ticker, market: info.market };
}

/**
 * securities 테이블에서 이름으로 검색.
 * 1) 정확한 이름 매치
 * 2) OCR 이름이 DB 이름의 확장형인 경우 ("KODEX X액티브" ↔ "KODEX X")
 *    — DB 이름 8자 이상 + OCR 이름이 DB 이름으로 시작하거나 그 반대
 */
async function lookupByDbName(
  supabase: SupabaseClient,
  rawName: string,
): Promise<{ ticker: string; market: string } | null> {
  const name = rawName.trim();
  if (name.length < 3) return null;

  // 1. 정확 매치
  const { data: exact } = await supabase
    .from("securities")
    .select("ticker, market")
    .eq("name", name)
    .limit(1)
    .maybeSingle();
  if (exact) return { ticker: exact.ticker, market: exact.market };

  // 2. 앞 8자로 후보군 조회 후 prefix 방향 매치
  if (name.length >= 6) {
    const prefix = name.slice(0, 8);
    const { data: candidates } = await supabase
      .from("securities")
      .select("ticker, market, name")
      .ilike("name", `${prefix}%`)
      .limit(20);

    if (candidates) {
      for (const c of candidates) {
        const shorter = c.name.length <= name.length ? c.name : name;
        const longer  = c.name.length <= name.length ? name   : c.name;
        // 짧은 쪽이 긴 쪽의 접두어이고, 짧은 쪽이 8자 이상이어야 인정
        if (shorter.length >= 8 && longer.startsWith(shorter)) {
          return { ticker: c.ticker, market: c.market };
        }
      }
    }
  }

  return null;
}

async function resolveName(rawName: string, ticker: string, market: string): Promise<string> {
  const cleaned = rawName.trim();
  const looksLikeSymbol =
    cleaned === "" || cleaned === ticker || /^[A-Z0-9]{1,6}$/.test(cleaned);

  if (!looksLikeSymbol) return cleaned;

  if (market === "KRX") {
    return (await fetchNaverName(ticker)) ?? (cleaned || ticker);
  }
  return (await fetchYahooName(ticker)) ?? (cleaned || ticker);
}
