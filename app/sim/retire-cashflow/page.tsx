"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { SimulatorShell } from "@/components/sim/SimulatorShell";
import { NumberField, MoneyField } from "@/components/sim/NumberField";
import { ResultRow } from "@/components/sim/ResultRow";
import { retireCashflowSimulator } from "@/simulators/retireCashflow";
import { fmtKRW } from "@/lib/utils/format";

function RetireCashflowSimulator() {
  const params = useSearchParams();
  const raw = params.get("dividendYearly");
  const preset = raw ? { dividendYearly: Number(raw) } : undefined;

  return (
    <SimulatorShell
      simulator={retireCashflowSimulator}
      preset={preset}
      renderForm={(input, setInput) => (
        <>
          <NumberField
            label="만 나이"
            value={input.age}
            onChange={(v) => setInput({ ...input, age: Math.round(v) })}
            min={55}
            max={120}
          />
          <MoneyField
            label="사적연금 연 수령액 (연저펀+IRP)"
            value={input.pensionFundYearly}
            onChange={(v) => setInput({ ...input, pensionFundYearly: v })}
            unit="만원"
            step={1_000_000}
            divisor={10_000}
          />
          <MoneyField
            label="국민연금 월 수령액"
            value={input.nationalPensionMonthly}
            onChange={(v) => setInput({ ...input, nationalPensionMonthly: v })}
            unit="만원"
            step={100_000}
            divisor={10_000}
          />
          <MoneyField
            label="배당 연 수령액"
            value={input.dividendYearly}
            onChange={(v) => setInput({ ...input, dividendYearly: v })}
            unit="만원"
            step={1_000_000}
            divisor={10_000}
          />
          <MoneyField
            label="임대 월 수령액"
            value={input.rentMonthly}
            onChange={(v) => setInput({ ...input, rentMonthly: v })}
            unit="만원"
            step={100_000}
            divisor={10_000}
          />
        </>
      )}
      renderResult={(out) => (
        <div className="flex flex-col gap-3">
          <ResultRow label="월 명목 수령" value={fmtKRW(Math.round(out.monthlyGross))} />
          <ResultRow
            label="월 실수령"
            value={fmtKRW(Math.round(out.monthlyNet))}
            accent="green"
          />
          <ResultRow label="연 명목" value={fmtKRW(Math.round(out.yearlyGross))} />
          <ResultRow
            label="연 실수령"
            value={fmtKRW(Math.round(out.yearlyNet))}
            accent="green"
          />
          <div className="mt-2 rounded-lg bg-neutral-50 p-3">
            <h3 className="mb-2 text-base font-medium">내역</h3>
            <table className="w-full text-base">
              <thead className="text-sm text-neutral-500">
                <tr>
                  <th className="text-left">소스</th>
                  <th className="text-right">명목</th>
                  <th className="text-right">세금</th>
                  <th className="text-right">실수령</th>
                </tr>
              </thead>
              <tbody>
                {out.breakdown.map((b) => (
                  <tr key={b.label} className="border-t border-neutral-200">
                    <td className="py-1">{b.label}</td>
                    <td className="text-right">{fmtKRW(b.gross)}</td>
                    <td className="text-right text-red-700">{fmtKRW(Math.round(b.tax))}</td>
                    <td className="text-right">{fmtKRW(Math.round(b.net))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    />
  );
}

export default function RetireCashflowPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">은퇴 후 월급 플랜</h1>
        <p className="mt-1 text-base text-neutral-600">
          연저펀/IRP, 국민연금, 배당, 임대를 합쳐 월·연 순수령액을 계산.
        </p>
      </header>
      <Suspense>
        <RetireCashflowSimulator />
      </Suspense>
    </div>
  );
}
