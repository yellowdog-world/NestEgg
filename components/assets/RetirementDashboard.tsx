"use client";

import { useState, useEffect } from "react";
import {
  ComposedChart, Area, Line, ReferenceLine,
  XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { fmtKRW, fmtKRWShort } from "@/lib/utils/format";
import { computeDepletion, type DepletionOutput } from "@/simulators/depletion/deterministic";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PortfolioData = {
  totalKrw: number;
  pensionKrw: number;
  stocksKrw: number;
  cashKrw: number;
  monthlyDivKrw: number;
  usdKrw: number;
  avgReturnPct: number | null;
};

type RetirementProfile = {
  currentAge: number;
  retirementAge: number;
  targetAge: number;
  monthlyBudget: number;
  /** 0 = 내 자산 자동 사용, >0 = 사용자 직접 입력값 (원 단위) */
  overrideAssetsKrw: number;
  nationalPensionMonthly: number;
  privatePensionMonthly: number;
  expectedReturn: number;
  inflation: number;
};

const STORAGE_KEY = "retirement-profile";

const DEFAULT: RetirementProfile = {
  currentAge: 50,
  retirementAge: 60,
  targetAge: 90,
  monthlyBudget: 3_000_000,
  overrideAssetsKrw: 0,
  nationalPensionMonthly: 0,
  privatePensionMonthly: 0,
  expectedReturn: 0.05,
  inflation: 0.031,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadProfile(): RetirementProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT, ...JSON.parse(raw) } : null;
  } catch {
    return null;
  }
}

function saveProfile(p: RetirementProfile) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}

function fmtSurvival(years: number | null): string {
  if (years === null) return "계속 유지";
  if (years <= 0) return "0년";
  const y = Math.floor(years);
  const m = Math.round((years - y) * 12);
  return m > 0 ? `${y}년 ${m}개월` : `${y}년`;
}

function parseWon(s: string): number {
  const n = parseFloat(s.replace(/,/g, ""));
  return isNaN(n) ? 0 : Math.round(n * 10_000);
}

function toManWon(n: number): string {
  return n === 0 ? "" : String(Math.round(n / 10_000));
}

// ── Setup Wizard ──────────────────────────────────────────────────────────────

function SetupWizard({
  onComplete,
  portfolioData,
}: {
  onComplete: (p: RetirementProfile) => void;
  portfolioData: PortfolioData;
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<RetirementProfile>(DEFAULT);
  const total = 4;

  function next() {
    if (step < total - 1) setStep((s) => s + 1);
    else {
      saveProfile(form);
      onComplete(form);
    }
  }
  function back() {
    setStep((s) => s - 1);
  }

  const progress = ((step + 1) / total) * 100;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">은퇴 자산 설정</h1>
        <p className="mt-1 text-base text-neutral-500">
          몇 가지 정보를 입력하면 나만의 은퇴 대시보드를 만들어 드려요.
        </p>
      </header>

      {/* 진행 바 */}
      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-sm text-neutral-400">
          <span>{step + 1}단계 / {total}단계</span>
          <span>{["기본 정보", "생활비 계획", "연금 계획", "수익률 설정"][step]}</span>
        </div>
        <div className="h-1.5 rounded-full bg-neutral-100">
          <div
            className="h-1.5 rounded-full bg-amber-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* 각 스텝 */}
      <div className="rounded-xl border border-neutral-200 bg-white p-6">
        {step === 0 && (
          <Step1
            form={form}
            onChange={(k, v) => setForm((f) => ({ ...f, [k]: v }))}
          />
        )}
        {step === 1 && (
          <Step2
            form={form}
            onChange={(k, v) => setForm((f) => ({ ...f, [k]: v }))}
          />
        )}
        {step === 2 && (
          <Step4
            form={form}
            onChange={(k, v) => setForm((f) => ({ ...f, [k]: v }))}
          />
        )}
        {step === 3 && (
          <Step5
            form={form}
            onChange={(k, v) => setForm((f) => ({ ...f, [k]: v }))}
            portfolioData={portfolioData}
          />
        )}
      </div>

      <div className="flex gap-3">
        {step > 0 && (
          <button
            onClick={back}
            className="flex-1 rounded-xl border border-neutral-200 py-3 text-base font-medium text-neutral-700 hover:bg-neutral-50"
          >
            이전
          </button>
        )}
        <button
          onClick={next}
          className="flex-1 rounded-xl bg-amber-500 py-3 text-base font-semibold text-white hover:bg-amber-600 active:scale-95 transition-transform"
        >
          {step < total - 1 ? "다음" : "대시보드 보기"}
        </button>
      </div>
    </div>
  );
}

const RETURN_EXAMPLES = [
  {
    label: "S&P 500",
    value: 0.116,
    desc: "미국 대형주 500개 지수. 장기 분산투자 대표 지수.",
    yearly: [
      { year: 2021, rate: 0.287 },
      { year: 2022, rate: -0.181 },
      { year: 2023, rate: 0.263 },
      { year: 2024, rate: 0.233 },
      { year: 2025, rate: -0.022 },
    ],
  },
  {
    label: "나스닥 100",
    value: 0.142,
    desc: "미국 기술·성장주 100개 지수. 높은 성장성, 변동성도 큰 편.",
    yearly: [
      { year: 2021, rate: 0.275 },
      { year: 2022, rate: -0.326 },
      { year: 2023, rate: 0.549 },
      { year: 2024, rate: 0.256 },
      { year: 2025, rate: -0.045 },
    ],
  },
  {
    label: "코스피",
    value: -0.035,
    desc: "한국 종합주가지수. 국내 대형주 중심.",
    yearly: [
      { year: 2021, rate: 0.036 },
      { year: 2022, rate: -0.249 },
      { year: 2023, rate: 0.187 },
      { year: 2024, rate: -0.096 },
      { year: 2025, rate: -0.053 },
    ],
  },
];

const INFLATION_DATA = [
  { year: 2021, rate: 0.025 },
  { year: 2022, rate: 0.051 },
  { year: 2023, rate: 0.036 },
  { year: 2024, rate: 0.023 },
  { year: 2025, rate: 0.020 },
];
const INFLATION_AVG = 0.031; // 5년 평균 (2021~2025)

function RateChip({ rate }: { rate: number }) {
  const pos = rate >= 0;
  return (
    <span className={`tabular-nums font-medium ${pos ? "text-emerald-600" : "text-red-500"}`}>
      {pos ? "+" : ""}{(rate * 100).toFixed(1)}%
    </span>
  );
}

function ReturnRatePicker({
  value,
  onChange,
  avgReturnPct,
}: {
  value: number;
  onChange: (v: number) => void;
  avgReturnPct: number | null;
}) {
  const [open, setOpen] = useState(false);

  const portfolioOption = avgReturnPct !== null
    ? { label: "내 포트폴리오", value: avgReturnPct / 100, desc: "현재 앱에 등록된 종목 기준 가중 평균 수익률. 과거 실현 수익률로 미래를 보장하지 않습니다.", yearly: null }
    : null;

  const allOptions = [...RETURN_EXAMPLES, ...(portfolioOption ? [portfolioOption] : [])];

  return (
    <div className="flex flex-col gap-2">
      {/* 1줄 버튼 */}
      <div className="flex gap-1.5 flex-wrap">
        {allOptions.map((ex) => {
          const active = Math.abs(value - ex.value) < 0.0001;
          return (
            <button
              key={ex.label}
              onClick={() => onChange(ex.value)}
              className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors whitespace-nowrap ${
                active
                  ? "border-amber-500 bg-amber-50 text-amber-700"
                  : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
              }`}
            >
              <span>{ex.label}</span>
              <span className={active ? "text-amber-600" : "text-neutral-400"}>
                {ex.value >= 0 ? "+" : ""}{(ex.value * 100).toFixed(1)}%
              </span>
            </button>
          );
        })}
        <button
          onClick={() => setOpen((v) => !v)}
          className="ml-auto flex items-center gap-0.5 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm text-neutral-500 hover:bg-neutral-50"
        >
          추가 설명 {open ? "▲" : "▼"}
        </button>
      </div>

      {/* 펼치기 설명 */}
      {open && (
        <div className="rounded-lg bg-neutral-50 p-4 flex flex-col gap-4">
          {allOptions.map((ex) => (
            <div key={ex.label} className="flex flex-col gap-2">
              <div className="flex items-baseline gap-2">
                <span className="text-base font-semibold text-neutral-800">{ex.label}</span>
                <span className="text-sm text-neutral-500">{ex.desc}</span>
              </div>
              {ex.yearly ? (
                <div className="grid grid-cols-6 gap-2">
                  {ex.yearly.map((y) => (
                    <div key={y.year} className="flex flex-col items-center gap-0.5">
                      <span className="text-sm text-neutral-400">{y.year}</span>
                      <span className={`text-base font-semibold tabular-nums ${y.rate >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                        {y.rate >= 0 ? "+" : ""}{(y.rate * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-sm text-neutral-400">5년 평균</span>
                    <span className={`text-base font-bold tabular-nums ${ex.value >= 0 ? "text-amber-600" : "text-red-500"}`}>
                      {ex.value >= 0 ? "+" : ""}{(ex.value * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-neutral-500">현재 앱 등록 종목 기준 — 연도별 수익률 데이터 없음</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 직접 입력 */}
      <div className="flex items-center gap-1.5">
        <StepBtn onClick={() => { const p = Math.round(value * 1000) / 10; onChange(Math.max(0, p - 0.1) / 100); }}>−</StepBtn>
        <input
          type="number"
          min={0}
          max={50}
          step={0.1}
          value={(value * 100).toFixed(1)}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            if (!isNaN(n)) onChange(n / 100);
          }}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-base outline-none focus:border-neutral-900"
        />
        <span className="shrink-0 text-sm text-neutral-500">%</span>
        <StepBtn onClick={() => { const p = Math.round(value * 1000) / 10; onChange(Math.min(50, p + 0.1) / 100); }}>+</StepBtn>
      </div>
      <p className="text-sm text-neutral-400">분산투자 기준 일반적으로 6~8%를 많이 사용합니다.</p>
    </div>
  );
}

function InflationPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      {/* 현재값 + 펼치기 버튼 */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onChange(INFLATION_AVG)}
          className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors whitespace-nowrap ${
            Math.abs(value - INFLATION_AVG) < 0.0001
              ? "border-amber-500 bg-amber-50 text-amber-700"
              : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
          }`}
        >
          <span>🇰🇷 한국 5년 평균 (2021~2025)</span>
          <span className={Math.abs(value - INFLATION_AVG) < 0.0001 ? "text-amber-600" : "text-neutral-400"}>
            +{(INFLATION_AVG * 100).toFixed(1)}%
          </span>
        </button>
        <button
          onClick={() => setOpen((v) => !v)}
          className="ml-auto flex items-center gap-0.5 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm text-neutral-500 hover:bg-neutral-50"
        >
          추가 설명 {open ? "▲" : "▼"}
        </button>
      </div>

      {/* 펼치기 설명 */}
      {open && (
        <div className="rounded-lg bg-neutral-50 p-4 flex flex-col gap-3">
          <p className="text-base font-semibold text-neutral-700">🇰🇷 한국 소비자물가 상승률 (통계청)</p>
          <div className="grid grid-cols-6 gap-2">
            {INFLATION_DATA.map((d) => (
              <div key={d.year} className="flex flex-col items-center gap-0.5">
                <span className="text-sm text-neutral-400">{d.year}</span>
                <span className={`text-base font-semibold tabular-nums ${d.rate >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {d.rate >= 0 ? "+" : ""}{(d.rate * 100).toFixed(1)}%
                </span>
              </div>
            ))}
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-sm text-neutral-400">5년 평균</span>
              <span className="text-base font-bold text-amber-600 tabular-nums">
                +{(INFLATION_AVG * 100).toFixed(1)}%
              </span>
            </div>
          </div>
          <p className="text-sm text-neutral-500">5년 평균(2021~2025) 기준. 시뮬레이션 기본값으로 설정되어 있습니다.</p>
        </div>
      )}

      {/* 직접 입력 */}
      <div className="flex items-center gap-1.5">
        <StepBtn onClick={() => { const p = Math.round(value * 1000) / 10; onChange(Math.max(0, p - 0.1) / 100); }}>−</StepBtn>
        <input
          type="number"
          min={0}
          max={20}
          step={0.1}
          value={(value * 100).toFixed(1)}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            if (!isNaN(n)) onChange(n / 100);
          }}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-base outline-none focus:border-neutral-900"
        />
        <span className="shrink-0 text-sm text-neutral-500">%</span>
        <StepBtn onClick={() => { const p = Math.round(value * 1000) / 10; onChange(Math.min(20, p + 0.1) / 100); }}>+</StepBtn>
      </div>
    </div>
  );
}

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-base font-medium text-neutral-700">{label}</label>
      {children}
      {hint && <p className="text-sm text-neutral-500">{hint}</p>}
    </div>
  );
}

