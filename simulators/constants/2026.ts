/**
 * 2026년 기준 한국 세법 상수.
 * 연도별 갱신 시 새 파일(2027.ts 등) 추가하고 import 경로만 교체.
 */

/** 사적연금(연저펀/IRP) 분리과세 세율 (지방세 10% 포함) */
export const PENSION_TAX_RATE = {
  age80Plus: 0.033, // 만 80세 이상
  age70to79: 0.044,
  age55to69: 0.055,
  /** 종신형 수령 시 우대 (만 55~69 기준에도 적용 가능) */
  lifetime: 0.044,
} as const;

/** 일시금(기타소득) 세율 = 16.5% (지방세 포함) */
export const LUMP_SUM_TAX_RATE = 0.165;

/** 사적연금 분리과세 한도. 초과 시 분리 16.5% vs 종합과세 선택 */
export const PENSION_SEPARATION_LIMIT = 15_000_000;

/** 종합소득세 누진 구간 (지방세 별도) */
export const COMPREHENSIVE_TAX_BRACKETS: { upTo: number; rate: number; deduct: number }[] = [
  { upTo: 14_000_000, rate: 0.06, deduct: 0 },
  { upTo: 50_000_000, rate: 0.15, deduct: 1_260_000 },
  { upTo: 88_000_000, rate: 0.24, deduct: 5_760_000 },
  { upTo: 150_000_000, rate: 0.35, deduct: 15_440_000 },
  { upTo: 300_000_000, rate: 0.38, deduct: 19_940_000 },
  { upTo: 500_000_000, rate: 0.40, deduct: 25_940_000 },
  { upTo: 1_000_000_000, rate: 0.42, deduct: 35_940_000 },
  { upTo: Infinity, rate: 0.45, deduct: 65_940_000 },
];

/** 지방소득세 = 산출세액의 10% */
export const LOCAL_TAX_RATE = 0.10;

/**
 * 해외 주식/ETF 양도소득세 (일반계좌)
 * - 연 250만원 기본공제, 초과분 22% (지방세 포함)
 */
export const OVERSEAS_CAPITAL_GAIN = {
  basicDeduction: 2_500_000,
  rate: 0.22,
} as const;

/** 국내 ETF (일반계좌) 배당소득세 = 15.4% (지방세 포함) */
export const DOMESTIC_DIVIDEND_TAX = 0.154;

/** ISA 만기 시 비과세 한도 */
export const ISA_TAX_FREE_LIMIT = {
  general: 2_000_000, // 일반형 200만원
  young: 4_000_000,   // 청년형
};
/** ISA 만기 비과세 초과분 분리과세율 */
export const ISA_OVER_LIMIT_RATE = 0.099; // 9.9%

/** 국민건강보험 지역가입자 보험료율(소득) — 연도별 변동 가능 */
export const HEALTH_INSURANCE = {
  /** 소득 보험료율 */
  incomeRate: 0.0709,
  /** 장기요양 = 건강보험료의 12.95% (2026 추정) */
  longTermCareRate: 0.1295,
  /** 재산 점수당 부과 금액 (단순화) */
  propertyPointAmount: 208.4,
} as const;

/** FIRE 안전인출률(Safe Withdrawal Rate) 기본값 */
export const DEFAULT_SWR = 0.04;
