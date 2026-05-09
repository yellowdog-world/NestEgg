import { describe, expect, it } from "vitest";
import { comprehensiveTax, marginalRate, withLocal } from "../tax/comprehensiveTax";

describe("comprehensiveTax", () => {
  it("1400만원 이하 6% 구간", () => {
    expect(comprehensiveTax(10_000_000)).toBe(600_000);
    expect(comprehensiveTax(14_000_000)).toBe(840_000);
  });

  it("5000만원 (15% 구간) — 5000×15% − 126만 = 624만", () => {
    expect(comprehensiveTax(50_000_000)).toBe(50_000_000 * 0.15 - 1_260_000);
  });

  it("음수/0은 0", () => {
    expect(comprehensiveTax(0)).toBe(0);
    expect(comprehensiveTax(-100_000)).toBe(0);
  });

  it("marginalRate", () => {
    expect(marginalRate(10_000_000)).toBe(0.06);
    expect(marginalRate(40_000_000)).toBe(0.15);
    expect(marginalRate(80_000_000)).toBe(0.24);
  });

  it("withLocal — 지방세 10% 가산", () => {
    expect(withLocal(1_000_000)).toBe(1_100_000);
  });
});
