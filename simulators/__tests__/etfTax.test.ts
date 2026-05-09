import { describe, expect, it } from "vitest";
import { computeEtfTax } from "../etfTax";

describe("computeEtfTax", () => {
  it("1000만원 차익: 일반 vs ISA vs 연저펀(65세)", () => {
    const out = computeEtfTax({ capitalGain: 10_000_000, withdrawalAge: 65 });
    const reg = out.lines.find((l) => l.account === "regular")!;
    const isa = out.lines.find((l) => l.account === "isa")!;
    const pf = out.lines.find((l) => l.account === "pension_fund")!;

    // 일반: (1000만 - 250만) × 22% = 165만
    expect(reg.taxAmount).toBe(1_650_000);
    // ISA: (1000만 - 200만) × 9.9% = 79.2만
    expect(isa.taxAmount).toBeCloseTo(792_000, 0);
    // 연저펀(65세): 1000만 × 5.5% = 55만
    expect(pf.taxAmount).toBe(550_000);

    expect(out.best.account).toBe("pension_fund");
  });

  it("250만원 차익(공제 이내): 일반 0원, 연저펀 13.75만, ISA 0.495만", () => {
    const out = computeEtfTax({ capitalGain: 2_500_000, withdrawalAge: 65 });
    const reg = out.lines.find((l) => l.account === "regular")!;
    expect(reg.taxAmount).toBe(0);
    expect(out.best.account).toBe("regular");
  });

  it("80세 연저펀 인출이면 3.3%", () => {
    const out = computeEtfTax({ capitalGain: 10_000_000, withdrawalAge: 85 });
    const pf = out.lines.find((l) => l.account === "pension_fund")!;
    expect(pf.taxAmount).toBe(330_000);
  });
});