function StepBtn({ onClick, children, small }: { onClick: () => void; children: React.ReactNode; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex shrink-0 items-center justify-center rounded-md border border-neutral-200 text-neutral-500 hover:bg-neutral-50 active:bg-neutral-100 select-none ${small ? "h-7 w-7 text-base" : "h-9 w-9 text-base"}`}
    >
      {children}
    </button>
  );
}

function AgeInput({ value, onChange, min = 20, max = 120, compact = false }: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  compact?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      <StepBtn small={compact} onClick={() => onChange(Math.max(min, value - 1))}>−</StepBtn>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value))))}
        className={`w-full min-w-0 rounded-md border border-neutral-300 text-center text-base outline-none focus:border-neutral-900 ${compact ? "px-1 py-1.5" : "px-2 py-2"}`}
      />
      {!compact && <span className="shrink-0 text-sm text-neutral-500">세</span>}
      <StepBtn small={compact} onClick={() => onChange(Math.min(max, value + 1))}>+</StepBtn>
    </div>
  );
}

function ManWonInput({
  value,
  onChange,
  placeholder,
  step = 10,
  min = 0,
}: {
  value: number;
  onChange: (v: number) => void;
  placeholder?: string;
  step?: number;   // 만원 단위
  min?: number;    // 원 단위
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");
  const displayVal = value === 0 ? "" : String(Math.round(value / 10_000));

  return (
    <div className="flex items-center gap-1.5">
      <StepBtn onClick={() => onChange(Math.max(min, value - step * 10_000))}>−</StepBtn>
      <div className="flex flex-1 items-center gap-2">
        <input
          type="text"
          inputMode="numeric"
          value={focused ? draft : (displayVal ? Number(displayVal).toLocaleString("ko-KR") : "")}
          placeholder={placeholder ?? "0"}
          onFocus={() => { setDraft(displayVal); setFocused(true); }}
          onChange={(e) => {
            const raw = e.target.value.replace(/,/g, "");
            setDraft(raw);
            const n = parseFloat(raw);
            if (!isNaN(n)) onChange(Math.round(n * 10_000));
          }}
          onBlur={() => {
            const n = parseFloat(draft.replace(/,/g, ""));
            onChange(isNaN(n) ? 0 : Math.round(n * 10_000));
            setFocused(false);
          }}
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-base outline-none focus:border-neutral-900"
        />
        <span className="shrink-0 text-sm text-neutral-500">만원</span>
      </div>
      <StepBtn onClick={() => onChange(value + step * 10_000)}>+</StepBtn>
    </div>
  );
}

function Step1({
  form,
  onChange,
}: {
  form: RetirementProfile;
  onChange: (k: keyof RetirementProfile, v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <p className="font-medium text-neutral-800">기본 정보를 알려주세요</p>
      <FieldRow label="현재 만 나이" hint="만 나이로 입력해 주세요.">
        <AgeInput value={form.currentAge} onChange={(v) => onChange("currentAge", v)} min={20} max={90} />
      </FieldRow>
      <FieldRow label="은퇴 목표 나이">
        <AgeInput value={form.retirementAge} onChange={(v) => onChange("retirementAge", Math.max(form.currentAge, v))} min={form.currentAge} max={90} />
      </FieldRow>
      <FieldRow
        label="자산 생존 목표 나이"
        hint="몇 살까지 자산이 유지되길 원하시나요? (기본 90세)"
      >
        <AgeInput value={form.targetAge} onChange={(v) => onChange("targetAge", v)} min={70} max={120} />
      </FieldRow>
    </div>
  );
}

function Step2({
  form,
  onChange,
}: {
  form: RetirementProfile;
  onChange: (k: keyof RetirementProfile, v: number) => void;
}) {
  const examples = [
    { label: "최소", desc: "공과금·식비 위주", value: 186 },
    { label: "평균", desc: "부부 기준 표준 생활", value: 280 },
    { label: "여유", desc: "여행·취미 포함", value: 400 },
  ];
  return (
    <div className="flex flex-col gap-5">
      <p className="font-medium text-neutral-800">은퇴 후 한 달 생활비를 목표로 잡으세요</p>
      <div className="grid grid-cols-3 gap-2">
        {examples.map((ex) => (
          <button
            key={ex.label}
            onClick={() => onChange("monthlyBudget", ex.value * 10_000)}
            className={`flex flex-col items-center rounded-lg border p-2.5 text-left transition-colors ${
              Math.round(form.monthlyBudget / 10_000) === ex.value
                ? "border-amber-500 bg-amber-50"
                : "border-neutral-200 hover:bg-neutral-50"
            }`}
          >
            <span className="text-sm font-semibold text-neutral-700">{ex.label}</span>
            <span className="mt-0.5 text-base font-bold text-neutral-900">{ex.value}만원</span>
            <span className="mt-0.5 text-sm text-neutral-500">{ex.desc}</span>
          </button>
        ))}
      </div>
      <FieldRow
        label="월 목표 생활비"
        hint="통계청 2024 가계동향조사 기준. 100만원~1500만원 사이로 입력하세요."
      >
        <ManWonInput value={form.monthlyBudget} onChange={(v) => onChange("monthlyBudget", v)} min={1_000_000} />
      </FieldRow>
    </div>
  );
}


function Step4({
  form,
  onChange,
}: {
  form: RetirementProfile;
  onChange: (k: keyof RetirementProfile, v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <p className="font-medium text-neutral-800">연금 수령 계획을 알려주세요</p>
      <FieldRow
        label="국민연금 예상 월 수령액"
        hint="국민연금공단 홈페이지에서 확인 가능. 모르면 0으로 두세요."
      >
        <ManWonInput
          value={form.nationalPensionMonthly}
          onChange={(v) => onChange("nationalPensionMonthly", v)}
          placeholder="0"
        />
      </FieldRow>
      <FieldRow
        label="개인연금/IRP 예상 월 수령액"
        hint="연저펀·IRP 합산 월 수령 예상액. 최대 1000만원."
      >
        <ManWonInput
          value={form.privatePensionMonthly}
          onChange={(v) => onChange("privatePensionMonthly", v)}
          placeholder="0"
          step={10}
        />
      </FieldRow>
    </div>
  );
}

// ── Edit Form (설정 편집 — 전체 항목 한 페이지) ───────────────────────────────

function EditForm({
  profile,
  portfolioData,
  onSave,
  onCancel,
}: {
  profile: RetirementProfile;
  portfolioData: PortfolioData;
  onSave: (p: RetirementProfile) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<RetirementProfile>(profile);
  const set = (k: keyof RetirementProfile, v: number | string) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">설정 편집</h1>
        <p className="mt-1 text-sm text-neutral-500">슬라이더에서 조정한 값이 반영되어 있습니다.</p>
      </header>

      {/* 투자자산 */}
      <section className="rounded-xl border border-neutral-200 bg-white p-5 flex flex-col gap-3">
        <p className="text-base font-semibold text-neutral-700">투자자산</p>
        <div className="rounded-lg bg-neutral-50 p-3 flex items-center justify-between">
          <div>
            <p className="text-sm text-neutral-400">내 자산 기준 (자동)</p>
            <p className="text-base font-bold text-neutral-900">{fmtKRWShort(portfolioData.totalKrw)}</p>
          </div>
          {form.overrideAssetsKrw === 0 ? (
            <button
              onClick={() => set("overrideAssetsKrw", portfolioData.totalKrw || 100_000_000)}
              className="text-sm text-blue-600 hover:underline"
            >
              직접 입력
            </button>
          ) : (
            <button
              onClick={() => set("overrideAssetsKrw", 0)}
              className="text-sm text-neutral-400 hover:underline"
            >
              자동으로 되돌리기
            </button>
          )}
        </div>
        {form.overrideAssetsKrw > 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-sm text-neutral-500">직접 입력 (만원 단위)</p>
            <ManWonInput value={form.overrideAssetsKrw} onChange={(v) => set("overrideAssetsKrw", v)} />
          </div>
        )}
      </section>

      {/* 기본 정보 */}
      <section className="rounded-xl border border-neutral-200 bg-white p-5 flex flex-col gap-4">
        <p className="text-base font-semibold text-neutral-700">기본 정보</p>
        <div className="grid grid-cols-3 gap-3">
          <FieldRow label="현재 나이">
            <AgeInput compact value={form.currentAge} onChange={(v) => set("currentAge", v)} min={20} max={90} />
          </FieldRow>
          <FieldRow label="은퇴 목표">
            <AgeInput compact value={form.retirementAge} onChange={(v) => set("retirementAge", Math.max(form.currentAge, v))} min={form.currentAge} max={90} />
          </FieldRow>
          <FieldRow label="생존 목표">
            <AgeInput compact value={form.targetAge} onChange={(v) => set("targetAge", v)} min={70} max={120} />
          </FieldRow>
        </div>
      </section>

      {/* 월 생활비 */}
      <section className="rounded-xl border border-neutral-200 bg-white p-5 flex flex-col gap-3">
        <p className="text-base font-semibold text-neutral-700">월 생활비</p>
        <div className="grid grid-cols-3 gap-2">
          {[{label:"186만원",value:186},{label:"280만원",value:280},{label:"400만원",value:400}].map((ex) => (
            <button key={ex.value} onClick={() => set("monthlyBudget", ex.value * 10_000)}
              className={`rounded-lg border py-2 text-base font-medium transition-colors ${
                Math.round(form.monthlyBudget / 10_000) === ex.value
                  ? "border-amber-500 bg-amber-50 text-amber-700"
                  : "border-neutral-200 hover:bg-neutral-50 text-neutral-700"
              }`}>
              {ex.label}
            </button>
          ))}
        </div>
        <ManWonInput value={form.monthlyBudget} onChange={(v) => set("monthlyBudget", v)} />
      </section>

      {/* 연금 */}
      <section className="rounded-xl border border-neutral-200 bg-white p-5 flex flex-col gap-4">
        <p className="text-base font-semibold text-neutral-700">연금</p>
        <FieldRow label="국민연금 월 수령액">
          <ManWonInput value={form.nationalPensionMonthly} onChange={(v) => set("nationalPensionMonthly", v)} placeholder="0" />
        </FieldRow>
        <FieldRow label="개인연금 / IRP 월 수령액">
          <ManWonInput value={form.privatePensionMonthly} onChange={(v) => set("privatePensionMonthly", v)} placeholder="0" />
        </FieldRow>
      </section>

      {/* 수익률 / 물가상승률 */}
      <section className="rounded-xl border border-neutral-200 bg-white p-5 flex flex-col gap-5">
        <p className="text-base font-semibold text-neutral-700">수익률 / 물가상승률</p>

        <div className="flex flex-col gap-3">
          <label className="text-base text-neutral-600">예상 연 수익률</label>
          <ReturnRatePicker
            value={form.expectedReturn}
            onChange={(v) => set("expectedReturn", v)}
            avgReturnPct={portfolioData.avgReturnPct}
          />
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-base text-neutral-600">물가상승률</label>
          <InflationPicker
            value={form.inflation}
            onChange={(v) => set("inflation", v)}
          />
        </div>
      </section>

      {/* 버튼 */}
      <div className="flex gap-3 pb-4">
        <button onClick={onCancel}
          className="flex-1 rounded-xl border border-neutral-200 py-3 text-base font-medium text-neutral-700 hover:bg-neutral-50">
          취소
        </button>
        <button onClick={() => onSave(form)}
          className="flex-1 rounded-xl bg-amber-500 py-3 text-base font-semibold text-white hover:bg-amber-600 active:scale-95 transition-transform">
          저장
        </button>
      </div>
    </div>
  );
}

function Step5({
  form,
  onChange,
  portfolioData,
}: {
  form: RetirementProfile;
  onChange: (k: keyof RetirementProfile, v: number) => void;
  portfolioData: PortfolioData;
}) {
  return (
    <div className="flex flex-col gap-6">
      <p className="font-medium text-neutral-800">수익률 및 물가상승률을 설정해주세요</p>

      {/* 예상 수익률 */}
      <div className="flex flex-col gap-3">
        <label className="text-base font-medium text-neutral-700">예상 연 수익률</label>
        <ReturnRatePicker
          value={form.expectedReturn}
          onChange={(v) => onChange("expectedReturn", v)}
          avgReturnPct={portfolioData.avgReturnPct}
        />
      </div>

      {/* 물가상승률 */}
      <div className="flex flex-col gap-3">
        <label className="text-base font-medium text-neutral-700">물가상승률</label>
        <InflationPicker
          value={form.inflation}
          onChange={(v) => onChange("inflation", v)}
        />
      </div>
    </div>
  );
}

// ── Retirement Projection Chart ───────────────────────────────────────────────

type ProjectionPoint = {
  age: number;
  endAssets: number;
  totalBudget: number;   // 물가 반영 총 생활비 (연간)
  withdrawal: number;    // 순 인출액 (총생활비 − 연금·배당 수입)
  estimatedTax: number;
};

function fmtAxis(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_0000_0000) return `${(abs / 1_0000_0000).toFixed(1)}억`;
  if (abs >= 1_0000) return `${Math.round(abs / 1_0000)}만`;
  return String(abs);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ProjectionTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const assets: number | undefined   = payload.find((p: { dataKey: string }) => p.dataKey === "endAssets")?.value;
  const budget: number | undefined   = payload.find((p: { dataKey: string }) => p.dataKey === "totalBudget")?.value;
  const wd: number | undefined       = payload.find((p: { dataKey: string }) => p.dataKey === "withdrawal")?.value;
  const tax: number | undefined      = payload.find((p: { dataKey: string }) => p.dataKey === "estimatedTax")?.value;
  const covered = budget != null && wd != null ? budget - wd : 0;
  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 shadow-lg text-sm min-w-[170px]">
      <p className="mb-1.5 font-semibold text-neutral-600">{label}세</p>
      {assets != null && (
        <p className="flex items-center justify-between gap-4">
          <span style={{ color: "#f59e0b" }}>● 순자산</span>
          <span className="font-semibold tabular-nums">{fmtKRWShort(assets)}</span>
        </p>
      )}
      {budget != null && budget > 0 && (
        <p className="flex items-center justify-between gap-4">
          <span style={{ color: "#10b981" }}>● 연간 총 생활비</span>
          <span className="font-semibold tabular-nums">{fmtKRWShort(budget)}</span>
        </p>
      )}
      {covered > 0 && (
        <p className="flex items-center justify-between gap-4">
          <span className="text-neutral-400">  └ 수입 충당</span>
          <span className="tabular-nums text-neutral-500">−{fmtKRWShort(covered)}</span>
        </p>
      )}
      {wd != null && wd > 0 && (
        <p className="flex items-center justify-between gap-4">
          <span style={{ color: "#3b82f6" }}>● 순 인출액</span>
          <span className="font-semibold tabular-nums">{fmtKRWShort(wd)}</span>
        </p>
      )}
      {tax != null && tax > 0 && (
        <p className="flex items-center justify-between gap-4">
          <span style={{ color: "#f87171" }}>● 예상 세금</span>
          <span className="font-semibold tabular-nums">{fmtKRWShort(tax)}</span>
        </p>
      )}
    </div>
  );
}

type ChartEvent = { age: number; label: string; color: string };

function RetirementProjectionChart({
  data,
  returnRate,
  events = [],
}: {
  data: ProjectionPoint[];
  returnRate: number;
  events?: ChartEvent[];
}) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="text-base font-medium uppercase tracking-wide text-neutral-500">
          연도별 자산 추이
        </h2>
        <span className="text-sm text-neutral-400">
          수익률 {(returnRate * 100).toFixed(1)}% 반영
        </span>
      </div>
      <div className="mb-4 flex flex-wrap gap-x-3 gap-y-1 text-sm text-neutral-500">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-amber-400 opacity-70" />순자산</span>
        <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-3 bg-emerald-500" />총 생활비</span>
        <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-3 border-t-2 border-dashed border-blue-500" />순 인출액</span>
        <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-3 border-t-2 border-dashed border-red-400" />예상 세금</span>
      </div>
      <div className="h-56 min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 52, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="assetGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis
              dataKey="age"
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              tickLine={false}
              tickFormatter={(v: number) => (v % 5 === 0 ? `${v}세` : "")}
            />
            {/* 좌축: 순자산 (억) */}
            <YAxis
              yAxisId="assets"
              tickFormatter={fmtAxis}
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              tickLine={false}
              axisLine={false}
              width={46}
            />
            {/* 우축: 지출·세금 (만원) */}
            <YAxis
              yAxisId="expenses"
              orientation="right"
              tickFormatter={fmtAxis}
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              tickLine={false}
              axisLine={false}
              width={46}
            />
            <RechartsTooltip content={<ProjectionTooltip />} />
            <Area
              yAxisId="assets"
              type="monotone"
              dataKey="endAssets"
              fill="url(#assetGrad)"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              name="순자산"
            />
            {/* 총 생활비 (물가 반영 전체 지출) */}
            <Line
              yAxisId="expenses"
              type="monotone"
              dataKey="totalBudget"
              stroke="#10b981"
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3 }}
              name="연간 총 생활비"
            />
            {/* 순 인출액 (총생활비 − 연금·배당) */}
            <Line
              yAxisId="expenses"
              type="monotone"
              dataKey="withdrawal"
              stroke="#3b82f6"
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3 }}
              strokeDasharray="5 3"
              name="순 인출액"
            />
            <Line
              yAxisId="expenses"
              type="monotone"
              dataKey="estimatedTax"
              stroke="#f87171"
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3 }}
              strokeDasharray="4 3"
              name="예상 세금"
            />
            {events.map((ev, idx) => (
              <ReferenceLine
                key={ev.age}
                x={ev.age}
                yAxisId="assets"
                stroke={ev.color}
                strokeDasharray="5 3"
                strokeWidth={1.5}
                label={{
                  value: ev.label,
                  position: idx % 2 === 0 ? "insideTopLeft" : "insideTopRight",
                  fontSize: 8,
                  fill: ev.color,
                  fontWeight: 700,
                  offset: 4,
                }}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-sm text-neutral-400">
        예상세금: 연금 인출세(55~70세 5.5%→80세+ 3.3%) + 주식 투자수익 금융소득세 15.4% 근사치 ·
        취득가·종목유형 미반영으로 실제와 차이 있음 → 상세 분석은 아래 가이드 참조
      </p>
    </section>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "green" | "red" | "neutral";
}) {
  const subColor =
    accent === "green"
      ? "text-emerald-600"
      : accent === "red"
        ? "text-red-600"
        : "text-neutral-500";
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-neutral-200 bg-white p-4">
      <span className="text-sm font-medium text-neutral-500">{label}</span>
      <span className="text-xl font-bold text-neutral-900 leading-tight">{value}</span>
      {sub && <span className={`text-sm ${subColor}`}>{sub}</span>}
    </div>
  );
}

function PortfolioBar({
  categories,
}: {
  categories: { label: string; value: number; color: string; textColor: string }[];
}) {
  const total = categories.reduce((s, c) => s + c.value, 0);
  if (total === 0) return null;
  const visible = categories.filter((c) => c.value > 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-8 overflow-hidden rounded-full">
        {visible.map((c) => (
          <div
            key={c.label}
            className={`${c.color} transition-all`}
            style={{ width: `${(c.value / total) * 100}%` }}
            title={`${c.label}: ${fmtKRWShort(c.value)}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {visible.map((c) => (
          <div key={c.label} className="flex items-center gap-1.5 text-sm text-neutral-600">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${c.color}`} />
            {c.label} ({((c.value / total) * 100).toFixed(0)}%)
          </div>
        ))}
      </div>
    </div>
  );
}

function CashflowSection({
  title,
  color,
  total,
  rows,
}: {
  title: string;
  color: "green" | "red";
  total: number;
  rows: { label: string; amount: number; pct?: number }[];
}) {
  const isGreen = color === "green";
  return (
    <div className="flex flex-col gap-0">
      {/* 헤더: 섹션명 + 합계 */}
      <div className="flex items-center justify-between py-1.5">
        <span className={`text-base font-semibold ${isGreen ? "text-emerald-700" : "text-red-700"}`}>{title}</span>
        <span className={`text-base font-semibold tabular-nums ${isGreen ? "text-emerald-700" : "text-red-700"}`}>
          {fmtKRW(total)}
        </span>
      </div>
      {/* 서브 항목 (들여쓰기) */}
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between py-1 pl-4">
          <span className="text-base text-neutral-500">{r.label}</span>
          <div className="flex items-center gap-3">
            {r.pct != null && (
              <span className="text-sm text-neutral-400 tabular-nums">{r.pct.toFixed(0)}%</span>
            )}
            <span className="text-base tabular-nums text-neutral-500">{fmtKRW(r.amount)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Tax Analysis Section ──────────────────────────────────────────────────────

type TaxBucketData = {
  lockedPensionKrw: number;
  earlyPensionTaxTotal: number;
  normalPensionTaxTotal: number;
  pensionTaxSaving: number;
  privatePensionAnnual: number;
  privateOver1500: boolean;
  privatePensionTax55_70: number;
  privatePensionTax70_80: number;
  privatePensionTax80up: number;
  stocksKrw: number;
  stockGainEstimate: number;
  stockTaxIfDomestic: number;
  stockTaxIfETF: number;
  stockTaxIfForeignNet: number;
};

function TaxAnalysisSection({
  profile,
  portfolioData,
  taxData,
}: {
  profile: RetirementProfile;
  portfolioData: PortfolioData;
  taxData: TaxBucketData;
}) {
  const hasPension = portfolioData.pensionKrw > 0 || profile.privatePensionMonthly > 0;
  const hasStocks  = portfolioData.stocksKrw > 0;
  const pensionLocked = profile.retirementAge < 55 && portfolioData.pensionKrw > 0;

  return (
    <div className="flex flex-col gap-4 border-t border-neutral-100 pt-4 mt-1">
      <p className="text-sm font-semibold uppercase tracking-wide text-neutral-400">🧾 인출 세금 상세 분석</p>

      {/* ── 연금저축·IRP 세금 분석 ──────────────────────────────────────── */}
      {hasPension && (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 flex flex-col gap-3">
          <p className="text-base font-semibold text-neutral-700">① 연금저축·IRP — 연금소득세 시나리오</p>

          {/* 55세 이전 조기 인출 vs 정상 수령 비교 */}
          {taxData.pensionTaxSaving > 0 && (
            <div className="rounded-md border border-orange-200 bg-orange-50 p-3 flex flex-col gap-2">
              <p className="text-sm font-semibold text-orange-800">
                🔒 잠긴 연금 {fmtKRWShort(taxData.lockedPensionKrw)} — 55세까지 반드시 유지해야 할 이유
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded bg-red-50 border border-red-200 px-2.5 py-2 flex flex-col gap-0.5">
                  <span className="text-sm text-red-500 font-semibold">지금 해지 시 (16.5%)</span>
                  <span className="text-base font-bold text-red-600 tabular-nums">{fmtKRWShort(taxData.earlyPensionTaxTotal)}</span>
                  <span className="text-sm text-red-400">기타소득세·지방세</span>
                </div>
                <div className="rounded bg-emerald-50 border border-emerald-200 px-2.5 py-2 flex flex-col gap-0.5">
                  <span className="text-sm text-emerald-600 font-semibold">55세 이후 수령 (5.5%~)</span>
                  <span className="text-base font-bold text-emerald-700 tabular-nums">{fmtKRWShort(taxData.normalPensionTaxTotal)}</span>
                  <span className="text-sm text-emerald-500">연금소득세·지방세</span>
                </div>
              </div>
              <div className="flex items-center justify-between rounded bg-amber-100 px-3 py-2">
                <span className="text-sm font-bold text-amber-800">💰 절세 효과</span>
                <span className="text-base font-bold text-amber-800 tabular-nums">+{fmtKRWShort(taxData.pensionTaxSaving)}</span>
              </div>
            </div>
          )}

          {/* 연령별 연금소득세율 + 실제 세금 */}
          {taxData.privatePensionAnnual > 0 && (
            <>
              <p className="text-sm text-neutral-500">개인연금 월 {fmtKRWShort(profile.privatePensionMonthly)} 수령 시 연간 세금</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "55~70세", rate: "5.5%", tax: taxData.privatePensionTax55_70 },
                  { label: "70~80세", rate: "4.4%", tax: taxData.privatePensionTax70_80 },
                  { label: "80세~",   rate: "3.3%", tax: taxData.privatePensionTax80up  },
                ].map((b) => (
                  <div key={b.label} className="flex flex-col rounded-md bg-white border border-neutral-200 p-2.5 items-center gap-1">
                    <span className="text-sm text-neutral-400">{b.label}</span>
                    <span className="text-base font-bold text-neutral-800">{b.rate}</span>
                    <span className="text-sm text-amber-600 font-semibold tabular-nums">{fmtKRWShort(b.tax)}/년</span>
                  </div>
                ))}
              </div>
              {taxData.privateOver1500 && (
                <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-700">
                  ⚠️ 연 {fmtKRWShort(taxData.privatePensionAnnual)} 수령은 <b>1,500만원 초과</b>입니다.
                  초과분 {fmtKRWShort(taxData.privatePensionAnnual - 15_000_000)}은
                  16.5% 분리과세 또는 종합과세 중 유리한 방식으로 신고하세요.
                </div>
              )}
            </>
          )}
          <p className="text-sm text-neutral-400">
            세액공제를 받은 납입금+운용수익에만 과세. 공제 미신청 납입분은 인출 시 비과세.
          </p>
        </div>
      )}

      {/* ── 주식·ETF 세금 시나리오 ──────────────────────────────────────── */}
      {hasStocks && (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 flex flex-col gap-3">
          <p className="text-base font-semibold text-neutral-700">② 주식·ETF — 종목 유형별 세금 시나리오</p>
          <p className="text-sm text-neutral-500">
            보유 주식·ETF {fmtKRWShort(taxData.stocksKrw)} 기준 · 미실현이익 50% 가정 (이익 {fmtKRWShort(taxData.stockGainEstimate)})
          </p>

          <div className="flex flex-col divide-y divide-neutral-100">
            {[
              {
                label: "국내주식 직접 (소액주주)",
                rate: "0%",
                tax: taxData.stockTaxIfDomestic,
                rateColor: "text-emerald-600",
                taxColor: "text-emerald-700",
                note: "양도세 비과세. KODEX 200 등 국내주식형 ETF도 동일.",
              },
              {
                label: "국내상장 해외ETF (KODEX S&P500 등)",
                rate: "15.4%",
                tax: taxData.stockTaxIfETF,
                rateColor: "text-amber-600",
                taxColor: "text-amber-700",
                note: "매매차익·분배금 배당소득세. 연 2,000만 초과 시 종합과세.",
              },
              {
                label: "해외주식 직접 투자 (미국 등)",
                rate: "22%",
                tax: taxData.stockTaxIfForeignNet,
                rateColor: "text-red-600",
                taxColor: "text-red-700",
                note: "양도소득세 22%. 연 250만원 공제 후 초과분 과세. 손익통산 가능.",
              },
            ].map((row) => (
              <div key={row.label} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-base text-neutral-700 leading-tight">{row.label}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-base font-bold ${row.rateColor}`}>{row.rate}</span>
                    {row.tax > 0 ? (
                      <span className={`text-sm font-semibold tabular-nums ${row.taxColor}`}>
                        ≈ {fmtKRWShort(row.tax)}
                      </span>
                    ) : (
                      <span className="text-sm font-semibold text-emerald-600">세금 0</span>
                    )}
                  </div>
                </div>
                <p className="text-sm text-neutral-400">{row.note}</p>
              </div>
            ))}
          </div>

          <div className="rounded-md bg-neutral-100 px-3 py-2 text-sm text-neutral-600">
            📌 <b>국내주식 비중이 높을수록</b> 주식 인출 시 세금이 0에 가깝습니다.
            종목에 "해외직접 / 국내ETF / 국내주식" 태그를 입력하면 정확한 계산이 가능합니다.
          </div>
        </div>
      )}

      {/* ── 세금 최소화 인출 순서 ──────────────────────────────────────── */}
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 flex flex-col gap-2.5">
        <p className="text-base font-semibold text-blue-800">③ 세금 최소화 인출 순서</p>
        <ol className="flex flex-col gap-2">
          {[
            { n: "1", title: "현금·예수금 먼저 소진",              desc: "세금 0 — 수익이 없으므로 과세 대상 아님" },
            { n: "2", title: "국내주식 직접·국내주식형 ETF 매도",  desc: "양도세 0% — 세 부담 없이 활용, 배당은 금융소득 합산 주의" },
            { n: "3", title: "국내상장 해외ETF 매도",               desc: `15.4% — 연 2,000만 초과 전 분산 매도 권장 (${hasStocks ? `이익 ${fmtKRWShort(taxData.stockTaxIfETF)} 추정` : ""})` },
            { n: "4", title: "해외주식 직접 매도",                  desc: `22% — 연 250만 공제 활용, 손실 종목과 손익통산 (${hasStocks ? `이익 ${fmtKRWShort(taxData.stockTaxIfForeignNet)} 추정` : ""})` },
            {
              n: "5",
              title: pensionLocked ? "55세~ 연금저축·IRP 인출 시작" : "연금저축·IRP 인출",
              desc: `5.5%→4.4%→3.3% 연령별 감소 — 다른 소득 없을 때 실효세율 낮음${taxData.pensionTaxSaving > 0 ? ` (55세 대기 시 ${fmtKRWShort(taxData.pensionTaxSaving)} 절세)` : ""}`,
            },
            { n: "6", title: "65세~ 국민연금 수령",                 desc: "연금소득공제 후 타 소득과 합산 과세 — 다른 소득과 합계 확인 필요" },
          ].map((item) => (
            <li key={item.n} className="flex items-start gap-2">
              <span className="w-5 h-5 shrink-0 mt-0.5 rounded-full bg-blue-200 text-blue-700 text-sm flex items-center justify-center font-bold">
                {item.n}
              </span>
              <div className="text-base text-blue-700">
                <span className="font-semibold">{item.title}</span>
                <span className="text-blue-500"> — {item.desc}</span>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* ── 시뮬레이션 한계 ──────────────────────────────────────────────── */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex flex-col gap-2">
        <p className="text-base font-semibold text-amber-800">⚠️ 이 분석의 한계 및 개선 방향</p>
        <ul className="flex flex-col gap-1.5 text-sm text-amber-700">
          <li className="flex gap-1.5"><span className="shrink-0">•</span><span><b>미실현이익 50% 가정</b> — 실제 취득가 입력 시 주식 세금을 정확히 계산할 수 있습니다. 앱에 평단가는 있으나 세금 계산 연동 미구현.</span></li>
          <li className="flex gap-1.5"><span className="shrink-0">•</span><span><b>종목 유형 미분류</b> — 주식·ETF가 국내직접·국내상장해외ETF·해외직접 중 어디인지 입력받지 않습니다. 종목 태그 추가 시 정확도 크게 향상.</span></li>
          <li className="flex gap-1.5"><span className="shrink-0">•</span><span><b>세전 인출액 기준</b> — 현재 시뮬레이션은 세금을 차감 후 재계산하지 않습니다. 해외주식 비중이 높다면 실제 소진 속도가 더 빠를 수 있습니다.</span></li>
          <li className="flex gap-1.5"><span className="shrink-0">•</span><span><b>금융소득 종합과세</b> — 배당·이자 합계 2,000만원 초과 시 누진세율 적용, 현재 미반영.</span></li>
        </ul>
      </div>
    </div>
  );
}

function GuideCard({ type, title, desc }: { type: "warning" | "success" | "info"; title: string; desc: string }) {
  const styles = {
    warning: "border-red-200 bg-red-50 text-red-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    info: "border-blue-200 bg-blue-50 text-blue-800",
  };
  const icons = { warning: "⚠️", success: "✅", info: "💡" };
  return (
    <div className={`rounded-lg border p-3 ${styles[type]}`}>
      <p className="text-base font-semibold">
        {icons[type]} {title}
      </p>
      <p className="mt-0.5 text-sm opacity-90">{desc}</p>
    </div>
  );
}

function generateGuide(
  profile: RetirementProfile,
  survivalYears: number | null,
  monthlySurplus: number,
  monthlyDivKrw: number,
  totalInflow: number,
  totalNetAssets: number,
) {
  const tips: { type: "warning" | "success" | "info"; title: string; desc: string }[] = [];

  const targetYears = profile.targetAge - profile.currentAge;
  const survival = survivalYears ?? 999;

  if (survival < targetYears) {
    const shortfall = Math.round((targetYears - survival) * 12);
    tips.push({
      type: "warning",
      title: `자산이 ${profile.targetAge}세 전에 고갈될 수 있습니다`,
      desc: `현재 예상 생존 기간은 ${fmtSurvival(survivalYears)}으로, 목표보다 약 ${shortfall}개월 부족합니다. 연간 저축 증가 또는 생활비 조정을 검토하세요.`,
    });
  } else {
    tips.push({
      type: "success",
      title: `${profile.targetAge}세까지 자산 유지 가능!`,
      desc: `예상 생존 기간 ${fmtSurvival(survivalYears)}으로 목표를 달성합니다. 잉여 현금흐름을 재투자해 여유를 더 늘릴 수 있습니다.`,
    });
  }

  if (monthlySurplus > 0) {
    tips.push({
      type: "info",
      title: `월 ${fmtKRWShort(monthlySurplus)} 잉여금 발생`,
      desc: `잉여금을 ISA 또는 IRP에 추가 납입하면 절세 혜택과 함께 자산 생존 기간을 연장할 수 있습니다.`,
    });
  }

  if (totalInflow > 0 && monthlyDivKrw / totalInflow < 0.3) {
    tips.push({
      type: "info",
      title: "배당 현금흐름이 낮습니다",
      desc: `현재 배당이 수입의 ${((monthlyDivKrw / totalInflow) * 100).toFixed(0)}%입니다. SCHD·JEPI 등 배당성장 ETF 비중을 높여 패시브 인컴을 늘려보세요.`,
    });
  }

  return tips;
}

// ── Slider Panel ─────────────────────────────────────────────────────────────

const SLIDERS: {
  key: keyof RetirementProfile;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}[] = [
  {
    key: "monthlyBudget",
    label: "월 생활비",
    min: 1_000_000,
    max: 15_000_000,
    step: 100_000,
    format: (v) => `${Math.round(v / 10_000)}만원`,
  },
  {
    key: "nationalPensionMonthly",
    label: "국민연금 월수령",
    min: 0,
    max: 3_000_000,
    step: 50_000,
    format: (v) => (v === 0 ? "없음" : `${Math.round(v / 10_000)}만원`),
  },
  {
    key: "privatePensionMonthly",
    label: "개인연금 월수령",
    min: 0,
    max: 10_000_000,
    step: 100_000,
    format: (v) => (v === 0 ? "없음" : `${Math.round(v / 10_000)}만원`),
  },
  {
    key: "retirementAge",
    label: "은퇴 목표 나이",
    min: 40,
    max: 85,
    step: 1,
    format: (v) => `${v}세`,
  },
  {
    key: "targetAge",
    label: "자산 생존 목표",
    min: 75,
    max: 100,
    step: 1,
    format: (v) => `${v}세`,
  },
  {
    key: "expectedReturn",
    label: "예상 연 수익률",
    min: 0,
    max: 0.2,
    step: 0.005,
    format: (v) => `${(v * 100).toFixed(1)}%`,
  },
  {
    key: "inflation",
    label: "물가상승률",
    min: 0,
    max: 0.1,
    step: 0.005,
    format: (v) => `${(v * 100).toFixed(1)}%`,
  },
];

function SliderPanel({
  profile,
  onChange,
}: {
  profile: RetirementProfile;
  onChange: (p: RetirementProfile) => void;
}) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
        파라미터 조정
      </h2>
      <div className="grid grid-cols-3 gap-x-4 gap-y-3">
        {SLIDERS.map((s) => {
          const value = profile[s.key] as number;
          const effectiveMin = s.key === "retirementAge" ? profile.currentAge : s.min;
          const pct = Math.max(0, Math.min(100, ((value - effectiveMin) / (s.max - effectiveMin)) * 100));
          return (
            <div key={s.key} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-500">{s.label}</span>
                <span className="font-semibold tabular-nums text-neutral-900">
                  {s.format(value)}
                </span>
              </div>
              <input
                type="range"
                min={effectiveMin}
                max={s.max}
                step={s.step}
                value={value}
                onChange={(e) => {
                  let v = Number(e.target.value);
                  if (s.key === "retirementAge") v = Math.max(profile.currentAge, v);
                  onChange({ ...profile, [s.key]: v });
                }}
                className="w-full cursor-pointer appearance-none rounded-full accent-amber-500"
                style={{
                  height: "4px",
                  backgroundImage: `linear-gradient(to right, #f59e0b ${pct}%, #e5e7eb ${pct}%)`,
                }}
              />
              <div className="flex justify-between text-sm text-neutral-400">
                <span>{s.format(effectiveMin)}</span>
                <span>{s.format(s.max)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Dashboard({
  profile,
  portfolioData,
  onEdit,
  onProfileChange,
}: {
  profile: RetirementProfile;
  portfolioData: PortfolioData;
  onEdit: () => void;
  onProfileChange: (p: RetirementProfile) => void;
}) {
  const now = new Date();
  const dateStr = `${now.getFullYear()}년 ${now.getMonth() + 1}월 기준`;

  // ── 유효 자산 (override or 포트폴리오) ───────────────────────────────────────
  const effectiveAssets = profile.overrideAssetsKrw > 0
    ? profile.overrideAssetsKrw
    : portfolioData.totalKrw;

  // ── 현금흐름 ────────────────────────────────────────────────────────────────
  const monthlyDiv     = portfolioData.monthlyDivKrw;
  const monthlyNational = profile.nationalPensionMonthly;
  const monthlyPrivate  = profile.privatePensionMonthly;
  const monthlyOutflow  = profile.monthlyBudget;

  // 표시용: 모든 수입 합계 (현금흐름 상세 섹션)
  const totalMonthlyInflow = monthlyDiv + monthlyNational + monthlyPrivate;

  // ── 국민연금 수령 시기 (65세 고정) ─────────────────────────────────────────
  const NATIONAL_PENSION_AGE = 65;
  const needsNationalTransition =
    monthlyNational > 0 && profile.retirementAge < NATIONAL_PENSION_AGE;

  // KPI 현금흐름: 은퇴 시점 기준 (국민연금은 65세 이전 미수령)
  const monthlyInflowAtRetirement =
    monthlyDiv + monthlyPrivate +
    (profile.retirementAge >= NATIONAL_PENSION_AGE ? monthlyNational : 0);
  const monthlySurplus = monthlyInflowAtRetirement - monthlyOutflow;

  // 인출액 계산 (물가 적용 전, 명목 기준)
  // • preNational: 국민연금 미수령 구간 (은퇴 ~ 65세)
  // • withNational: 국민연금 수령 후 (65세~)
  const yearlyWd_preNational  = Math.max(0, monthlyOutflow - monthlyDiv - monthlyPrivate) * 12;
  const yearlyWd_withNational = Math.max(0, monthlyOutflow - totalMonthlyInflow) * 12;
  // 은퇴 시점 인출액
  const netYearlyWithdrawal = needsNationalTransition
    ? yearlyWd_preNational
    : yearlyWd_withNational;

  // ── 연금저축/IRP 55세 잠금 처리 ──────────────────────────────────────────────
  const PENSION_UNLOCK_AGE = 55;
  const pensionLocked =
    profile.retirementAge < PENSION_UNLOCK_AGE && portfolioData.pensionKrw > 0;
  const yearsToUnlock = pensionLocked ? PENSION_UNLOCK_AGE - profile.retirementAge : 0;
  const lockedPensionKrw = pensionLocked
    ? profile.overrideAssetsKrw > 0
      ? 0  // override 입력 시 잠금 분리 불가
      : portfolioData.pensionKrw
    : 0;
  const immediateAssets = effectiveAssets - lockedPensionKrw;

  // ── Horizon: 최소 100세까지 계산 ──────────────────────────────────────────
  const horizonYears = Math.max(
    profile.targetAge - profile.retirementAge + 5,
    100 - profile.retirementAge + 5,
  );

  // ── 생존 기간 시뮬 (최대 3-phase) ──────────────────────────────────────────
  // Phase 구분 기준
  //  ① 연금저축/IRP 55세 잠금 (retirementAge < 55, pensionKrw > 0)
  //  ② 국민연금 65세 수령 (retirementAge < 65, nationalPensionMonthly > 0)
  let depletionResult: DepletionOutput;

  if (pensionLocked && lockedPensionKrw > 0) {
    // ── Phase 1: retirementAge → 55 (비연금 자산, 국민연금 미수령) ──────────
    const phase1 = computeDepletion({
      startAge: profile.retirementAge,
      startAssets: immediateAssets,
      yearlyWithdrawal: netYearlyWithdrawal, // = yearlyWd_preNational
      expectedReturn: profile.expectedReturn,
      inflation: profile.inflation,
      inflateWithdrawal: true,
      horizonYears: yearsToUnlock,
    });
    const pensionGrown = lockedPensionKrw * Math.pow(1 + profile.expectedReturn, yearsToUnlock);
    const assetsAt55    = phase1.finalAssets + pensionGrown;
    const withdrawalAt55 = netYearlyWithdrawal * Math.pow(1 + profile.inflation, yearsToUnlock);

    if (needsNationalTransition) {
      // ── Phase 2: 55 → 65 (연금 자산 합산, 국민연금 아직 미수령) ────────────
      const yearsTo65 = NATIONAL_PENSION_AGE - PENSION_UNLOCK_AGE; // 10
      const phase2 = computeDepletion({
        startAge: PENSION_UNLOCK_AGE,
        startAssets: phase1.depletedAtAge !== null ? 0 : assetsAt55,
        yearlyWithdrawal: withdrawalAt55,
        expectedReturn: profile.expectedReturn,
        inflation: profile.inflation,
        inflateWithdrawal: true,
        horizonYears: yearsTo65,
      });
      // ── Phase 3: 65세~ (국민연금 수령 시작) ────────────────────────────────
      const withdrawalAt65   = withdrawalAt55 * Math.pow(1 + profile.inflation, yearsTo65);
      const withdrawalPost65 = Math.max(0, withdrawalAt65 - monthlyNational * 12);
      const phase3Horizon    = Math.max(
        profile.targetAge - NATIONAL_PENSION_AGE + 5,
        100 - NATIONAL_PENSION_AGE + 5,
      );
      const phase3 = computeDepletion({
        startAge: NATIONAL_PENSION_AGE,
        startAssets: phase2.depletedAtAge !== null ? 0 : phase2.finalAssets,
        yearlyWithdrawal: withdrawalPost65,
        expectedReturn: profile.expectedReturn,
        inflation: profile.inflation,
        inflateWithdrawal: true,
        horizonYears: phase3Horizon,
      });
      depletionResult = {
        series: [...phase1.series, ...phase2.series, ...phase3.series],
        depletedAtAge: phase1.depletedAtAge ?? phase2.depletedAtAge ?? phase3.depletedAtAge,
        finalAssets: phase3.finalAssets,
        finalRealAssets: phase3.finalRealAssets,
      };
    } else {
      // ── Phase 2: 55세~ (국민연금 없음 or 이미 수령 중) ─────────────────────
      const phase2Horizon = Math.max(
        profile.targetAge - PENSION_UNLOCK_AGE + 5,
        100 - PENSION_UNLOCK_AGE + 5,
      );
      const phase2 = computeDepletion({
        startAge: PENSION_UNLOCK_AGE,
        startAssets: phase1.depletedAtAge !== null ? 0 : assetsAt55,
        yearlyWithdrawal: withdrawalAt55,
        expectedReturn: profile.expectedReturn,
        inflation: profile.inflation,
        inflateWithdrawal: true,
        horizonYears: phase2Horizon,
      });
      depletionResult = {
        series: [...phase1.series, ...phase2.series],
        depletedAtAge: phase1.depletedAtAge ?? phase2.depletedAtAge,
        finalAssets: phase2.finalAssets,
        finalRealAssets: phase2.finalRealAssets,
      };
    }
  } else if (needsNationalTransition) {
    // ── 은퇴 나이 55세 이상 & 65세 미만, 국민연금 있음 ──────────────────────
    const yearsToNational = NATIONAL_PENSION_AGE - profile.retirementAge;
    const phase1 = computeDepletion({
      startAge: profile.retirementAge,
      startAssets: effectiveAssets,
      yearlyWithdrawal: netYearlyWithdrawal, // = yearlyWd_preNational
      expectedReturn: profile.expectedReturn,
      inflation: profile.inflation,
      inflateWithdrawal: true,
      horizonYears: yearsToNational,
    });
    const withdrawalAt65   = netYearlyWithdrawal * Math.pow(1 + profile.inflation, yearsToNational);
    const withdrawalPost65 = Math.max(0, withdrawalAt65 - monthlyNational * 12);
    const phase2Horizon    = Math.max(
      profile.targetAge - NATIONAL_PENSION_AGE + 5,
      100 - NATIONAL_PENSION_AGE + 5,
    );
    const phase2 = computeDepletion({
      startAge: NATIONAL_PENSION_AGE,
      startAssets: phase1.depletedAtAge !== null ? 0 : phase1.finalAssets,
      yearlyWithdrawal: withdrawalPost65,
      expectedReturn: profile.expectedReturn,
      inflation: profile.inflation,
      inflateWithdrawal: true,
      horizonYears: phase2Horizon,
    });
    depletionResult = {
      series: [...phase1.series, ...phase2.series],
      depletedAtAge: phase1.depletedAtAge ?? phase2.depletedAtAge,
      finalAssets: phase2.finalAssets,
      finalRealAssets: phase2.finalRealAssets,
    };
  } else {
    // ── 단일 phase (은퇴 ≥65, 또는 국민연금 없음) ───────────────────────────
    depletionResult = computeDepletion({
      startAge: profile.retirementAge,
      startAssets: effectiveAssets,
      yearlyWithdrawal: netYearlyWithdrawal,
      expectedReturn: profile.expectedReturn,
      inflation: profile.inflation,
      inflateWithdrawal: true,
      horizonYears,
    });
  }

  const survivalYears: number | null =
    depletionResult.depletedAtAge !== null
      ? depletionResult.depletedAtAge - profile.retirementAge
      : null;
  const survivalOk =
    depletionResult.depletedAtAge === null ||
    depletionResult.depletedAtAge >= profile.targetAge;

  // 100세 시점 잔여 자산 (series에서 age===99 의 endAssets = 100세 잔액)
  const snapshotAt100 = depletionResult.series.find((s) => s.age === 99);
  const assetsAt100 = snapshotAt100?.endAssets ?? 0;

  // ── 연도별 차트 데이터 ──────────────────────────────────────────────────────
  const r = profile.expectedReturn;
  // 연금 자산 비중 (전체 자산 대비, 시뮬 시작 시점 기준)
  const pensionProportion = effectiveAssets > 0
    ? Math.min(1, portfolioData.pensionKrw / effectiveAssets)
    : 0;
  const stockProportion = 1 - pensionProportion;

  const projectionData: ProjectionPoint[] = depletionResult.series
    .filter((s) => s.age <= 100)
    .map((s) => {
      // 물가 반영 연간 총 생활비 (연금·배당 수입 포함 전체 지출)
      const yearsFromRetirement = s.age - profile.retirementAge;
      const totalBudget = Math.round(
        profile.monthlyBudget * 12 * Math.pow(1 + profile.inflation, yearsFromRetirement),
      );
      // ── 예상 세금: 연금소득세(age-based) + 금융소득세 ──────────────────────
      // ① 연금 인출세: 55세 이후 연금 비중 × 인출액에 연령별 세율 적용
      const pensionTaxRate =
        s.age < 70 ? 0.055 : s.age < 80 ? 0.044 : 0.033;
      const pensionWithdrawalAmt = s.age >= 55 ? s.withdrawal * pensionProportion : 0;
      const pensionTax = pensionWithdrawalAmt * pensionTaxRate;
      // ② 주식·ETF 투자수익 금융소득세: endAssets × r/(1+r) × 15.4% (비연금 부분)
      const stockGain = s.endAssets > 0
        ? (s.endAssets * stockProportion * r) / (1 + r)
        : 0;
      const stockTax = Math.max(0, stockGain) * 0.154;
      return {
        age: s.age,
        endAssets: Math.round(s.endAssets),
        totalBudget,
        withdrawal: Math.round(s.withdrawal),
        estimatedTax: Math.round(pensionTax + stockTax),
      };
    });

  // ── 차트 이벤트 마커 (기준선) ─────────────────────────────────────────────────
  const chartEvents: ChartEvent[] = [
    ...(pensionLocked
      ? [{ age: PENSION_UNLOCK_AGE, label: "55세 연금 인출 가능", color: "#f59e0b" }]
      : []),
    ...(needsNationalTransition
      ? [{ age: NATIONAL_PENSION_AGE, label: "65세 국민연금 시작", color: "#3b82f6" }]
      : []),
    ...(depletionResult.depletedAtAge !== null && depletionResult.depletedAtAge <= 100
      ? [{ age: depletionResult.depletedAtAge, label: `${depletionResult.depletedAtAge}세 고갈`, color: "#ef4444" }]
      : []),
  ];

  // ── 인출 전략 페이즈 ──────────────────────────────────────────────────────────
  interface WithdrawalPhase {
    ageRange: string;
    monthlyNeed: number;
    delta?: number;       // 이전 페이즈 대비 변화량 (음수 = 부담 감소)
    desc: string;
    highlight?: string;   // 강조할 핵심 메시지
  }
  const withdrawalPhases: WithdrawalPhase[] = (() => {
    const m1 = Math.round(yearlyWd_preNational / 12);
    const m2 = Math.round(yearlyWd_withNational / 12);
    const mSingle = Math.round(netYearlyWithdrawal / 12);

    if (pensionLocked && needsNationalTransition) {
      return [
        {
          ageRange: `${profile.retirementAge}~55세`,
          monthlyNeed: m1,
          desc: `비연금 자산만 인출 가능 (연금저축·IRP ${fmtKRWShort(lockedPensionKrw)} 잠금 중)`,
          highlight: "현금 → 국내주식(0%) → ETF(15.4%) → 해외주식(22%) 순",
        },
        {
          ageRange: `55~65세`,
          monthlyNeed: m1,
          delta: 0,
          desc: `연금저축·IRP 인출 가능 → 5.5% 연금소득세 (국민연금은 아직 미수령)`,
          highlight: "연금 자산을 비연금보다 먼저 소진하지 말 것 — 세율 혜택 유지",
        },
        {
          ageRange: `65세~`,
          monthlyNeed: m2,
          delta: m2 - m1,
          desc: `국민연금 월 ${fmtKRWShort(monthlyNational)} 자동 수령 → 인출 부담 감소`,
          highlight: "연금소득세 70세~ 4.4%, 80세~ 3.3%로 추가 감소",
        },
      ] as WithdrawalPhase[];
    } else if (pensionLocked) {
      return [
        {
          ageRange: `${profile.retirementAge}~55세`,
          monthlyNeed: mSingle,
          desc: `비연금 자산만 인출 (연금저축·IRP ${fmtKRWShort(lockedPensionKrw)} 잠금 중)`,
          highlight: "현금 → 국내주식(0%) → ETF(15.4%) → 해외주식(22%) 순",
        },
        {
          ageRange: `55세~`,
          monthlyNeed: mSingle,
          delta: 0,
          desc: `연금저축·IRP 인출 시작 → 5.5% 연금소득세 (70세~ 4.4%, 80세~ 3.3%)`,
          highlight: "연금 비중 높이면 세율 우위. 비연금 자산을 먼저 소진하는 전략 권장",
        },
      ] as WithdrawalPhase[];
    } else if (needsNationalTransition) {
      return [
        {
          ageRange: `${profile.retirementAge}~65세`,
          monthlyNeed: m1,
          desc: `연금·주식 자산 자유롭게 인출 가능 (국민연금 미수령 구간)`,
          highlight: "현금 → 국내주식(0%) → ETF(15.4%) → 해외주식(22%) → 연금(5.5%) 순",
        },
        {
          ageRange: `65세~`,
          monthlyNeed: m2,
          delta: m2 - m1,
          desc: `국민연금 월 ${fmtKRWShort(monthlyNational)} 자동 수령 → 인출 부담 감소`,
          highlight: "연금소득세 70세~ 4.4%, 80세~ 3.3%로 시간이 지날수록 절세 효과 증가",
        },
      ] as WithdrawalPhase[];
    } else {
      return [
        {
          ageRange: `${profile.retirementAge}세~`,
          monthlyNeed: mSingle,
          desc:
            profile.retirementAge >= NATIONAL_PENSION_AGE && monthlyNational > 0
              ? `국민연금 월 ${fmtKRWShort(monthlyNational)} 수령 중 — 잔여 부족분 자산 인출`
              : `모든 자산 인출 가능`,
          highlight: "현금 → 국내주식(0%) → ETF(15.4%) → 해외주식(22%) → 연금(5.5%) 순",
        },
      ] as WithdrawalPhase[];
    }
  })();

  // ── 세금 최적화 버킷 분석 ────────────────────────────────────────────────────
  // 월 인출 필요액 (1단계: 은퇴 직후, 명목 기준)
  const monthlyNeedPhase1 = withdrawalPhases.length > 0 ? withdrawalPhases[0].monthlyNeed : 0;

  // 버킷별 커버 개월 수 (단순 선형 추정, 수익률·물가 미반영)
  const cashCoverMonths  = monthlyNeedPhase1 > 0 ? Math.floor(portfolioData.cashKrw  / monthlyNeedPhase1) : 0;
  const stockCoverMonths = monthlyNeedPhase1 > 0 ? Math.floor(portfolioData.stocksKrw / monthlyNeedPhase1) : 0;

  // 연금 조기 인출 패널티 계산
  // - 55세 미만 해지·인출: 기타소득세 16.5% (불이익)
  // - 55세 이후 연금 수령: 연금소득세 5.5%→3.3% (정상)
  const earlyPensionTaxTotal  = Math.round(lockedPensionKrw * 0.165);
  const normalPensionTaxTotal = Math.round(lockedPensionKrw * 0.055); // 55~70세 기준
  const pensionTaxSaving = Math.max(0, earlyPensionTaxTotal - normalPensionTaxTotal);

  // 개인연금 수령액 기반 세금 계산
  const privatePensionAnnual = profile.privatePensionMonthly * 12;
  const privateOver1500 = privatePensionAnnual > 15_000_000;
  const privatePensionTax55_70 = Math.round(privatePensionAnnual * 0.055);
  const privatePensionTax70_80 = Math.round(privatePensionAnnual * 0.044);
  const privatePensionTax80up  = Math.round(privatePensionAnnual * 0.033);

  // 주식·ETF 매도 세금 시나리오 (미실현이익 50% 가정, 취득가 미입력)
  const stockGainEstimate = Math.round(portfolioData.stocksKrw * 0.5);
  const stockTaxIfDomestic   = 0;                                                          // 국내주식 소액주주: 0%
  const stockTaxIfETF        = Math.round(stockGainEstimate * 0.154);                     // 국내상장 해외ETF: 15.4%
  const stockTaxIfForeignNet = Math.round(Math.max(0, stockGainEstimate - 2_500_000) * 0.22); // 해외주식: 22%, 250만 공제

  // ── 포트폴리오 분류 ──────────────────────────────────────────────────────────
  const otherKrw = Math.max(
    0,
    portfolioData.totalKrw - portfolioData.pensionKrw - portfolioData.stocksKrw - portfolioData.cashKrw,
  );
  const categories = [
    { label: "주식/ETF", value: portfolioData.stocksKrw + otherKrw, color: "bg-blue-500", textColor: "text-blue-500" },
    { label: "연금/IRP", value: portfolioData.pensionKrw, color: "bg-sky-300", textColor: "text-sky-600" },
    { label: "현금/기타", value: portfolioData.cashKrw, color: "bg-neutral-300", textColor: "text-neutral-500" },
  ];

  const inflows =
    totalMonthlyInflow > 0
      ? [
          { label: "배당 수입", amount: monthlyDiv },
          { label: "국민연금", amount: monthlyNational },
          { label: "개인연금/IRP", amount: monthlyPrivate },
        ].filter((r) => r.amount > 0)
      : [];

  const guide = generateGuide(
    profile,
    survivalYears,
    monthlySurplus,
    monthlyDiv,
    totalMonthlyInflow,
    effectiveAssets,
  );

  return (
    <div className="flex flex-col gap-6">
      {/* 헤더 */}
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">은퇴 자산 통합 관리</h1>
          <p className="mt-0.5 text-sm text-neutral-400">
            {dateStr} | 정은한 은퇴를 위한 자산 분석 리포트
          </p>
        </div>
        <button
          onClick={onEdit}
          className="shrink-0 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-50"
        >
          설정 편집
        </button>
      </header>

      {/* KPI 카드 3개 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          label="전체 순자산"
          value={fmtKRWShort(effectiveAssets)}
          sub={profile.overrideAssetsKrw > 0 ? "직접 입력값 기준" : "앱 등록 자산 기준"}
        />
        <KpiCard
          label="월 가중 현금흐름"
          value={fmtKRW(Math.abs(monthlySurplus))}
          sub={
            monthlySurplus >= 0
              ? `▲ 월 ${fmtKRWShort(monthlySurplus)} 흑자`
              : `▼ 월 ${fmtKRWShort(Math.abs(monthlySurplus))} 부족`
          }
          accent={monthlySurplus >= 0 ? "green" : "red"}
        />
        <KpiCard
          label="은퇴 자산 생존 기간"
          value={fmtSurvival(survivalYears)}
          sub={
            assetsAt100 > 0
              ? `100세 잔여 ${fmtKRWShort(assetsAt100)}`
              : depletionResult.depletedAtAge !== null
                ? `${depletionResult.depletedAtAge}세 고갈 예상`
                : `목표 ${profile.targetAge}세 유지`
          }
          accent={survivalOk ? "green" : "red"}
        />
      </div>

      {/* 수령 시기 제약 안내 */}
      {(pensionLocked || needsNationalTransition) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-base text-amber-800 flex flex-col gap-1.5">
          {pensionLocked && (
            <>
              <p className="font-medium">
                연금저축/IRP {fmtKRWShort(lockedPensionKrw)}은 55세부터 인출 가능합니다
              </p>
              <p className="text-sm text-amber-600">
                은퇴({profile.retirementAge}세)→55세 구간은 비연금 자산만 운용, 55세부터 연금 합산하여 계산했습니다.
              </p>
            </>
          )}
          {needsNationalTransition && (
            <>
              {pensionLocked && <hr className="border-amber-200" />}
              <p className={pensionLocked ? "text-sm text-amber-600" : "font-medium"}>
                국민연금은 65세부터 수령 시작으로 계산됩니다
              </p>
              <p className="text-sm text-amber-600">
                은퇴({profile.retirementAge}세)→65세 구간은 국민연금 미수령으로 계산,
                65세부터 월 {fmtKRWShort(monthlyNational)} 수령 반영했습니다.
              </p>
            </>
          )}
        </div>
      )}

      {/* 슬라이더 패널 */}
      <SliderPanel profile={profile} onChange={onProfileChange} />

      {/* 연도별 자산 추이 차트 */}
      {projectionData.length > 0 && (
        <RetirementProjectionChart
          data={projectionData}
          returnRate={profile.expectedReturn}
          events={chartEvents}
        />
      )}

      {/* 자산 포트폴리오 비중 */}
      {effectiveAssets > 0 && (
        <section className="rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="mb-4 text-base font-medium uppercase tracking-wide text-neutral-500">
            자산 포트폴리오 비중
          </h2>
          <PortfolioBar categories={categories} />
        </section>
      )}

      {/* 월별 현금흐름 상세 */}
      <section className="rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="mb-4 text-base font-medium uppercase tracking-wide text-neutral-500">
          월별 현금흐름 상세 (인출 전략)
        </h2>
        <div className="flex flex-col gap-4">
          {inflows.length > 0 ? (
            <CashflowSection
              title="수입"
              color="green"
              total={totalMonthlyInflow}
              rows={inflows.map((r) => ({
                label: r.label,
                amount: r.amount,
                pct: totalMonthlyInflow > 0 ? (r.amount / totalMonthlyInflow) * 100 : 0,
              }))}
            />
          ) : (
            <p className="text-sm text-neutral-400">
              수입 정보 없음 — 설정에서 연금 정보를 입력하거나 자산 탭에서 종목을 등록하세요.
            </p>
          )}

          <CashflowSection
            title="지출"
            color="red"
            total={monthlyOutflow}
            rows={[]}
          />

          {/* 잔여 */}
          <div className="flex items-center justify-between border-t border-neutral-200 pt-4">
            <span className="text-base font-medium text-neutral-500">
              {monthlySurplus >= 0 ? "월 잉여금" : "월 부족분"}
            </span>
            <span className={`text-lg font-bold tabular-nums ${
              monthlySurplus >= 0 ? "text-emerald-700" : "text-red-700"
            }`}>
              {monthlySurplus >= 0 ? "+" : "−"}{fmtKRWShort(Math.abs(monthlySurplus))}
            </span>
          </div>

          {/* AI 분석 — 세금 최소화 인출 전략 */}
          <div className="flex flex-col gap-4 border-t border-neutral-100 pt-4">
            <p className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
              🤖 AI 분석 — 내 자산 기반 최적 인출 전략
            </p>

            {/* 자산 버킷 현황 */}
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3.5">
              <p className="mb-2.5 text-sm font-semibold text-neutral-600">자산 버킷 현황 · 인출 우선순위</p>
              <div className="flex flex-col gap-2">
                {[
                  {
                    priority: 1,
                    show: portfolioData.cashKrw > 0,
                    name: "현금·예수금",
                    amount: portfolioData.cashKrw,
                    months: cashCoverMonths,
                    taxLabel: "세금 0",
                    taxColor: "text-emerald-600 bg-emerald-50",
                    locked: false,
                  },
                  {
                    priority: 2,
                    show: portfolioData.stocksKrw > 0,
                    name: "주식·ETF",
                    amount: portfolioData.stocksKrw,
                    months: stockCoverMonths,
                    taxLabel: "0~22%",
                    taxColor: "text-amber-700 bg-amber-50",
                    locked: false,
                  },
                  {
                    priority: 3,
                    show: portfolioData.pensionKrw > 0,
                    name: "연금저축·IRP",
                    amount: portfolioData.pensionKrw,
                    months: null,
                    taxLabel: pensionLocked ? "5.5%~ (55세+)" : "3.3~5.5%",
                    taxColor: "text-blue-700 bg-blue-50",
                    locked: pensionLocked,
                  },
                ]
                  .filter((b) => b.show)
                  .map((b) => (
                    <div key={b.name} className="flex items-center gap-2 rounded-md bg-white border border-neutral-100 px-3 py-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-bold text-neutral-500">
                        {b.priority}
                      </span>
                      <span className="flex-1 text-base text-neutral-700">{b.name}</span>
                      {b.locked && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-sm font-bold text-amber-700">🔒55세+</span>
                      )}
                      {b.months != null && b.months > 0 && (
                        <span className="text-sm text-neutral-400 tabular-nums">약 {b.months}개월</span>
                      )}
                      <span className="text-base font-semibold tabular-nums text-neutral-800">{fmtKRWShort(b.amount)}</span>
                      <span className={`rounded px-1.5 py-0.5 text-sm font-semibold tabular-nums ${b.taxColor}`}>{b.taxLabel}</span>
                    </div>
                  ))}
              </div>
              {monthlyNeedPhase1 > 0 && (
                <p className="mt-2 text-sm text-neutral-400">
                  * 월 {fmtKRWShort(monthlyNeedPhase1)} 기준 단순 선형 추정 (수익·물가 미반영)
                </p>
              )}
            </div>

            {/* 55세 이전 연금 조기 인출 패널티 경고 */}
            {pensionTaxSaving > 0 && (
              <div className="rounded-lg border border-orange-200 bg-orange-50 p-3.5">
                <p className="text-base font-semibold text-orange-800">
                  ⚠️ 55세까지 대기하면 연금 세금 {fmtKRWShort(pensionTaxSaving)} 절약
                </p>
                <div className="mt-2.5 flex flex-col gap-1.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-orange-700">지금 전액 인출 (기타소득세 16.5%)</span>
                    <span className="font-bold tabular-nums text-red-600">−{fmtKRWShort(earlyPensionTaxTotal)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-orange-700">55세 이후 순차 수령 (연금소득세 5.5%~)</span>
                    <span className="font-bold tabular-nums text-emerald-700">−{fmtKRWShort(normalPensionTaxTotal)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-orange-200 pt-1.5 text-base font-bold">
                    <span className="text-orange-800">💡 절세 효과</span>
                    <span className="tabular-nums text-emerald-700">+{fmtKRWShort(pensionTaxSaving)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* 단계별 인출 계획 */}
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-semibold text-neutral-500 mb-0.5">단계별 인출 계획</p>
              {withdrawalPhases.map((phase, i) => {
                const isLast = i === withdrawalPhases.length - 1;
                return (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className="flex flex-col items-center shrink-0">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-sm font-bold text-amber-700">
                        {i + 1}
                      </span>
                      {!isLast && <div className="w-px flex-1 bg-neutral-200 my-1 min-h-[14px]" />}
                    </div>
                    <div className={`flex-1 ${!isLast ? "pb-2.5" : ""}`}>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-base font-semibold text-neutral-700">{phase.ageRange}</span>
                        <div className="flex items-center gap-2">
                          {phase.delta != null && phase.delta < 0 && (
                            <span className="text-sm font-semibold text-emerald-600">
                              ▼ {fmtKRWShort(Math.abs(phase.delta))}/월 감소
                            </span>
                          )}
                          <span className="text-base font-bold text-blue-700 tabular-nums">
                            {phase.monthlyNeed > 0 ? `월 ${fmtKRWShort(phase.monthlyNeed)} 인출` : "인출 불필요"}
                          </span>
                        </div>
                      </div>
                      <p className="mt-0.5 text-sm text-neutral-500 leading-relaxed">{phase.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="text-sm text-neutral-400 bg-neutral-50 rounded px-3 py-2">
              💡 세금 상세 계산 및 종목별 세율 분석은 아래 <b>지능형 은퇴 가이드 → 인출 세금 분석</b>을 참조하세요.
            </p>
          </div>
        </div>
      </section>

      {/* 지능형 은퇴 가이드 */}
      <section className="rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="mb-4 text-base font-medium uppercase tracking-wide text-neutral-500">
          지능형 은퇴 가이드
        </h2>
        <div className="flex flex-col gap-2">
          {guide.map((g, i) => (
            <GuideCard key={i} type={g.type} title={g.title} desc={g.desc} />
          ))}
        </div>
        <TaxAnalysisSection
          profile={profile}
          portfolioData={portfolioData}
          taxData={{
            lockedPensionKrw,
            earlyPensionTaxTotal,
            normalPensionTaxTotal,
            pensionTaxSaving,
            privatePensionAnnual,
            privateOver1500,
            privatePensionTax55_70,
            privatePensionTax70_80,
            privatePensionTax80up,
            stocksKrw: portfolioData.stocksKrw,
            stockGainEstimate,
            stockTaxIfDomestic,
            stockTaxIfETF,
            stockTaxIfForeignNet,
          }}
        />
      </section>
    </div>
  );
}

// ── Root Component ────────────────────────────────────────────────────────────

export function RetirementDashboard({ portfolioData }: { portfolioData: PortfolioData }) {
  const [profile, setProfile] = useState<RetirementProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const saved = loadProfile();
    setProfile(saved);
    setLoaded(true);
  }, []);

  if (!loaded) {
    return (
      <div className="py-12 text-center text-base text-neutral-400">불러오는 중…</div>
    );
  }

  if (!profile) {
    return (
      <SetupWizard
        portfolioData={portfolioData}
        onComplete={(p) => {
          setProfile(p);
          setEditing(false);
        }}
      />
    );
  }

  if (editing) {
    return (
      <EditForm
        profile={profile}
        portfolioData={portfolioData}
        onSave={(p) => {
          setProfile(p);
          saveProfile(p);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <Dashboard
      profile={profile}
      portfolioData={portfolioData}
      onEdit={() => setEditing(true)}
      onProfileChange={(p) => {
        setProfile(p);
        saveProfile(p);
      }}
    />
  );
}
