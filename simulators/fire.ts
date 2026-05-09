import { z } from "zod";
import type { Simulator } from "./types";
import { DEFAULT_SWR } from "./constants/2026";

export const FireInput = z.object({
  monthlySpend: z.number().nonnegative(),         // 월 지출(원)
  swr: z.number().min(0.01).max(0.10).default(DEFAULT_SWR),
  currentAssets: z.number().nonnegative().default(0),
  yearlySaving: z.number().nonnegative().default(0),
  expectedReturn: z.number().min(-0.5).max(0.5).default(0.05),
});
export type FireInput = z.infer<typeof FireInput>;

export interface FireOutput {
  yearlySpend: number;
  targetAssets: number;
  shortfall: number;
  yearsToFire: number | null;     // null이면 평생 도달 불가
  multiple: number;               // 목표 자산 / 연 지출
}

/**
 * FIRE 계산:
 *  - 목표 자산 = 연 지출 / SWR (기본 4%)
 *  - 미래 자산 = currentAssets * (1+r)^t + yearlySaving * ((1+r)^t - 1) / r
 *  - 목표 도달 t를 뉴턴/이분법 대신 연도 단위 시뮬로 찾음
 */
export function computeFire(input: FireInput): FireOutput {
  const { monthlySpend, swr, currentAssets, yearlySaving, expectedReturn } = input;
  const yearlySpend = monthlySpend * 12;
  const target = yearlySpend / swr;
  const shortfall = Math.max(0, target - currentAssets);

  let years: number | null = null;
  let assets = currentAssets;
  for (let t = 0; t <= 100; t++) {
    if (assets >= target) {
      years = t;
      break;
    }
    assets = assets * (1 + expectedReturn) + yearlySaving;
  }

  return {
    yearlySpend,
    targetAssets: target,
    shortfall,
    yearsToFire: years,
    multiple: target / Math.max(yearlySpend, 1),
  };
}

export const fireSimulator: Simulator<FireInput, FireOutput> = {
  name: "fire",
  title: "FIRE 계산기",
  description: "월 지출 + 안전인출률(SWR)로 은퇴 목표 자산과 도달 연도 추정",
  group: "포트폴리오",
  schema: FireInput,
  compute: computeFire,
  defaultInput: {
    monthlySpend: 3_000_000,
    swr: 0.04,
    currentAssets: 100_000_000,
    yearlySaving: 24_000_000,
    expectedReturn: 0.05,
  },
};
