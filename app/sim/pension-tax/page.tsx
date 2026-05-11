"use client";

import { SimulatorShell } from "@/components/sim/SimulatorShell";
import { MoneyField, NumberField, SelectField } from "@/components/sim/NumberField";
import { pensionIncomeTaxSimulator } from "@/simulators/tax/pensionIncomeTax";
import { fmtKRW, fmtPct } from "@/lib/utils/format";

export default function PensionTaxPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">연금 인출 세금</h1>
        <p className="mt-1 text-base text-neutral-600">
          연저펀/IRP에서 연금형으로 인출 시 세율(3.3~5.5%)과 일시금 16.5%를 비교.
        </p>
      </header>
      <SimulatorShell
        simulator={pensionIncomeTaxSimulator}
        renderForm={(input, setInput) => (
          <>
            <MoneyField
              label="연 인출액"
              value={input.yearlyWithdrawal}
              onChange={(v) => setInput({ ...input, yearlyWithdrawal: v })}
              unit="만원"
              step={1_000_000}
              divisor={10_000}
              hint="1500만원 초과 시 한도 안내가 표시됩니다."
            />
            <NumberField
              label="만 나이"
              value={input.age}
              onChange={(v) => setInput({ ...input, age: Math.round(v) })}
              min={55}
              max={120}
            />
            <SelectField
              label="수령 방식"
              value={input.mode}
              onChange={(v) => setInput({ ...input, mode: v })}
              options={[
                { value: "annuity", label: "연금형 (분리과세 저율)" },
                { value: "lifetime", label: "종신형 우대 (4.4%)" },
                { value: "lump_sum", label: "일시금 (16.5%)" },
              ]}
            />
          </>
        )}
        renderResult={(out) => (
          <div className="flex flex-col gap-4">
            <Row label="적용 세율" value={`${out.rateLabel} (${fmtPct(out.taxRate)})`} />
            <Row label="세금" value={fmtKRW(out.taxAmount)} accent="red" />
            <Row label="실수령" value={fmtKRW(out.netAmount)} accent="green" />
            {out.warning && (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-base text-amber-900">
                ⚠️ {out.warning}
              </p>
            )}
            {out.needsSeparateVsComprehensiveChoice && (
              <p className="rounded-md bg-blue-50 px-3 py-2 text-base text-blue-900">
                연 1500만원 초과로 분리 16.5% vs 종합과세 선택 필요. <a href="/sim/limit-1500" className="font-medium underline">1500만원 한도 시뮬</a>에서 비교해보세요.
              </p>
            )}
          </div>
        )}
      />
    </div>
  );
}

function Row({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "red" | "green";
}) {
  const color =
    accent === "red"
      ? "text-red-700"
      : accent === "green"
        ? "text-emerald-700"
        : "text-neutral-900";
  return (
    <div className="flex items-center justify-between border-b border-neutral-100 pb-2 last:border-b-0">
      <span className="text-base text-neutral-600">{label}</span>
      <span className={`text-base font-medium ${color}`}>{value}</span>
    </div>
  );
}
