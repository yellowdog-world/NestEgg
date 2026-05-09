import { describe, expect, it } from "vitest";
import { computePensionIncomeTax } from "../tax/pensionIncomeTax";

describe("computePensionIncomeTax", () => {
  it("65세 1200만원 연금형 → 5.5%, 66만원 세금", () => {
    const out = computePensionIncomeTax({
      yearlyWithdrawal: 12_000_000,
      age: 65,
      mode: "annuity",
    });
    expect(out.taxRate).toBe(0.055);
    expect(out.taxAmount).toBe(660_000);
    expect(out.netAmount).toBe(11_340_000);
    expect(out.needsSeparateVsComprehensiveChoice).toBe(false);
  });

  it("75세 1200만원 연금형 → 4.4%, 52.8만원", () => {
    const out = computePensionIncomeTax({
      yearlyWithdrawal: 12_000_000,
      age: 75,
      mode: "annuity",
    });
    expect(out.taxRate).toBe(0.044);
    expect(out.taxAmount).toBeCloseTo(528_000, 0);
  });

  it("85세 1200만원 연금형 → 3.3%, 39.6만원", () => {
    const out = computePensionIncomeTax({
      yearlyWithdrawal: 12_000_000,
      age: 85,
      mode: "annuity",
    });
    expect(out.taxRate).toBe(0.033);
    expect(out.taxAmount).toBeCloseTo(396_000, 0);
  });

  it("65세 1200만원 일시금 → 16.5%, 198만원", () => {
    const out = computePensionIncomeTax({
      yearlyWithdrawal: 12_000_000,
      age: 65,
      mode: "lump_sum",
    });
    expect(out.taxRate).toBe(0.165);
    expect(out.taxAmount).toBe(1_980_000);
    expect(out.warning).toBeDefined();
  });

  it("65세 1500만원 연금형(경계) → 한도 내, 분리과세 자동", () => {
    const out = computePensionIncomeTax({
      yearlyWithdrawal: 15_000_000,
      age: 65,
      mode: "annuity",
    });
    expect(out.needsSeparateVsComprehensiveChoice).toBe(false);
  });

  it("65세 1800만원 연금형(초과) → 분리/종합 선택 안내", () => {
    const out = computePensionIncomeTax({
      yearlyWithdrawal: 18_000_000,
      age: 65,
      mode: "annuity",
    });
    expect(out.needsSeparateVsComprehensiveChoice).toBe(true);
  });

  it("65세 1200만원 종신형 → 4.4%, 우대", () => {
    const out = computePensionIncomeTax({
      yearlyWithdrawal: 12_000_000,
      age: 65,
      mode: "lifetime",
    });
    expect(out.taxRate).toBe(0.044);
  });
});
