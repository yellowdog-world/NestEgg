import { z } from "zod";
import type { Simulator } from "./types";
import { comprehensiveTax, withLocal } from "./tax/comprehensiveTax";

export const CorpSalaryInput = z.object({
  /** 법인 영업이익(원). 대표 급여를 결정하는 베이스 */
  corpProfit: z.number().nonnegative(),
  /** 대표 외 종합과세 다른소득 */
  otherIncome: z.number().nonnegative().default(0),
});
export type CorpSalaryInput = z.infer<typeof CorpSalaryInput>;

export interface CorpSalaryScenario {
  name: string;
  yearlySalary: number;
  description: string;
  fourMajorInsurance: number;     // 4대보험 (단순 추정)
  incomeTax: number;              // 종합과세 산출세액(지방세 포함)
  netToOwner: number;             // 대표 실수령
  corpRemaining: number;          // 법인에 남는 이익(법인세 차감 전)
}

export interface CorpSalaryOutput {
  scenarios: CorpSalaryScenario[];
  recommended: CorpSalaryScenario;
}

const FOUR_MAJOR_RATE = 0.094; // 사업주 부담 + 본인 부담 합산 단순 추정 (변동)

function scenario(name: string, salary: number, otherIncome: number, desc: string, profit: number): CorpSalaryScenario {
  const fmi = salary * FOUR_MAJOR_RATE;
  const taxable = salary + otherIncome;
  // 근로소득공제 단순화: 미적용. v1은 보수적 추정.
  const tax = withLocal(comprehensiveTax(taxable));
  const net = salary - fmi - tax;
  const corpRem = profit - salary - fmi;
  return {
    name,
    yearlySalary: salary,
    description: desc,
    fourMajorInsurance: fmi,
    incomeTax: tax,
    netToOwner: net,
    corpRemaining: corpRem,
  };
}

/**
 * 법인 대표 급여 3구간 비교:
 *  ① 4대보험 최소 (월 약 230만원 / 연 2760만원 기준 — 보험료 부담 최소)
 *  ② 종합소득세 최저 (과세표준 1400만 이하 6%, 즉 연 ~1400만)
 *  ③ 균형 (연 5000만원 — 과표 5000만 이하 15%)
 */
export function computeCorpSalary(input: CorpSalaryInput): CorpSalaryOutput {
  const { corpProfit, otherIncome } = input;
  const scenarios: CorpSalaryScenario[] = [
    scenario("① 4대보험 최소", 27_600_000, otherIncome, "월 약 230만원. 4대보험 부담 최소화, 부족분은 배당으로", corpProfit),
    scenario("② 종합과세 최저", 14_000_000, otherIncome, "과세표준 1400만원 이하 6% 구간 — 소득세 최소", corpProfit),
    scenario("③ 균형 5천만", 50_000_000, otherIncome, "급여 + 4대보험 + 소득세 균형, 부족분은 배당", corpProfit),
  ];
  const recommended = scenarios.reduce((best, cur) => (cur.netToOwner > best.netToOwner ? cur : best), scenarios[0]);
  return { scenarios, recommended };
}

export const corpSalarySimulator: Simulator<CorpSalaryInput, CorpSalaryOutput> = {
  name: "corp-salary",
  title: "법인 연봉 최적화",
  description: "4대보험 최소 / 종합세 최저 / 균형 — 3구간 비교",
  group: "법인·배당",
  schema: CorpSalaryInput,
  compute: computeCorpSalary,
  defaultInput: {
    corpProfit: 200_000_000,
    otherIncome: 0,
  },
};
