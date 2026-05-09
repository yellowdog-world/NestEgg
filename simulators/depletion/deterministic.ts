import { z } from "zod";
import type { Simulator } from "../types";

export const DepletionInput = z.object({
  startAge: z.number().int().min(20).max(120).default(60),
  startAssets: z.number().nonnegative(),
  yearlyWithdrawal: z.number().nonnegative(),
  expectedReturn: z.number().min(-0.5).max(0.5).default(0.05),
  inflation: z.number().min(-0.1).max(0.2).default(0.025),
  /** 매년 인출액을 인플레만큼 늘릴지 */
  inflateWithdrawal: z.boolean().default(true),
  horizonYears: z.number().int().min(1).max(70).default(40),
});
export type DepletionInput = z.infer<typeof DepletionInput>;

export interface YearlySnapshot {
  age: number;
  withdrawal: number;        // 명목
  realWithdrawal: number;    // 시작 시점 가치
  endAssets: number;         // 명목
  realEndAssets: number;     // 시작 시점 가치
}

export interface DepletionOutput {
  series: YearlySnapshot[];
  depletedAtAge: number | null;  // null이면 horizon 동안 고갈 안 함
  finalAssets: number;
  finalRealAssets: number;
}

export function computeDepletion(input: DepletionInput): DepletionOutput {
  const {
    startAge,
    startAssets,
    yearlyWithdrawal,
    expectedReturn,
    inflation,
    inflateWithdrawal,
    horizonYears,
  } = input;

  const series: YearlySnapshot[] = [];
  let assets = startAssets;
  let depletedAtAge: number | null = null;

  for (let i = 0; i < horizonYears; i++) {
    const age = startAge + i;
    const inflateFactor = inflateWithdrawal ? Math.pow(1 + inflation, i) : 1;
    const wd = yearlyWithdrawal * inflateFactor;

    // 연초 인출 → 잔여 자산이 1년간 expectedReturn으로 성장 (단순 모델)
    const afterWd = assets - wd;
    if (afterWd <= 0 && depletedAtAge === null) {
      depletedAtAge = age;
      // 그 해의 잔액은 0으로 처리
      series.push({
        age,
        withdrawal: wd,
        realWithdrawal: yearlyWithdrawal,
        endAssets: 0,
        realEndAssets: 0,
      });
      assets = 0;
      continue;
    }

    assets = afterWd * (1 + expectedReturn);
    const realAssets = assets / Math.pow(1 + inflation, i + 1);
    series.push({
      age,
      withdrawal: wd,
      realWithdrawal: yearlyWithdrawal,
      endAssets: assets,
      realEndAssets: realAssets,
    });
  }

  return {
    series,
    depletedAtAge,
    finalAssets: assets,
    finalRealAssets: assets / Math.pow(1 + inflation, horizonYears),
  };
}

export const depletionSimulator: Simulator<DepletionInput, DepletionOutput> = {
  name: "depletion",
  title: "자산 고갈 시점",
  description: "수익률·인플레·인출액 시나리오로 매년 잔액과 고갈 나이를 시뮬",
  group: "포트폴리오",
  schema: DepletionInput,
  compute: computeDepletion,
  defaultInput: {
    startAge: 60,
    startAssets: 800_000_000,
    yearlyWithdrawal: 36_000_000,
    expectedReturn: 0.05,
    inflation: 0.025,
    inflateWithdrawal: true,
    horizonYears: 40,
  },
};
