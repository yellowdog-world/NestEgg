import { z } from "zod";
import type { Simulator } from "./types";
import { computePensionIncomeTax } from "./tax/pensionIncomeTax";
import { DOMESTIC_DIVIDEND_TAX } from "./constants/2026";

export const RetireCashflowInput = z.object({
  age: z.number().int().min(55).max(120).default(55),                  // 개인연금 수령 나이 (55세~)
  nationalPensionAge: z.number().int().min(60).max(70).default(65),    // 국민연금 수령 나이 (65세)
  pensionFundYearly: z.number().nonnegative().default(12_000_000),    // 연저펀/IRP
  nationalPensionMonthly: z.number().nonnegative().default(1_500_000), // 국민연금 월
  dividendYearly: z.number().nonnegative().default(6_000_000),         // 배당 연
  rentMonthly: z.number().nonnegative().default(0),                    // 임대 월
});
export type RetireCashflowInput = z.infer<typeof RetireCashflowInput>;

export interface RetireCashflowOutput {
  monthlyGross: number;
  monthlyNet: number;
  yearlyGross: number;
  yearlyNet: number;
  breakdown: { label: string; gross: number; tax: number; net: number }[];
}

/**
 * 매우 단순한 합산: 각 소스별로 세금을 분리과세 가정으로 차감 후 월/연 집계.
 * 종합과세 케이스는 별도 시뮬에서.
 */
export function computeRetireCashflow(input: RetireCashflowInput): RetireCashflowOutput {
  const { age, pensionFundYearly, nationalPensionMonthly, dividendYearly, rentMonthly } = input;

  // 사적연금 (연저펀+IRP) — 분리과세 저율
  const pf = computePensionIncomeTax({
    yearlyWithdrawal: pensionFundYearly,
    age,
    mode: "annuity",
  });

  // 국민연금 — 단순화: 비과세 가정 (실제는 연금소득공제 후 종합과세지만 v1 단순화)
  const np = nationalPensionMonthly * 12;
  const npTax = 0;

  // 배당 — 분리과세 15.4%
  const divTax = dividendYearly * DOMESTIC_DIVIDEND_TAX;

  // 임대 — 사업/기타소득 가정 (단순 0% 처리, v1)
  const rent = rentMonthly * 12;
  const rentTax = 0;

  const breakdown = [
    { label: "사적연금(연저펀/IRP)", gross: pensionFundYearly, tax: pf.taxAmount, net: pf.netAmount },
    { label: "국민연금", gross: np, tax: npTax, net: np },
    { label: "배당", gross: dividendYearly, tax: divTax, net: dividendYearly - divTax },
    { label: "임대", gross: rent, tax: rentTax, net: rent },
  ];

  const yearlyGross = breakdown.reduce((s, b) => s + b.gross, 0);
  const yearlyNet = breakdown.reduce((s, b) => s + b.net, 0);

  return {
    yearlyGross,
    yearlyNet,
    monthlyGross: yearlyGross / 12,
    monthlyNet: yearlyNet / 12,
    breakdown,
  };
}

export const retireCashflowSimulator: Simulator<RetireCashflowInput, RetireCashflowOutput> = {
  name: "retire-cashflow",
  title: "은퇴 후 월급 플랜",
  description: "연저펀/IRP/국민연금/배당/임대를 합쳐 월·연 현금 흐름 추정",
  group: "포트폴리오",
  schema: RetireCashflowInput,
  compute: computeRetireCashflow,
  defaultInput: {
    age: 55,
    nationalPensionAge: 65,
    pensionFundYearly: 12_000_000,
    nationalPensionMonthly: 1_500_000,
    dividendYearly: 6_000_000,
    rentMonthly: 0,
  },
};
