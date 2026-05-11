// 보유 종목 → 전략 카테고리 분류
// 우선순위: 현금 → 커버드콜 → 미국나스닥 → 미국S&P → 배당주 → 미국직투 → 한국직투

export type AssetCategory =
  | "현금"
  | "커버드콜"
  | "미국나스닥"
  | "미국S&P"
  | "배당주"
  | "미국직투"
  | "한국직투";

export const ALL_CATEGORIES: AssetCategory[] = [
  "미국나스닥",
  "미국S&P",
  "배당주",
  "커버드콜",
  "미국직투",
  "한국직투",
  "현금",
];

export const CATEGORY_META: Record<
  AssetCategory,
  { label: string; color: string; order: number }
> = {
  "미국나스닥": { label: "미국나스닥", color: "#6366f1", order: 0 },
  "미국S&P":    { label: "미국S&P",   color: "#3b82f6", order: 1 },
  "배당주":     { label: "배당주",    color: "#f59e0b", order: 2 },
  "커버드콜":   { label: "커버드콜",  color: "#10b981", order: 3 },
  "미국직투":   { label: "미국직투",  color: "#8b5cf6", order: 4 },
  "한국직투":   { label: "한국직투",  color: "#ef4444", order: 5 },
  "현금":       { label: "현금",      color: "#9ca3af", order: 6 },
};

// ── 티커별 고정 분류 (이름 패턴보다 우선) ─────────────────────────────────

const COVERED_CALL_TICKERS = new Set([
  "JEPI", "JEPQ", "QYLD", "XYLD", "RYLD", "DIVO", "NUSI",
]);

const NASDAQ_TICKERS = new Set([
  "QQQ", "QLD", "TQQQ", "SQQQ", "ONEQ", "QQQM",
]);

const SP500_TICKERS = new Set([
  "VOO", "SPY", "IVV", "VTI", "UPRO", "SPXL", "SSO", "RSP", "CSPX",
]);

const DIVIDEND_TICKERS = new Set([
  "SCHD", "VIG", "VYM", "DVY", "HDV", "DGRO", "SDY",
]);

// ── 분류 함수 ──────────────────────────────────────────────────────────────

/**
 * 보유 종목 하나를 7개 카테고리 중 하나로 분류합니다.
 *
 * @param rawName  OCR/수동 입력 원문 종목명 (예: "KODEX 미국배당커버드콜")
 * @param ticker   해결된 티커 심볼 (예: "441640", "SCHD") — null 가능
 * @param market   시장 코드 ("KRX" | "NASDAQ" | "NYSE" | "AMEX" | "FOREX") — null 가능
 */
export function classifyHolding(
  rawName: string,
  ticker: string | null,
  market: string | null,
): AssetCategory {
  const name = rawName.toLowerCase();
  const t = (ticker ?? "").toUpperCase();

  // ① 현금 — 예수금, 파킹, CMA, MMF 등
  if (
    /예수금|현금|보통예금|파킹|cma|mmf/.test(name) ||
    name === "cash" ||
    name === "d+1" ||
    name.startsWith("예수")
  )
    return "현금";

  // ② 커버드콜 — "배당커버드콜", "성장커버드콜", JEPI 등
  //    배당주보다 먼저 판단: "미국배당커버드콜"은 커버드콜로 분류
  if (
    /커버드콜|커버드\s*콜|covered.?call|프리미엄.*옵션|옵션.*프리미엄/.test(name) ||
    COVERED_CALL_TICKERS.has(t)
  )
    return "커버드콜";

  // ③ 미국나스닥
  if (/나스닥|nasdaq/.test(name) || NASDAQ_TICKERS.has(t)) return "미국나스닥";

  // ④ 미국S&P — "(H)" 헤지형 포함
  if (/s&p|s\.p\.500|sp500/.test(name) || SP500_TICKERS.has(t)) return "미국S&P";

  // ⑤ 배당주 — 다우존스 배당 ETF, SCHD 등
  if (
    /배당|다우존스|dividend/.test(name) ||
    DIVIDEND_TICKERS.has(t)
  )
    return "배당주";

  // ⑥ 미국직투 — 미국 거래소 상장 종목 (ETF·개별주 모두)
  if (market && ["NASDAQ", "NYSE", "AMEX"].includes(market)) return "미국직투";

  // ⑦ 한국직투 — 그 외 (KRX 개별주, 미분류 KRX ETF 등)
  return "한국직투";
}

// ── 집계 헬퍼 ─────────────────────────────────────────────────────────────

export type CategoryBreakdown = Record<AssetCategory, number>;

export function emptyCategoryBreakdown(): CategoryBreakdown {
  return Object.fromEntries(ALL_CATEGORIES.map((c) => [c, 0])) as CategoryBreakdown;
}

/** holdings 배열 → 카테고리별 원화 합산 */
export function aggregateByCategory(
  holdings: Array<{
    raw_name: string;
    ticker?: string | null;
    market?: string | null;
    eval_krw: number;
  }>,
): CategoryBreakdown {
  const result = emptyCategoryBreakdown();
  for (const h of holdings) {
    const cat = classifyHolding(h.raw_name, h.ticker ?? null, h.market ?? null);
    result[cat] += h.eval_krw;
  }
  // 소수점 제거
  for (const k of ALL_CATEGORIES) result[k] = Math.round(result[k]);
  return result;
}
