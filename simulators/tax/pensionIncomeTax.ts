import { z } from "zod";
import type { Simulator } from "../types";
import {
  PENSION_TAX_RATE,
  LUMP_SUM_TAX_RATE,
  PENSION_SEPARATION_LIMIT,
} from "../constants/2026";

export const PensionIncomeTaxInput = z.object({
  yearlyWithdrawal: z.number().nonnegative(),
  age: z.number().int().min(55).max(120),
  mode: z.enum(["annuity", "lump_sum", "lifetime"]),
});
export type PensionIncomeTaxInput = z.infer<typeof PensionIncomeTaxInput>;

export interface PensionIncomeTaxOutput {
  taxRate: number;
  taxAmount: number;
  netAmount: number;
  rateLabel: string;
  warning?: string;
  /** 1500만원 한도 초과 시 안내 */
  needsSeparateVsComprehensiveChoice: boolean;
}

function rateForAnnuity(age: number): { rate: number; label: string } {
  if (age >= 80) return { rate: PENSION_TAX_RATE.age80Plus, label: "만 80세 이상 3.3%" };
  if (age >= 70) return { rate: PENSION_TAX_RATE.age70to79, label: "만 70~79세 4.4%" };
  return { rate: PENSION_TAX_RATE.age55to69, label: "만 55~69세 5.5%" };
}

export function computePensionIncomeTax(input: PensionIncomeTaxInput): PensionIncomeTaxOutput {
  const { yearlyWithdrawal, age, mode } = input;

  let rate: number;
  let rateLabel: string;
  let warning: string | undefined;

  if (mode === "lump_sum") {
    rate = LUMP_SUM_TAX_RATE;
    rateLabel = "일시금 16.5%";
    warning = "일시금 인출은 기타소득세 16.5%로 가장 불리. 가능하면 연금 형태로 나눠 받는 게 유리합니다.";
  } else if (mode === "lifetime") {
    rate = PENSION_TAX_RATE.lifetime;
    rateLabel = "종신형 수령 우대 4.4%";
  } else {
    const r = rateForAnnuity(age);
    rate = r.rate;
    rateLabel = r.label;
  }

  const overLimit = yearlyWithdrawal > PENSION_SEPARATION_LIMIT && mode !== "lump_sum";
  const taxAmount = yearlyWithdrawal * rate;
  const netAmount = yearlyWithdrawal - taxAmount;

  return {
    taxRate: rate,
    taxAmount,
    netAmount,
    rateLabel,
    warning,
    needsSeparateVsComprehensiveChoice: overLimit,
  };
}

export const pensionIncomeTaxSimulator: Simulator<PensionIncomeTaxInput, PensionIncomeTaxOutput> = {
  name: "pension-tax",
  title: "연금 인출 세금",
  description: "연저펀/IRP 인출액에 대한 분리과세 세금",
  group: "세금",
  schema: PensionIncomeTaxInput,
  compute: computePensionIncomeTax,
  defaultInput: {
    yearlyWithdrawal: 12_000_000,
    age: 65,
    mode: "annuity",
  },
};
