export interface TickerInfo {
  ticker: string;
  market: "KRX" | "NASDAQ" | "NYSE" | "AMEX" | "FOREX";
  currency: "KRW" | "USD";
}

// KRX 상장 ETF: 6자리 코드
// 미국 직접투자 종목: 심볼 그대로
const RAW_MAP: Record<string, TickerInfo> = {
  // ── KODEX ──────────────────────────────────────────
  "KODEX 200": { ticker: "069500", market: "KRX", currency: "KRW" },
  "KODEX 미국S&P500": { ticker: "379800", market: "KRX", currency: "KRW" },
  "KODEX 미국S&P500TR": { ticker: "453850", market: "KRX", currency: "KRW" },
  "KODEX 미국나스닥100": { ticker: "379810", market: "KRX", currency: "KRW" },
  "KODEX 미국나스닥100TR": { ticker: "437080", market: "KRX", currency: "KRW" },
  "KODEX 레버리지": { ticker: "122630", market: "KRX", currency: "KRW" },
  "KODEX 인버스": { ticker: "114800", market: "KRX", currency: "KRW" },
  "KODEX 국고채3년": { ticker: "114820", market: "KRX", currency: "KRW" },
  "KODEX 단기채권": { ticker: "153130", market: "KRX", currency: "KRW" },
  "KODEX 배당가치": { ticker: "211900", market: "KRX", currency: "KRW" },
  "KODEX 미국배당프리미엄액티브": { ticker: "480350", market: "KRX", currency: "KRW" },
  "KODEX 미국배당커버드콜액티브": { ticker: "441640", market: "KRX", currency: "KRW" },
  "KODEX 미국배당커버드콜": { ticker: "441640", market: "KRX", currency: "KRW" },
  "KODEX 미국배당커버": { ticker: "441640", market: "KRX", currency: "KRW" },
  "KODEX 미국성장커버드콜액티브": { ticker: "489310", market: "KRX", currency: "KRW" },
  "KODEX 미국성장커버드콜": { ticker: "489310", market: "KRX", currency: "KRW" },
  "KODEX CD금리액티브": { ticker: "364960", market: "KRX", currency: "KRW" },
  "KODEX KOFR금리액티브": { ticker: "411060", market: "KRX", currency: "KRW" },
  "KODEX 단기채권PLUS": { ticker: "214980", market: "KRX", currency: "KRW" },
  "KODEX 미국30년국채액티브": { ticker: "304660", market: "KRX", currency: "KRW" },
  "KODEX 미국S&P500(H)": { ticker: "453810", market: "KRX", currency: "KRW" },
  "KODEX 반도체": { ticker: "091160", market: "KRX", currency: "KRW" },
  "KODEX 2차전지산업": { ticker: "305720", market: "KRX", currency: "KRW" },

  // ── TIGER ──────────────────────────────────────────
  "TIGER 200": { ticker: "102110", market: "KRX", currency: "KRW" },
  "TIGER 미국S&P500": { ticker: "360750", market: "KRX", currency: "KRW" },
  "TIGER 미국나스닥100": { ticker: "381170", market: "KRX", currency: "KRW" },
  "TIGER 나스닥100레버리지": { ticker: "267490", market: "KRX", currency: "KRW" },
  "TIGER 미국테크TOP10": { ticker: "381180", market: "KRX", currency: "KRW" },
  "TIGER 글로벌리츠": { ticker: "182490", market: "KRX", currency: "KRW" },
  "TIGER 단기통안채": { ticker: "157450", market: "KRX", currency: "KRW" },
  "TIGER 미국S&P500+10%프리미엄초단기옵션": { ticker: "458730", market: "KRX", currency: "KRW" },
  "TIGER 미국배당다우존스": { ticker: "458730", market: "KRX", currency: "KRW" },
  "TIGER 미국30년국채커버드콜액티브": { ticker: "468300", market: "KRX", currency: "KRW" },
  "TIGER 미국채10년선물": { ticker: "329200", market: "KRX", currency: "KRW" },
  "TIGER 미국달러단기채권액티브": { ticker: "241180", market: "KRX", currency: "KRW" },
  "TIGER 코스닥150": { ticker: "229200", market: "KRX", currency: "KRW" },

  // ── ACE ───────────────────────────────────────────
  "ACE 미국S&P500": { ticker: "426410", market: "KRX", currency: "KRW" },
  "ACE 미국나스닥100": { ticker: "426400", market: "KRX", currency: "KRW" },
  "ACE 미국배당다우존스": { ticker: "448290", market: "KRX", currency: "KRW" },

  // ── PLUS (NH-AMUNDI) ──────────────────────────────
  "PLUS 고배당주": { ticker: "266160", market: "KRX", currency: "KRW" },
  "PLUS 미국S&P500": { ticker: "379800", market: "KRX", currency: "KRW" },

  // ── SOL (신한) ────────────────────────────────────
  "SOL 미국S&P500": { ticker: "379800", market: "KRX", currency: "KRW" },
  "SOL 미국배당다우존스": { ticker: "446720", market: "KRX", currency: "KRW" },
  "SOL 미국배당다우존스(H)": { ticker: "446730", market: "KRX", currency: "KRW" },

  // ── HANARO (NH) ───────────────────────────────────
  "HANARO 미국S&P500": { ticker: "379800", market: "KRX", currency: "KRW" },
  "HANARO 미국배당액티브": { ticker: "448730", market: "KRX", currency: "KRW" },

  // ── KBSTAR ────────────────────────────────────────
  "KBSTAR 미국S&P500": { ticker: "379780", market: "KRX", currency: "KRW" },
  "KBSTAR 미국나스닥100": { ticker: "426400", market: "KRX", currency: "KRW" },

  // ── ARIRANG ───────────────────────────────────────
  "ARIRANG 미국S&P500": { ticker: "379800", market: "KRX", currency: "KRW" },

  // ── KINDEX ────────────────────────────────────────
  "KINDEX 미국S&P500": { ticker: "243880", market: "KRX", currency: "KRW" },

  // ── 미국 개별주식 한국어 표기 ──────────────────────
  // 빅테크
  "애플": { ticker: "AAPL", market: "NASDAQ", currency: "USD" },
  "마이크로소프트": { ticker: "MSFT", market: "NASDAQ", currency: "USD" },
  "엔비디아": { ticker: "NVDA", market: "NASDAQ", currency: "USD" },
  "알파벳": { ticker: "GOOGL", market: "NASDAQ", currency: "USD" },
  "구글": { ticker: "GOOGL", market: "NASDAQ", currency: "USD" },
  "아마존": { ticker: "AMZN", market: "NASDAQ", currency: "USD" },
  "메타": { ticker: "META", market: "NASDAQ", currency: "USD" },
  "테슬라": { ticker: "TSLA", market: "NASDAQ", currency: "USD" },
  "브로드컴": { ticker: "AVGO", market: "NASDAQ", currency: "USD" },
  // 금융
  "버크셔 해서웨이": { ticker: "BRK-B", market: "NYSE", currency: "USD" },
  "버크셔해서웨이": { ticker: "BRK-B", market: "NYSE", currency: "USD" },
  "JP모건": { ticker: "JPM", market: "NYSE", currency: "USD" },
  "비자": { ticker: "V", market: "NYSE", currency: "USD" },
  "마스터카드": { ticker: "MA", market: "NYSE", currency: "USD" },
  "뱅크오브아메리카": { ticker: "BAC", market: "NYSE", currency: "USD" },
  "골드만삭스": { ticker: "GS", market: "NYSE", currency: "USD" },
  // 헬스케어
  "존슨 앤드 존슨": { ticker: "JNJ", market: "NYSE", currency: "USD" },
  "존슨앤드존슨": { ticker: "JNJ", market: "NYSE", currency: "USD" },
  "존슨앤존슨": { ticker: "JNJ", market: "NYSE", currency: "USD" },
  "유나이티드헬스": { ticker: "UNH", market: "NYSE", currency: "USD" },
  "일라이 릴리": { ticker: "LLY", market: "NYSE", currency: "USD" },
  "일라이릴리": { ticker: "LLY", market: "NYSE", currency: "USD" },
  "애브비": { ticker: "ABBV", market: "NYSE", currency: "USD" },
  "화이자": { ticker: "PFE", market: "NYSE", currency: "USD" },
  // 소비재·산업
  "월마트": { ticker: "WMT", market: "NYSE", currency: "USD" },
  "코카콜라": { ticker: "KO", market: "NYSE", currency: "USD" },
  "펩시코": { ticker: "PEP", market: "NASDAQ", currency: "USD" },
  "프록터앤드갬블": { ticker: "PG", market: "NYSE", currency: "USD" },
  "프록터 앤드 갬블": { ticker: "PG", market: "NYSE", currency: "USD" },
  "홈디포": { ticker: "HD", market: "NYSE", currency: "USD" },
  "엑슨모빌": { ticker: "XOM", market: "NYSE", currency: "USD" },
  "쉐브론": { ticker: "CVX", market: "NYSE", currency: "USD" },
  // 미디어·엔터
  "넷플릭스": { ticker: "NFLX", market: "NASDAQ", currency: "USD" },
  "디즈니": { ticker: "DIS", market: "NYSE", currency: "USD" },
  // 반도체
  "인텔": { ticker: "INTC", market: "NASDAQ", currency: "USD" },
  "AMD": { ticker: "AMD", market: "NASDAQ", currency: "USD" },
  "퀄컴": { ticker: "QCOM", market: "NASDAQ", currency: "USD" },
  "TSMC": { ticker: "TSM", market: "NYSE", currency: "USD" },
  // 통신
  "AT&T": { ticker: "T", market: "NYSE", currency: "USD" },
  "버라이즌": { ticker: "VZ", market: "NYSE", currency: "USD" },

  // ── 미국 직접투자 ETF ──────────────────────────────
  SPY: { ticker: "SPY", market: "NYSE", currency: "USD" },
  QQQ: { ticker: "QQQ", market: "NASDAQ", currency: "USD" },
  QLD: { ticker: "QLD", market: "NASDAQ", currency: "USD" },
  TQQQ: { ticker: "TQQQ", market: "NASDAQ", currency: "USD" },
  SQQQ: { ticker: "SQQQ", market: "NASDAQ", currency: "USD" },
  VOO: { ticker: "VOO", market: "NYSE", currency: "USD" },
  VTI: { ticker: "VTI", market: "NYSE", currency: "USD" },
  SCHD: { ticker: "SCHD", market: "NYSE", currency: "USD" },
  VIG: { ticker: "VIG", market: "NYSE", currency: "USD" },
  JEPI: { ticker: "JEPI", market: "NYSE", currency: "USD" },
  JEPQ: { ticker: "JEPQ", market: "NASDAQ", currency: "USD" },
  QYLD: { ticker: "QYLD", market: "NASDAQ", currency: "USD" },
  IVV: { ticker: "IVV", market: "NYSE", currency: "USD" },
  VNQ: { ticker: "VNQ", market: "NYSE", currency: "USD" },
  BOXX: { ticker: "BOXX", market: "NYSE", currency: "USD" },
  SOXL: { ticker: "SOXL", market: "NYSE", currency: "USD" },
  TECL: { ticker: "TECL", market: "NYSE", currency: "USD" },
  UPRO: { ticker: "UPRO", market: "NYSE", currency: "USD" },
  SPXL: { ticker: "SPXL", market: "NYSE", currency: "USD" },
  FNGU: { ticker: "FNGU", market: "NYSE", currency: "USD" },
};

