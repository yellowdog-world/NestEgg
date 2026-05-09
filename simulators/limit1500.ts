import { z } from "zod";
import type { Simulator } from "./types";
import { computePensionIncomeTax } from "./tax/pensionIncomeTax";
import { comprehensiveTax, withLocal } from "./tax/comprehensiveTax";
import { LUMP_SUM_TAX_RATE, PENSION_SEPARATION_LIMIT } from "./constants/2026";

export const Limit1500Input = z.object({
  yearlyWithdrawal: z.number().nonnegative(),
  age: z.number().int().min(55).max(120),
  /** 연금 외 종합과세 대상 다른 소득 합계(근로/사업/이자배당). 단순화 입력 */
  otherTaxableIncome: z.number().nonnegative().default(0),
});
export type Limit1500Input = z.infer<typeof Limit1500Input>;

export interface Limit1500Output {
  withinLimit: boolean;
  separateTaxAmount: number;        // 16.5% 분리과세 시 세금
  comprehensiveTaxAmount: number;   // 종합과세 선택 시 세금(증가분)
  recommendation: "separate" | "comprehensive";
  diff: number;                     // 분리 - 종합 (양수면 종합이 유리)
  detail: { label: string; value: number }[];
}

/**
 * 1500만원 한도 비교:
 *  - 한도 내: 자동 분리 저율 (3.3~5.5%)
 *  - 한도 초과: ① 16.5% 분리 vs ② 종합과세(다른소득과 합산) — 사용자 선택
 */
export function computeLimit1500(input: Limit1500Input): Limit1500Output {
  const { yearlyWithdrawal, age, otherTaxableIncome } = input;
  const detail: { label: string; value: number }[] = [];

  if (yearlyWithdrawal <= PENSION_SEPARATION_LIMIT) {
    // 한도 내: 분리 저율만 적용. 비교 의미 적으나 정보 제공.
    const lowRate = computePensionIncomeTax({ yearlyWithdrawal, age, mode: "annuity" });
    detail.push({ label: "저율 분리과세", value: lowRate.taxAmount });
    return {
      withinLimit: true,
      separateTaxAmount: lowRate.taxAmount,
      comprehensiveTaxAmount: lowRate.taxAmount,
      recommendation: "separate",
      diff: 0,
      detail,
    };
  }

  // 1500만원 초과 케이스
  // ① 분리 16.5% (전액에 대해)
  const separate = yearlyWithdrawal * LUMP_SUM_TAX_RATE;
  detail.push({ label: "① 16.5% 분리과세", value: separate });

  // ② 종합과세: (다른소득 + 연금소득 전액)에 누진세율 → 다른소득 만일 때보다 증가분
  const baseTax = withLocal(comprehensiveTax(otherTaxableIncome));
  const combinedTax = withLocal(comprehensiveTax(otherTaxableIncome + yearlyWithdrawal));
  const comprehensiveDelta = combinedTax - baseTax;
  detail.push({ label: "② 종합과세 증가분", value: comprehensiveDelta });

  const recommendation = separate <= comprehensiveDelta ? "separate" : "comprehensive";

  return {
    withinLimit: false,
    separateTaxAmount: separate,
    comprehensiveTaxAmount: comprehensiveDelta,
    recommendation,
    diff: separate - comprehensiveDelta,
    detail,
  };
}

export const limit1500Simulator: Simulator<Limit1500Input, Limit1500Output> = {
  name: "limit-1500",
  title: "1500만원 한도",
  description: "연 1500만원 초과 시 분리 16.5% vs 종합과세 자동 비교",
  group: "세금",
  schema: Limit1500Input,
  compute: computeLimit1500,
  defaultInput: {
    yearlyWithdrawal: 18_000_000,
    age: 65,
    otherTaxableIncome: 30_000_000,
  },
};
