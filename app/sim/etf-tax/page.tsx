"use client";

import { SimulatorShell } from "@/components/sim/SimulatorShell";
import { NumberField, MoneyField } from "@/components/sim/NumberField";
import { ResultRow } from "@/components/sim/ResultRow";
import { etfTaxSimulator } from "@/simulators/etfTax";
import { fmtKRW, fmtPct } from "@/lib/utils/format";

export default function EtfTaxPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">해외 ETF 세금 비교</h1>
        <p className="mt-1 text-base text-neutral-600">
          동일한 평가차익을 일반계좌 / ISA / 연저펀에 담을 때 실효세를 비교.
        </p>
      </header>
      <SimulatorShell
        simulator={etfTaxSimulator}
        renderForm={(input, setInput) => (
          <>
            <MoneyField
              label="평가차익"
              value={input.capitalGain}
              onChange={(v) => setInput({ ...input, capitalGain: v })}
              unit="만원"
              step={1_000_000}
              divisor={10_000}
            />
            <NumberField
              label="연저펀 인출 시 만 나이"
              value={input.withdrawalAge}
              onChange={(v) => setInput({ ...input, withdrawalAge: Math.round(v) })}
              min={55}
              max={120}
              hint="65세 5.5% / 70~79세 4.4% / 80세+ 3.3%"
            />
          </>
        )}
        renderResult={(out) => (
          <div className="flex flex-col gap-3">
            {out.lines.map((line) => (
              <div
                key={line.account}
                className={`rounded-lg border p-3 ${
                  line.account === out.best.account
                    ? "border-emerald-500 bg-emerald-50"
                    : "border-neutral-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{line.label}</span>
                  <span className="text-base text-neutral-500">{fmtPct(line.effectiveRate)}</span>
                </div>
                <div className="mt-1 text-lg font-semibold">{fmtKRW(line.taxAmount)}</div>
                <div className="mt-1 text-sm text-neutral-600">{line.detail}</div>
              </div>
            ))}
            <ResultRow label="최저 세금 계좌" value={out.best.label} accent="green" />
          </div>
        )}
      />
    </div>
  );
}
