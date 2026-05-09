import { z } from "zod";

// LLM이 숫자를 문자열로 반환하는 경우 방어 ("1,234" → 1234, "-" → null)
function coerceNum(v: unknown): number | null | undefined {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/,/g, "").trim();
    if (cleaned === "" || cleaned === "-" || cleaned === "--") return null;
    const n = Number(cleaned);
    return isNaN(n) ? null : n;
  }
  return null;
}

// number | null | undefined 허용
const NumNullish = z.preprocess(coerceNum, z.number().nullable().optional());

// number만 허용 (null이면 기본값으로 대체)
function numDefault(def: number) {
  return z.preprocess((v) => coerceNum(v) ?? def, z.number());
}

// LLM이 holdings를 JSON 문자열로 반환하는 경우도 처리
function coerceArray(v: unknown): unknown {
  if (v == null) return [];
  if (typeof v === "string") {
    try { return JSON.parse(v); } catch { return []; }
  }
  return Array.isArray(v) ? v : [];
}

/**
 * Claude Vision tool_use 출력 스키마.
 * 한국 증권사/은행 앱 스크린샷에서 보유 종목 및 계좌 정보 추출.
 */
export const HoldingsExtraction = z.object({
  broker: z.string().nullish(),
  account_type_hint: z
    .enum(["pension_fund", "isa", "irp", "regular", "bank", "unknown"])
    .catch("unknown"),
  captured_at: z.string().nullish(),
  total_eval_amount: NumNullish,
  holdings: z.preprocess(
    coerceArray,
    z.array(
      z.object({
        raw_name: z.string().default(""),
        ticker: z.string().nullish(),
        quantity: numDefault(0),
        avg_price: NumNullish,
        market_price: NumNullish,
        eval_amount: NumNullish,
        profit_loss: NumNullish,
        currency: z.enum(["KRW", "USD"]).catch("KRW"),
      }),
    ),
  ),
  cash_balance: NumNullish,
  cash_currency: z.enum(["KRW", "USD"]).catch("KRW").nullish(),
  confidence: z.enum(["high", "medium", "low"]).catch("medium"),
  notes: z.string().optional(),
});

export type HoldingsExtractionT = z.infer<typeof HoldingsExtraction>;

/**
 * Anthropic SDK tool 정의용 JSON Schema (수동 작성 — zod-to-json-schema 의존 회피).
 * tool_use input_schema에 사용.
 */
export const HOLDINGS_EXTRACTION_TOOL = {
  name: "extract_holdings",
  description:
    "한국 증권사 또는 은행 앱 스크린샷에서 보유 종목과 계좌 정보를 정확히 추출합니다. " +
    "숫자에 콤마/소수점 주의. 읽을 수 없으면 null. 추정 금지.",
  input_schema: {
    type: "object" as const,
    required: ["holdings", "account_type_hint", "confidence"],
    properties: {
      broker: { type: ["string", "null"] as const, description: "증권사/은행 이름" },
      account_type_hint: {
        type: "string" as const,
        enum: ["pension_fund", "isa", "irp", "regular", "bank", "unknown"],
      },
      captured_at: { type: ["string", "null"] as const, description: "ISO 8601" },
      total_eval_amount: { type: ["number", "null"] as const },
      holdings: {
        type: "array" as const,
        items: {
          type: "object" as const,
          required: ["raw_name", "quantity"],
          properties: {
            raw_name: { type: "string" as const },
            ticker: { type: ["string", "null"] as const },
            quantity: { type: "number" as const },
            avg_price: { type: ["number", "null"] as const },
            market_price: { type: ["number", "null"] as const },
            eval_amount: { type: ["number", "null"] as const },
            profit_loss: { type: ["number", "null"] as const },
            currency: { type: "string" as const, enum: ["KRW", "USD"] },
          },
        },
      },
      cash_balance: { type: ["number", "null"] as const, description: "예수금/현금 잔액 (원화 또는 달러)" },
      cash_currency: { type: "string" as const, enum: ["KRW", "USD"] },
      confidence: { type: "string" as const, enum: ["high", "medium", "low"] },
      notes: { type: "string" as const },
    },
  },
};