function normalize(s: string) {
  return s.replace(/\s+/g, "").toLowerCase();
}

const NORMALIZED = new Map(Object.entries(RAW_MAP).map(([k, v]) => [normalize(k), v]));

// 퍼지 매칭용: 정규화된 키 배열 (정렬 불필요, 길이 내림차순으로 저장해 가장 구체적인 매치 우선)
const NORMALIZED_ENTRIES: [string, TickerInfo][] = [...NORMALIZED.entries()]
  .sort((a, b) => b[0].length - a[0].length);

// 역방향: ticker → (첫 번째 등록된 한국어 이름, TickerInfo)
const TICKER_TO_ENTRY = new Map<string, { name: string; info: TickerInfo }>();
for (const [name, info] of Object.entries(RAW_MAP)) {
  if (!TICKER_TO_ENTRY.has(info.ticker)) TICKER_TO_ENTRY.set(info.ticker, { name, info });
}

export function lookupByTicker(ticker: string): { name: string; info: TickerInfo } | null {
  return TICKER_TO_ENTRY.get(ticker) ?? null;
}

const US_TICKER_RE = /^[A-Z]{1,5}$/;
const KRX_CODE_RE = /^\d{6}$/;

// OCR이 종목 유형 레이블을 티커로 잘못 추출하는 경우를 차단
const INVALID_TICKER_TOKENS = new Set([
  "ETF", "ETF형", "주식", "현금", "채권", "FUND", "REIT", "MMF", "ELS", "DLS",
]);

