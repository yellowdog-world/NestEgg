import { z } from "zod";
import type { Simulator } from "./types";
import { DOMESTIC_DIVIDEND_TAX } from "./constants/2026";
import { comprehensiveTax, withLocal, marginalRate } from "./tax/comprehensiveTax";

export const SelfDividendInput = z.object({
  /** 비교할 연 수령 목표(원) */
  targetYearlyAmount: z.number().nonnegative(),
  /** 법인세 실효세율 (단순 입력) */
  corpTaxRate: z.number().min(0).max(0.5).default(0.19),
  /** 다른 종합과세 소득 */
  otherIncome: z.number().nonnegative().default(0),
});
export type SelfDividendInput = z.infer<typeof SelfDividendInput>;

export interface SelfDividendScenario {
  label: string;
  grossNeeded: number;
  totalTax: number;
  netReceived: number;
  detail: string;
}

export interface SelfDividendOutput {
  scenarios: SelfDividendScenario[];
  recommended: SelfDividendScenario;
}

/**
 * 두 시나리오 비교:
 *  A) 자가배당 — 법인이 법인세 낸 후 잉여금에서 배당 지급, 개인은 배당소득세 (분리 15.4% or 종합)
 *  B) 배당주 직접 보유 — 개인 계좌에서 직접 배당 수령 (15.4% 분리 / 종합과세 가능)
 *
 * 단순 비교: 동일 "내 손에 들어오는" 목표 금액 기준으로 필요한 총 비용을 역산.
 */
export function computeSelfDividend(input: SelfDividendInput): SelfDividendOutput {
  const { targetYearlyAmount, corpTaxRate, otherIncome } = input;

  // 종합과세 vs 분리 자동 선택 (배당소득 2000만원 초과 시 종합과세 의무)
  const FINANCIAL_INCOME_THRESHOLD = 20_000_000;

  function personalDividendTax(dividendAmount: number): { tax: number; mode: "separate" | "comprehensive" } {
    if (dividendAmount <= FINANCIAL_INCOME_THRESHOLD) {
      return { tax: dividendAmount * DOMESTIC_DIVIDEND_TAX, mode: "separate" };
    }
    // 종합과세: 다른소득 + 배당 합산
    const baseTax = withLocal(comprehensiveTax(otherIncome));
    const combinedTax = withLocal(comprehensiveTax(otherIncome + dividendAmount));
    const delta = combinedTax - baseTax;
    // Gross-up 효과는 단순화 위해 미적용
    // 분리 vs 종합 중 작은 쪽 자동 선택 (실제로는 의무지만 사용자에게 비교 제공)
    const sep = dividendAmount * DOMESTIC_DIVIDEND_TAX;
    return delta < sep
      ? { tax: delta, mode: "comprehensive" }
      : { tax: sep, mode: "separate" };
  }

  // A) 자가배당: 법인세 차감 후 잉여금에서 배당
  // grossA = (target / (1 - personalRate)) / (1 - corpTaxRate)
  // 단, personalRate는 dividendAmount에 따라 달라지므로 반복 근사
  function selfDividendNeeded(target: number): { gross: number; tax: number; mode: string } {
    let dividend = target;
    for (let i = 0; i < 30; i++) {
      const { tax: pTax } = personalDividendTax(dividend);
      const net = dividend - pTax;
      if (Math.abs(net - target) < 100) break;
      dividend = dividend * (target / Math.max(net, 1));
    }
    const { tax: pTax, mode } = personalDividendTax(dividend);
    // 법인이 dividend를 지급하려면 법인세 전 (gross / (1-corpTaxRate)) 가 필요
    const grossPretax = dividend / (1 - corpTaxRate);
    const corpTax = grossPretax - dividend;
    return { gross: grossPretax, tax: corpTax + pTax, mode };
  }

  // B) 배당주 직접: 개인 배당 수령
  function directDividendNeeded(target: number): { gross: number; tax: number; mode: string } {
    let dividend = target;
    for (let i = 0; i < 30; i++) {
      const { tax } = personalDividendTax(dividend);
      const net = dividend - tax;
      if (Math.abs(net - target) < 100) break;
      dividend = dividend * (target / Math.max(net, 1));
    }
    const { tax, mode } = personalDividendTax(dividend);
    return { gross: dividend, tax, mode };
  }

  const a = selfDividendNeeded(targetYearlyAmount);
  const b = directDividendNeeded(targetYearlyAmount);

  const scenarios: SelfDividendScenario[] = [
    {
      label: "A) 법인 자가배당",
      grossNeeded: a.gross,
      totalTax: a.tax,
      netReceived: targetYearlyAmount,
      detail: `법인세 ${(corpTaxRate * 100).toFixed(0)}% 후 배당 → 개인 ${a.mode === "separate" ? "분리" : "종합"} 과세. 한계세율 ${(marginalRate(otherIncome + a.gross) * 100).toFixed(0)}%`,
    },
    {
      label: "B) 배당주 직접 보유",
      grossNeeded: b.gross,
      totalTax: b.tax,
      netReceived: targetYearlyAmount,
      detail: `개인 ${b.mode === "separate" ? "분리 15.4%" : "종합과세"} 수령. 법인세 없음.`,
    },
  ];

  const recommended = scenarios.reduce(
    (best, cur) => (cur.totalTax < best.totalTax ? cur : best),
    scenarios[0],
  );

  return { scenarios, recommended };
}

export const selfDividendSimulator: Simulator<SelfDividendInput, SelfDividendOutput> = {
  name: "self-dividend",
  title: "자가배당 vs 배당주",
  description: "동일 수령액 기준 법인 자가배당과 배당주 직접 보유의 총 세부담 비교",
  group: "법인·배당",
  schema: SelfDividendInput,
  compute: computeSelfDividend,
  defaultInput: {
    targetYearlyAmount: 30_000_000,
    corpTaxRate: 0.19,
    otherIncome: 0,
  },
};
