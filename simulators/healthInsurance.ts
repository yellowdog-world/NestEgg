import { z } from "zod";
import type { Simulator } from "./types";
import { HEALTH_INSURANCE } from "./constants/2026";

export const HealthInsuranceInput = z.object({
  /** 연 종합소득(연금/배당/이자/사업/기타) — 분리과세 1500만 이하 사적연금은 제외 가능 */
  yearlyIncome: z.number().nonnegative(),
  /** 재산세 과세표준 (대략) */
  propertyTaxBase: z.number().nonnegative().default(0),
  /** 직장가입자 피부양자 등재 가능 여부(별도 체크박스용 — 단순 표시) */
  hasDependentPath: z.boolean().default(false),
});
export type HealthInsuranceInput = z.infer<typeof HealthInsuranceInput>;

export interface HealthInsuranceOutput {
  /** 월 보험료 (소득 + 재산 + 장기요양) */
  monthlyTotal: number;
  monthlyIncomePart: number;
  monthlyPropertyPart: number;
  monthlyLongTermCare: number;
  yearlyTotal: number;
  notes: string[];
}

/**
 * 지역가입자 보험료(단순 추정).
 *  - 소득 보험료: 연 소득 × 7.09% / 12
 *  - 재산 보험료: 재산 점수 × 점수당 금액 (단순 비례 모델)
 *  - 장기요양: 건강보험료의 12.95%
 *
 * NOTE: 실제 점수산정은 구간형이라 오차 가능. v1은 본인 계획용 추정치.
 */
export function computeHealthInsurance(input: HealthInsuranceInput): HealthInsuranceOutput {
  const { yearlyIncome, propertyTaxBase } = input;

  const monthlyIncomePart = (yearlyIncome * HEALTH_INSURANCE.incomeRate) / 12;

  // 재산 점수 단순화: 1억당 100점으로 간주 (실제는 누진 점수표)
  const propertyPoints = (propertyTaxBase / 100_000_000) * 100;
  const monthlyPropertyPart = propertyPoints * HEALTH_INSURANCE.propertyPointAmount;

  const baseHealth = monthlyIncomePart + monthlyPropertyPart;
  const monthlyLongTermCare = baseHealth * HEALTH_INSURANCE.longTermCareRate;

  const monthlyTotal = baseHealth + monthlyLongTermCare;

  const notes: string[] = [];
  if (input.hasDependentPath) {
    notes.push(
      "직장가입자 자녀의 피부양자 등재 가능성이 있다면 소득/재산 요건을 먼저 확인하세요. 피부양자라면 보험료 0원.",
    );
  }
  if (yearlyIncome > 20_000_000) {
    notes.push(
      "연 종합소득 2000만원 초과 시 피부양자 자격 상실 가능성이 큽니다.",
    );
  }
  notes.push(
    "이 추정치는 단순화된 모델입니다. 실제 부과는 점수 구간에 따라 다를 수 있어요. 건강보험공단 모의계산기로 교차 확인 권장.",
  );

  return {
    monthlyIncomePart,
    monthlyPropertyPart,
    monthlyLongTermCare,
    monthlyTotal,
    yearlyTotal: monthlyTotal * 12,
    notes,
  };
}

export const healthInsuranceSimulator: Simulator<HealthInsuranceInput, HealthInsuranceOutput> = {
  name: "health-insurance",
  title: "지역가입자 건보료",
  description: "은퇴 후 지역가입자 전환 시 월 보험료 추정",
  group: "세금",
  schema: HealthInsuranceInput,
  compute: computeHealthInsurance,
  defaultInput: {
    yearlyIncome: 30_000_000,
    propertyTaxBase: 300_000_000,
    hasDependentPath: false,
  },
};
