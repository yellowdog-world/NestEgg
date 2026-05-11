"use client";

import { SimulatorShell } from "@/components/sim/SimulatorShell";
import { MoneyField, ToggleField } from "@/components/sim/NumberField";
import { ResultRow, Note } from "@/components/sim/ResultRow";
import { healthInsuranceSimulator } from "@/simulators/healthInsurance";
import { fmtKRW } from "@/lib/utils/format";

export default function HealthInsurancePage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">지역가입자 건보료</h1>
        <p className="mt-1 text-base text-neutral-600">
          은퇴 후 직장→지역 전환 시 월 보험료 추정. 단순화 모델 — 공단 모의계산기 교차 확인 권장.
        </p>
      </header>
      <SimulatorShell
        simulator={healthInsuranceSimulator}
        renderForm={(input, setInput) => (
          <>
            <MoneyField
              label="연 종합과세 소득"
              value={input.yearlyIncome}
              onChange={(v) => setInput({ ...input, yearlyIncome: v })}
              unit="만원"
              step={1_000_000}
              divisor={10_000}
              hint="연금 + 배당 + 사업 + 임대 등. 분리과세 1500만 이하 사적연금은 제외 가능."
            />
            <MoneyField
              label="재산 과세표준"
              value={input.propertyTaxBase}
              onChange={(v) => setInput({ ...input, propertyTaxBase: v })}
              unit="만원"
              step={1_000_000}
              divisor={10_000}
              hint="주택/토지 등 재산세 과세표준. 모르면 공시가액의 60% 정도로 추정."
            />
            <ToggleField
              label="배우자/자녀의 직장가입자 피부양자 등재 가능성 검토"
              value={input.hasDependentPath}
              onChange={(v) => setInput({ ...input, hasDependentPath: v })}
            />
          </>
        )}
        renderResult={(out) => (
          <div className="flex flex-col gap-3">
            <ResultRow label="월 소득 보험료" value={fmtKRW(Math.round(out.monthlyIncomePart))} />
            <ResultRow
              label="월 재산 보험료"
              value={fmtKRW(Math.round(out.monthlyPropertyPart))}
            />
            <ResultRow
              label="월 장기요양 보험료"
              value={fmtKRW(Math.round(out.monthlyLongTermCare))}
            />
            <ResultRow
              label="월 합계"
              value={fmtKRW(Math.round(out.monthlyTotal))}
              accent="red"
            />
            <ResultRow
              label="연 합계"
              value={fmtKRW(Math.round(out.yearlyTotal))}
              accent="red"
            />
            {out.notes.map((n, i) => (
              <Note key={i} tone="amber">
                {n}
              </Note>
            ))}
          </div>
        )}
      />
    </div>
  );
}
