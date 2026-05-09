import { describe, expect, it } from "vitest";
import { computeFire } from "../fire";

describe("computeFire", () => {
  it("월 300만 지출, SWR 4% → 목표 9억", () => {
    const out = computeFire({
      monthlySpend: 3_000_000,
      swr: 0.04,
      currentAssets: 0,
      yearlySaving: 0,
      expectedReturn: 0.05,
    });
    expect(out.yearlySpend).toBe(36_000_000);
    expect(out.targetAssets).toBe(900_000_000);
    expect(out.multiple).toBe(25);
    expect(out.yearsToFire).toBeNull(); // 저축 0이면 도달 불가
  });

  it("이미 목표에 도달한 경우 yearsToFire = 0", () => {
    const out = computeFire({
      monthlySpend: 3_000_000,
      swr: 0.04,
      currentAssets: 1_000_000_000,
      yearlySaving: 0,
      expectedReturn: 0.05,
    });
    expect(out.yearsToFire).toBe(0);
    expect(out.shortfall).toBe(0);
  });

  it("연 2400만 저축 + 5% 수익률로 도달 가능", () => {
    const out = computeFire({
      monthlySpend: 3_000_000,
      swr: 0.04,
      currentAssets: 100_000_000,
      yearlySaving: 24_000_000,
      expectedReturn: 0.05,
    });
    expect(out.yearsToFire).not.toBeNull();
    expect(out.yearsToFire!).toBeGreaterThan(15);
    expect(out.yearsToFire!).toBeLessThan(40);
  });
});
