import { COMPREHENSIVE_TAX_BRACKETS, LOCAL_TAX_RATE } from "../constants/2026";

/**
 * 종합소득세 산출세액 (지방세 별도).
 * 본세만 반환. 지방세 포함 총액은 withLocal() 사용.
 */
export function comprehensiveTax(taxableIncome: number): number {
  if (taxableIncome <= 0) return 0;
  for (const b of COMPREHENSIVE_TAX_BRACKETS) {
    if (taxableIncome <= b.upTo) {
      return Math.max(0, taxableIncome * b.rate - b.deduct);
    }
  }
  return 0;
}

export function withLocal(taxAmount: number): number {
  return taxAmount * (1 + LOCAL_TAX_RATE);
}

/** 해당 과세표준에서의 한계세율(지방세 별도) */
export function marginalRate(taxableIncome: number): number {
  for (const b of COMPREHENSIVE_TAX_BRACKETS) {
    if (taxableIncome <= b.upTo) return b.rate;
  }
  return COMPREHENSIVE_TAX_BRACKETS[COMPREHENSIVE_TAX_BRACKETS.length - 1].rate;
}