export function deriveTickerInfo(ticker: string): TickerInfo | null {
  const t = ticker.trim();
  if (RAW_MAP[t]) return RAW_MAP[t];
  if (KRX_CODE_RE.test(t)) return { ticker: t, market: "KRX", currency: "KRW" };
  if (US_TICKER_RE.test(t) && !INVALID_TICKER_TOKENS.has(t)) return { ticker: t, market: "NASDAQ", currency: "USD" };
  return null;
}

export function lookupTicker(rawName: string): TickerInfo | null {
  // 1. 직접 매치
  if (RAW_MAP[rawName]) return RAW_MAP[rawName];
  // 2. 공백 제거 정규화 매치
  const n = normalize(rawName);
  if (NORMALIZED.has(n)) return NORMALIZED.get(n)!;
  const trimmed = rawName.trim();
  // 3. 미국 직접투자: 대문자 1~5자 심볼 패턴이면 그대로 티커로 간주 (자산유형 레이블 제외)
  if (US_TICKER_RE.test(trimmed) && !INVALID_TICKER_TOKENS.has(trimmed)) {
    return { ticker: trimmed, market: "NASDAQ", currency: "USD" };
  }
  // 4. 한국 증권사 앱은 "종목명 TICKER" 형식으로 표기 — 마지막 단어가 US 티커 패턴이면 추출
  const lastWord = trimmed.split(/\s+/).pop() ?? "";
  if (lastWord.length >= 2 && US_TICKER_RE.test(lastWord) && !INVALID_TICKER_TOKENS.has(lastWord)) {
    // 정적 맵에 있으면 그 market 정보 사용 (NASDAQ 하드코딩 방지)
    const fromMap = NORMALIZED.get(normalize(lastWord));
    if (fromMap) return fromMap;
    return { ticker: lastWord, market: "NASDAQ", currency: "USD" };
  }
  // 5. 접두어 퍼지 매치 — OCR이 이름을 잘리거나 살짝 다르게 읽은 경우 대응
  //    케이스 A: mapKey.startsWith(n) — OCR이 끝을 잘라냄 → suffix가 가장 짧은 키 선택
  //    케이스 B: n.startsWith(mapKey) — OCR이 뒤에 글자를 추가 → prefix가 가장 긴 키 선택
  const MIN_FUZZY = 8;
  if (n.length >= MIN_FUZZY) {
    let caseAInfo: TickerInfo | null = null;
    let caseAMinLen = Infinity;
    let caseBInfo: TickerInfo | null = null;
    let caseBMaxLen = 0;

    for (const [mapN, info] of NORMALIZED_ENTRIES) {
      if (mapN.length < MIN_FUZZY) continue;
      if (mapN.startsWith(n) && mapN.length < caseAMinLen) {
        caseAMinLen = mapN.length;
        caseAInfo = info;
      } else if (n.startsWith(mapN) && mapN.length > caseBMaxLen) {
        caseBMaxLen = mapN.length;
        caseBInfo = info;
      }
    }
    // 잘림(A) 우선, 없으면 추가(B)
    if (caseAInfo) return caseAInfo;
    if (caseBInfo) return caseBInfo;
  }
  return null;
}
