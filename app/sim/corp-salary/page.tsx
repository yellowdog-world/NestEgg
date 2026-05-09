"use client";

import { SimulatorShell } from "@/components/sim/SimulatorShell";
import { MoneyField } from "@/components/sim/NumberField";
import { ResultRow } from "@/components/sim/ResultRow";
import { corpSalarySimulator } from "@/simulators/corpSalary";
import { fmtKRW, fmtKRWShort } from "@/lib/utils/format";

export default function CorpSalaryPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">법인 연봉 최적화</h1>
        <p className="mt-1 text-sm text-neutral-600">
          ① 4대보험 최소 / ② 종합세 최저 / ③ 균형 — 3개 시나리오 비교 (단순화 모델).
        </p>
      </header>
      <SimulatorShell
        simulator={corpSalarySimulator}
        renderForm={(input, setInput) => (
          <>
            <MoneyField
              label="법인 영업이익 (대표 급여 차감 전)"
              value={input.corpProfit}
              onChange={(v) => setInput({ ...input, corpProfit: v })}
              unit="만원"
              step={1_000_000}
              divisor={10_000}
            />
            <MoneyField
              label="다른 종합과세 소득"
              value={input.otherIncome}
              onChange={(v) => setInput({ ...input, otherIncome: v })}
              unit="만원"
              step={1_000_000}
              divisor={10_000}
            />
          </>
        )}
        renderResult={(out) => (
          <div className="flex flex-col gap-3">
            {out.scenarios.map((s) => (
              <div
                key={s.name}
                className={`rounded-lg border p-3 ${
                  s.name === out.recommended.name
                    ? "border-emerald-500 bg-emerald-50"
                    : "border-neutral-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{s.name}</span>
                  <span className="text-xs text-neutral-500">
                    연봉 {fmtKRWShort(s.yearlySalary)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-neutral-600">{s.description}</p>
                <div className="mt-2 grid grid-cols-2 gap-1 text-sm">
                  <div>
                    <span className="text-neutral-500">4대보험: </span>
                    {fmtKRW(Math.round(s.fourMajorInsurance))}
                  </div>
                  <div>
                    <span className="text-neutral-500">소득세: </span>
                    {fmtKRW(Math.round(s.incomeTax))}
                  </div>
                  <div>
                    <span className="text-neutral-500">실수령: </span>
                    <strong>{fmtKRW(Math.round(s.netToOwner))}</strong>
                  </div>
                  <div>
                    <span className="text-neutral-500">법인 잔여: </span>
                    {fmtKRWShort(s.corpRemaining)}
                  </div>
                </div>
              </div>
            ))}
            <ResultRow label="추천 시나리오" value={out.recommended.name} accent="green" />
          </div>
        )}
      />
    </div>
  );
}
