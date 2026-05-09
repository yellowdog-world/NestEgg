"use client";

import { SimulatorShell } from "@/components/sim/SimulatorShell";
import { MoneyField, PercentField } from "@/components/sim/NumberField";
import { ResultRow } from "@/components/sim/ResultRow";
import { selfDividendSimulator } from "@/simulators/selfDividend";
import { fmtKRW } from "@/lib/utils/format";

export default function SelfDividendPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">자가배당 vs 배당주</h1>
        <p className="mt-1 text-sm text-neutral-600">
          동일 수령액 기준 법인 자가배당과 배당주 직접 보유의 총 세부담 비교.
        </p>
      </header>
      <SimulatorShell
        simulator={selfDividendSimulator}
        renderForm={(input, setInput) => (
          <>
            <MoneyField
              label="목표 수령액 (실수령)"
              value={input.targetYearlyAmount}
              onChange={(v) => setInput({ ...input, targetYearlyAmount: v })}
              unit="원/연"
            />
            <PercentField
              label="법인세 실효세율"
              value={input.corpTaxRate}
              onChange={(v) => setInput({ ...input, corpTaxRate: v })}
              step={1}
              min={0}
              max={50}
              hint="중소법인 10~20% 정도. 모르면 19%."
            />
            <MoneyField
              label="다른 종합과세 소득"
              value={input.otherIncome}
              onChange={(v) => setInput({ ...input, otherIncome: v })}
              unit="원/연"
            />
          </>
        )}
        renderResult={(out) => (
          <div className="flex flex-col gap-3">
            {out.scenarios.map((s) => (
              <div
                key={s.label}
                className={`rounded-lg border p-3 ${
                  s.label === out.recommended.label
                    ? "border-emerald-500 bg-emerald-50"
                    : "border-neutral-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{s.label}</span>
                </div>
                <p className="mt-1 text-xs text-neutral-600">{s.detail}</p>
                <div className="mt-2 grid grid-cols-3 gap-1 text-sm">
                  <div>
                    <div className="text-xs text-neutral-500">총 비용</div>
                    <div>{fmtKRW(Math.round(s.grossNeeded))}</div>
                  </div>
                  <div>
                    <div className="text-xs text-neutral-500">총 세금</div>
                    <div className="text-red-700">{fmtKRW(Math.round(s.totalTax))}</div>
                  </div>
                  <div>
                    <div className="text-xs text-neutral-500">실수령</div>
                    <div className="text-emerald-700">{fmtKRW(Math.round(s.netReceived))}</div>
                  </div>
                </div>
              </div>
            ))}
            <ResultRow label="추천" value={out.recommended.label} accent="green" />
          </div>
        )}
      />
    </div>
  );
}
