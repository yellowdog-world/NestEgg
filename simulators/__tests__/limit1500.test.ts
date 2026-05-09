import { describe, expect, it } from "vitest";
import { computeLimit1500 } from "../limit1500";

describe("computeLimit1500", () => {
  it("한도 내(1500만원 이하)는 자동 저율 분리", () => {
    const out = computeLimit1500({
      yearlyWithdrawal: 12_000_000,
      age: 65,
      otherTaxableIncome: 0,
    });
    expect(out.withinLimit).toBe(true);
    expect(out.recommendation).toBe("separate");
  });

  it("경계값 1500만원 = 한도 내", () => {
    const out = computeLimit1500({
      yearlyWithdrawal: 15_000_000,
      age: 65,
      otherTaxableIncome: 0,
    });
    expect(out.withinLimit).toBe(true);
  });

  it("1500만원 초과 + 다른소득 적음 → 종합이 유리", () => {
    const out = computeLimit1500({
      yearlyWithdrawal: 18_000_000,
      age: 65,
      otherTaxableIncome: 0,
    });
    expect(out.withinLimit).toBe(false);
    // 다른소득 0, 연금 1800만 종합과세 시 1400만원 6% + 400만원 15% ~ 144만원
    // 분리 16.5% × 1800만 = 297만원 → 종합이 유리
    expect(out.recommendation).toBe("comprehensive");
  });

  it("1500만원 초과 + 다른소득 큼 → 분리가 유리", () => {
    const out = computeLimit1500({
      yearlyWithdrawal: 20_000_000,
      age: 65,
      otherTaxableIncome: 200_000_000, // 한계세율 35%
    });
    expect(out.withinLimit).toBe(false);
    // 한계 35% > 16.5% 이므로 분리 유리
    expect(out.recommendation).toBe("separate");
  });
});
