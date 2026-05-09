import { describe, expect, it } from "vitest";
import { computeHealthInsurance } from "../healthInsurance";

describe("computeHealthInsurance", () => {
  it("연 3000만 소득, 재산 없음 → 월 보험료 추정 산출", () => {
    const out = computeHealthInsurance({
      yearlyIncome: 30_000_000,
      propertyTaxBase: 0,
      hasDependentPath: false,
    });
    // 30,000,000 × 0.0709 / 12 ≈ 177,250
    expect(out.monthlyIncomePart).toBeCloseTo(177_250, 0);
    expect(out.monthlyPropertyPart).toBe(0);
    expect(out.monthlyTotal).toBeGreaterThan(out.monthlyIncomePart);
  });

  it("소득 0, 재산 5억 → 재산 보험료만", () => {
    const out = computeHealthInsurance({
      yearlyIncome: 0,
      propertyTaxBase: 500_000_000,
      hasDependentPath: false,
    });
    expect(out.monthlyIncomePart).toBe(0);
    expect(out.monthlyPropertyPart).toBeGreaterThan(0);
  });

  it("연 2000만 초과 시 피부양자 자격 경고 노트", () => {
    const out = computeHealthInsurance({
      yearlyIncome: 25_000_000,
      propertyTaxBase: 0,
      hasDependentPath: true,
    });
    expect(out.notes.some((n) => n.includes("피부양자"))).toBe(true);
  });
});
