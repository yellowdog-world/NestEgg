import { z } from "zod";
import type { Simulator } from "./types";
import {
  OVERSEAS_CAPITAL_GAIN,
  ISA_TAX_FREE_LIMIT,
  ISA_OVER_LIMIT_RATE,
  PENSION_TAX_RATE,
} from "./constants/2026";

export const EtfTaxInput = z.object({
  /** 평가차익(원). 매도 시 발생할 차익 */
  capitalGain: z.number().nonnegative(),
  /** 인출 시점 연령 — 연저펀에 담은 경우의 세율 결정 */
  withdrawalAge: z.number().int().min(55).max(120).default(65),
});
export type EtfTaxInput = z.infer<typeof EtfTaxInput>;

export interface EtfTaxBreakdownLine {
  account: "regular" | "isa" | "pension_fund";
  label: string;
  taxAmount: number;
  effectiveRate: number; // 차익 대비 실효세율
  detail: string;
}

export interface EtfTaxOutput {
  capitalGain: number;
  lines: EtfTaxBreakdownLine[];
  best: EtfTaxBreakdownLine;
}

function pensionRate(age: number): number {
  if (age >= 80) return PENSION_TAX_RATE.age80Plus;
  if (age >= 70) return PENSION_TAX_RATE.age70to79;
  return PENSION_TAX_RATE.age55to69;
}

/**
 * 동일한 평가차익을 세 종류 계좌에 담았을 때 실효세 비교.
 *  - 일반계좌: 양도소득세 22%, 연 250만원 기본공제
 *  - ISA: 만기 시 200만원 비과세, 초과분 9.9% 분리
 *  - 연저펀: 인출 시점 연금소득세(3.3~5.5%) — 단, 한도 내 가정
 */
export function computeEtfTax(input: EtfTaxInput): EtfTaxOutput {
  const { capitalGain, withdrawalAge } = input;

  // 일반계좌
  const regTaxable = Math.max(0, capitalGain - OVERSEAS_CAPITAL_GAIN.basicDeduction);
  const regularTax = regTaxable * OVERSEAS_CAPITAL_GAIN.rate;
  const regular: EtfTaxBreakdownLine = {
    account: "regular",
    label: "일반계좌 (해외 양도세)",
    taxAmount: regularTax,
    effectiveRate: capitalGain ? regularTax / capitalGain : 0,
    detail: `차익 ${(capitalGain).toLocaleString()}원 − 250만원 공제 = 과세표준 ${regTaxable.toLocaleString()}원 × 22%`,
  };

  // ISA
  const isaTaxable = Math.max(0, capitalGain - ISA_TAX_FREE_LIMIT.general);
  const isaTax = isaTaxable * ISA_OVER_LIMIT_RATE;
  const isa: EtfTaxBreakdownLine = {
    account: "isa",
    label: "ISA (만기 비과세 + 초과 9.9%)",
    taxAmount: isaTax,
    effectiveRate: capitalGain ? isaTax / capitalGain : 0,
    detail: `차익 ${(capitalGain).toLocaleString()}원 − 200만원 비과세 = ${isaTaxable.toLocaleString()}원 × 9.9%`,
  };

  // 연저펀(인출 시 연금소득세) — 운용 중 비과세, 인출 시 차익 + 원금에 대해 세금이지만 여기서는 차익 비교용으로 동일 차익에 인출세율 적용
  const pf = pensionRate(withdrawalAge);
  const pensionTax = capitalGain * pf;
  const pension: EtfTaxBreakdownLine = {
    account: "pension_fund",
    label: "연저펀 (인출 시 연금소득세)",
    taxAmount: pensionTax,
    effectiveRate: pf,
    detail: `만 ${withdrawalAge}세 인출 가정 → ${(pf * 100).toFixed(1)}% 분리과세 (한도 1500만원 이내 가정)`,
  };

  const lines = [regular, isa, pension];
  const best = lines.reduce((min, cur) => (cur.taxAmount < min.taxAmount ? cur : min), lines[0]);

  return { capitalGain, lines, best };
}

export const etfTaxSimulator: Simulator<EtfTaxInput, EtfTaxOutput> = {
  name: "etf-tax",
  title: "해외 ETF 세금 비교",
  description: "동일 평가차익을 일반/ISA/연저펀에 담을 때 실효세 비교",
  group: "세금",
  schema: EtfTaxInput,
  compute: computeEtfTax,
  defaultInput: {
    capitalGain: 10_000_000,
    withdrawalAge: 65,
  },
};
