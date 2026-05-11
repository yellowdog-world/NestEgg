import type { SupabaseClient } from "@supabase/supabase-js";
import { lookupTicker, deriveTickerInfo } from "./ticker-map";
import { fetchNaverName, fetchYahooName } from "./external-apis";
import { fetchPriceMap } from "./price";

/**
 * raw_name (또는 OCR 티커)으로 securities 행을 찾거나 생성하고
 * { ticker, market, name } 을 반환. 매핑 불가능한 경우 null.
 *
 * name 필드: DB에 있는 정식 종목명. 호출자가 raw_name 정정에 사용.
 */
export async function resolveSecurity(
  supabase: SupabaseClient,
  rawName: string,
  ocrTicker?: string | null,
): Promise<{ ticker: string; market: string; name: string | null } | null> {
  const ocrInfo = ocrTicker ? lookupTicker(ocrTicker) ?? deriveTickerInfo(ocrTicker) : null;
  const nameInfo = lookupTicker(rawName);
  // 명시적으로 입력된 티커(ocrTicker)를 이름 기반 추론보다 우선
  // — 사용자가 직접 수정한 티커가 정적 맵의 fuzzy 매칭보다 신뢰도 높음
  const info = ocrInfo ?? nameInfo;

  // 정적 맵 미스 → DB 이름 검색 fallback (시딩된 ETF/종목 자동 매핑)
  if (!info) {
    const byName = await lookupByDbName(supabase, rawName);
    if (byName) return { ...byName, name: null };
    return null;
  }

  const { data: existing } = await supabase
    .from("securities")
    .select("ticker, market, name")
    .eq("ticker", info.ticker)
    .eq("market", info.market)
    .maybeSingle();

  if (existing) return { ticker: existing.ticker, market: existing.market, name: existing.name ?? null };

  // rawName이 티커 심볼 그대로이거나 비어 있으면 외부 API로 정식 이름 조회
  const canonicalName = await resolveName(rawName, info.ticker, info.market);

  const { error } = await supabase.from("securities").insert({
    ticker: info.ticker,
    market: info.market,
    name: canonicalName,
    currency: info.currency,
  });

  if (error) return null;
  return { ticker: info.ticker, market: info.market, name: canonicalName };
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
  //    여러 후보 중 가장 짧은(= OCR 이름과 가장 근접한) 것을 선택
  if (name.length >= 6) {
    const prefix = name.slice(0, 8);
    const { data: candidates } = await supabase
      .from("securities")
      .select("ticker, market, name")
      .ilike("name", `${prefix}%`)
      .limit(50);

    if (candidates) {
      let best: { ticker: string; market: string } | null = null;
      let bestLen = Infinity;

      for (const c of candidates) {
        const shorter = c.name.length <= name.length ? c.name : name;
        const longer  = c.name.length <= name.length ? name   : c.name;
        // 짧은 쪽이 긴 쪽의 접두어이고, 짧은 쪽이 8자 이상이어야 인정
        if (shorter.length >= 8 && longer.startsWith(shorter)) {
          // 후보 중 DB name이 가장 짧은(= 질의와 가장 가까운) 것 선택
          if (c.name.length < bestLen) {
            bestLen = c.name.length;
            best = { ticker: c.ticker, market: c.market };
          }
        }
      }

      if (best) return best;
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

// ── 이름 기반 securities 다중 후보 조회 ─────────────────────────────────────────

async function findCandidatesByName(
  supabase: SupabaseClient,
  rawName: string,
): Promise<{ ticker: string; market: string }[]> {
  const name = rawName.trim();
  if (name.length < 2) return [];

  // 1. 정확 매치
  const { data: exact } = await supabase
    .from("securities")
    .select("ticker, market")
    .eq("name", name)
    .limit(10);
  if (exact?.length) return exact;

  // 2. 접두어 유사 매치 (6자 이상)
  if (name.length >= 6) {
    const prefix = name.slice(0, 8);
    const { data: candidates } = await supabase
      .from("securities")
      .select("ticker, market, name")
      .ilike("name", `${prefix}%`)
      .limit(20);

    if (candidates?.length) {
      // 짧은 쪽이 긴 쪽의 접두어인 경우만 (6자 이상)
      return candidates.filter((c) => {
        const shorter = c.name.length <= name.length ? c.name : name;
        const longer  = c.name.length <= name.length ? name   : c.name;
        return shorter.length >= 6 && longer.startsWith(shorter);
      });
    }
  }

  return [];
}

/**
 * OCR 종목명과 인식된 현재가(market_price)를 기반으로 ticker를 결정한다.
 *
 * 우선순위:
 * 1. 정적 맵 직접 매치 (가장 빠름)
 * 2. securities 테이블에서 이름 조회
 *    - 후보 1개 → 그대로 사용
 *    - 후보 여러 개 + market_price 있음 → 실시간 시세를 조회해 가장 가까운 종목 선택
 *    - 후보 여러 개 + market_price 없음 → 첫 번째 후보
 * 3. 매핑 불가 → null
 */
export async function resolveTickerByPrice(
  supabase: SupabaseClient,
  rawName: string,
  marketPrice: number | null | undefined,
): Promise<string | null> {
  // 1. 정적 맵 우선
  const staticHit = lookupTicker(rawName);
  if (staticHit?.ticker) return staticHit.ticker;

  // 2. DB 후보 조회
  const candidates = await findCandidatesByName(supabase, rawName);
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0].ticker;

  // 3. 후보 여러 개 → 시세 비교
  if (!marketPrice) return candidates[0].ticker;

  const priceMap = await fetchPriceMap(candidates);
  let bestTicker = candidates[0].ticker;
  let bestDiff = Infinity;

  for (const c of candidates) {
    const live = priceMap.get(c.ticker);
    if (!live?.price) continue;
    const diff = Math.abs(live.price - marketPrice);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestTicker = c.ticker;
    }
  }

  return bestTicker;
}
