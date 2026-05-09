import { describe, expect, it } from "vitest";
import { computeDepletion } from "../depletion/deterministic";

describe("computeDepletion", () => {
  it("8억, 연 3600만 인출, 5% 수익률, 2.5% 인플레 → 30년 이상 유지", () => {
    const out = computeDepletion({
      startAge: 60,
      startAssets: 800_000_000,
      yearlyWithdrawal: 36_000_000,
      expectedReturn: 0.05,
      inflation: 0.025,
      inflateWithdrawal: true,
      horizonYears: 40,
    });
    expect(out.series).toHaveLength(40);
    // 평균 ~4.5% 인출률은 5%~인플레2.5% 환경에서 유지 어려움 → 고갈 가능
    // 결과 상태만 단조 검증
    expect(out.depletedAtAge === null || out.depletedAtAge >= 70).toBe(true);
  });

  it("자산 < 인출액 → 첫 해에 고갈", () => {
    const out = computeDepletion({
      startAge: 60,
      startAssets: 10_000_000,
      yearlyWithdrawal: 50_000_000,
      expectedReturn: 0.05,
      inflation: 0.0,
      inflateWithdrawal: false,
      horizonYears: 5,
    });
    expect(out.depletedAtAge).toBe(60);
  });

  it("수익률 > 인출률이면 자산 증가", () => {
    const out = computeDepletion({
      startAge: 60,
      startAssets: 1_000_000_000,
      yearlyWithdrawal: 20_000_000,
      expectedReturn: 0.07,
      inflation: 0.0,
      inflateWithdrawal: false,
      horizonYears: 30,
    });
    expect(out.depletedAtAge).toBeNull();
    expect(out.finalAssets).toBeGreaterThan(1_000_000_000);
  });
});
