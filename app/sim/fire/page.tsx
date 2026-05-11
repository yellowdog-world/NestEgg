"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { SimulatorShell } from "@/components/sim/SimulatorShell";
import { MoneyField, PercentField } from "@/components/sim/NumberField";
import { ResultRow } from "@/components/sim/ResultRow";
import { fireSimulator } from "@/simulators/fire";
import { fmtKRW, fmtKRWShort } from "@/lib/utils/format";

function FireSimulator() {
  const params = useSearchParams();
  const raw = params.get("currentAssets");
  const preset = raw ? { currentAssets: Number(raw) } : undefined;

  return (
    <SimulatorShell
      simulator={fireSimulator}
      preset={preset}
      renderForm={(input, setInput) => (
        <>
          <MoneyField
            label="월 지출"
            value={input.monthlySpend}
            onChange={(v) => setInput({ ...input, monthlySpend: v })}
            unit="만원"
            step={100_000}
            divisor={10_000}
          />
          <PercentField
            label="안전인출률 (SWR)"
            value={input.swr}
            onChange={(v) => setInput({ ...input, swr: v })}
            step={0.5}
            min={1}
            max={10}
            hint="기본 4% 룰. 보수적이면 3.5%, 공격적이면 4.5%."
          />
          <MoneyField
            label="현재 자산"
            value={input.currentAssets}
            onChange={(v) => setInput({ ...input, currentAssets: v })}
            unit="만원"
            step={1_000_000}
            divisor={10_000}
          />
          <MoneyField
            label="연 저축액"
            value={input.yearlySaving}
            onChange={(v) => setInput({ ...input, yearlySaving: v })}
            unit="만원"
            step={1_000_000}
            divisor={10_000}
          />
          <PercentField
            label="기대 수익률"
            value={input.expectedReturn}
            onChange={(v) => setInput({ ...input, expectedReturn: v })}
            step={0.5}
            hint="인플레 차감 후 실질 수익률 권장. (기본 5%)"
          />
        </>
      )}
      renderResult={(out) => (
        <div className="flex flex-col gap-3">
          <ResultRow label="연 지출" value={fmtKRW(out.yearlySpend)} />
          <ResultRow
            label="목표 자산"
            value={fmtKRWShort(out.targetAssets)}
            accent="blue"
          />
          <ResultRow label="자산 배수" value={`연지출의 ${out.multiple.toFixed(1)}배`} />
          <ResultRow label="부족액" value={fmtKRWShort(out.shortfall)} />
          <ResultRow
            label="도달까지"
            value={
              out.yearsToFire === null
                ? "100년 내 도달 어려움"
                : `${out.yearsToFire}년`
            }
            accent={out.yearsToFire !== null ? "green" : "red"}
          />
        </div>
      )}
    />
  );
}

export default function FirePage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">FIRE 계산기</h1>
        <p className="mt-1 text-base text-neutral-600">
          연 지출과 안전인출률(SWR)로 은퇴에 필요한 자산 규모를 계산. 4% 룰 = 연 지출의 25배.
        </p>
      </header>
      <Suspense>
        <FireSimulator />
      </Suspense>
    </div>
  );
}
