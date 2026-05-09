"use client";

import { SimulatorShell } from "@/components/sim/SimulatorShell";
import { NumberField, MoneyField, PercentField, ToggleField } from "@/components/sim/NumberField";
import { ResultRow } from "@/components/sim/ResultRow";
import { depletionSimulator } from "@/simulators/depletion/deterministic";
import { fmtKRWShort } from "@/lib/utils/format";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

export default function DepletionPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">자산 고갈 시점</h1>
        <p className="mt-1 text-sm text-neutral-600">
          매년 일정액을 인출했을 때 시작 시점 가치 기준으로 자산이 어떻게 변하는지.
        </p>
      </header>
      <SimulatorShell
        simulator={depletionSimulator}
        renderForm={(input, setInput) => (
          <>
            <NumberField
              label="시작 나이"
              value={input.startAge}
              onChange={(v) => setInput({ ...input, startAge: Math.round(v) })}
              min={20}
              max={120}
            />
            <MoneyField
              label="시작 자산"
              value={input.startAssets}
              onChange={(v) => setInput({ ...input, startAssets: v })}
              unit="원"
            />
            <MoneyField
              label="연 인출액 (시작 시점 가치)"
              value={input.yearlyWithdrawal}
              onChange={(v) => setInput({ ...input, yearlyWithdrawal: v })}
              unit="원/연"
            />
            <PercentField
              label="기대 수익률"
              value={input.expectedReturn}
              onChange={(v) => setInput({ ...input, expectedReturn: v })}
              step={0.5}
              hint="연 수익률. 인플레 차감 전 명목 기준."
            />
            <PercentField
              label="물가 상승률"
              value={input.inflation}
              onChange={(v) => setInput({ ...input, inflation: v })}
              step={0.5}
              hint="기본 2.5%."
            />
            <ToggleField
              label="인출액을 매년 인플레만큼 늘리기"
              value={input.inflateWithdrawal}
              onChange={(v) => setInput({ ...input, inflateWithdrawal: v })}
            />
            <NumberField
              label="시뮬 기간"
              value={input.horizonYears}
              onChange={(v) => setInput({ ...input, horizonYears: Math.round(v) })}
              unit="년"
              min={1}
              max={70}
            />
          </>
        )}
        renderResult={(out, input) => (
          <div className="flex flex-col gap-3">
            <ResultRow
              label="고갈 시점"
              value={out.depletedAtAge ? `만 ${out.depletedAtAge}세` : "기간 내 미고갈"}
              accent={out.depletedAtAge ? "red" : "green"}
            />
            <ResultRow label="기간 종료 시 자산 (명목)" value={fmtKRWShort(out.finalAssets)} />
            <ResultRow
              label="기간 종료 시 자산 (실질)"
              value={fmtKRWShort(out.finalRealAssets)}
            />
            <div className="mt-2 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={out.series}>
                  <XAxis dataKey="age" tickFormatter={(v) => `${v}세`} />
                  <YAxis tickFormatter={(v) => fmtKRWShort(v)} width={70} />
                  <Tooltip
                    formatter={(v) => fmtKRWShort(Number(v))}
                    labelFormatter={(v) => `만 ${v}세`}
                  />
                  <Line type="monotone" dataKey="endAssets" name="명목 자산" stroke="#0ea5e9" dot={false} />
                  <Line
                    type="monotone"
                    dataKey="realEndAssets"
                    name="실질 자산"
                    stroke="#10b981"
                    strokeDasharray="4 4"
                    dot={false}
                  />
                  {out.depletedAtAge && (
                    <ReferenceLine x={out.depletedAtAge} stroke="#ef4444" label={{ value: "고갈", fill: "#ef4444" }} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-neutral-500">
              시작 나이 {input.startAge}세, 시뮬 기간 {input.horizonYears}년
            </p>
          </div>
        )}
      />
    </div>
  );
}
