"use client";

import { SimulatorShell } from "@/components/sim/SimulatorShell";
import { NumberField, MoneyField } from "@/components/sim/NumberField";
import { ResultRow, Note } from "@/components/sim/ResultRow";
import { limit1500Simulator } from "@/simulators/limit1500";
import { fmtKRW } from "@/lib/utils/format";

export default function Limit1500Page() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">1500만원 한도</h1>
        <p className="mt-1 text-base text-neutral-600">
          연 1500만원 초과 시 16.5% 분리과세 vs 종합과세 중 어느 쪽이 유리한지 자동 비교.
        </p>
      </header>
      <SimulatorShell
        simulator={limit1500Simulator}
        renderForm={(input, setInput) => (
          <>
            <MoneyField
              label="연 인출액"
              value={input.yearlyWithdrawal}
              onChange={(v) => setInput({ ...input, yearlyWithdrawal: v })}
              unit="만원"
              step={1_000_000}
              divisor={10_000}
            />
            <NumberField
              label="만 나이"
              value={input.age}
              onChange={(v) => setInput({ ...input, age: Math.round(v) })}
              min={55}
              max={120}
            />
            <MoneyField
              label="다른 종합과세 소득"
              value={input.otherTaxableIncome}
              onChange={(v) => setInput({ ...input, otherTaxableIncome: v })}
              unit="만원"
              step={1_000_000}
              divisor={10_000}
              hint="근로/사업/이자배당 등 종합과세 합산 대상의 합. 모르면 0."
            />
          </>
        )}
        renderResult={(out) => (
          <div className="flex flex-col gap-3">
            {out.withinLimit ? (
              <Note tone="blue">
                연 1500만원 한도 이내 — 자동으로 저율 분리과세가 적용됩니다.
              </Note>
            ) : (
              <>
                <ResultRow label="① 분리 16.5%" value={fmtKRW(out.separateTaxAmount)} />
                <ResultRow label="② 종합과세 증가분" value={fmtKRW(out.comprehensiveTaxAmount)} />
                <ResultRow
                  label="추천"
                  value={out.recommendation === "separate" ? "① 분리과세 16.5%" : "② 종합과세"}
                  accent={out.recommendation === "separate" ? "blue" : "green"}
                />
                <ResultRow
                  label="차이 (양수면 종합 유리)"
                  value={fmtKRW(out.diff)}
                  accent={out.diff > 0 ? "green" : "red"}
                />
              </>
            )}
          </div>
        )}
      />
    </div>
  );
}
