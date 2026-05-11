"use client";

import { useState, useEffect } from "react";
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
  privatePensionYearly: number;
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
  privatePensionYearly: 0,
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
        <h1 className="text-2xl font-semibold tracking-tight">은퇴 자산 설정</h1>
        <p className="mt-1 text-sm text-neutral-500">
          몇 가지 정보를 입력하면 나만의 은퇴 대시보드를 만들어 드려요.
        </p>
      </header>

      {/* 진행 바 */}
      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-xs text-neutral-400">
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
            className="flex-1 rounded-xl border border-neutral-200 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            이전
          </button>
        )}
        <button
          onClick={next}
          className="flex-1 rounded-xl bg-amber-500 py-3 text-sm font-semibold text-white hover:bg-amber-600 active:scale-95 transition-transform"
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
              className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
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
          className="ml-auto flex items-center gap-0.5 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs text-neutral-500 hover:bg-neutral-50"
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
                <span className="text-sm font-semibold text-neutral-800">{ex.label}</span>
                <span className="text-xs text-neutral-500">{ex.desc}</span>
              </div>
              {ex.yearly ? (
                <div className="grid grid-cols-6 gap-2">
                  {ex.yearly.map((y) => (
                    <div key={y.year} className="flex flex-col items-center gap-0.5">
                      <span className="text-xs text-neutral-400">{y.year}</span>
                      <span className={`text-sm font-semibold tabular-nums ${y.rate >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                        {y.rate >= 0 ? "+" : ""}{(y.rate * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-xs text-neutral-400">5년 평균</span>
                    <span className={`text-sm font-bold tabular-nums ${ex.value >= 0 ? "text-amber-600" : "text-red-500"}`}>
                      {ex.value >= 0 ? "+" : ""}{(ex.value * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-neutral-500">현재 앱 등록 종목 기준 — 연도별 수익률 데이터 없음</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 직접 입력 */}
      <div className="flex items-center gap-2">
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
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
        <span className="shrink-0 text-xs text-neutral-500">%</span>
      </div>
      <p className="text-xs text-neutral-400">분산투자 기준 일반적으로 6~8%를 많이 사용합니다.</p>
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
          className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
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
          className="ml-auto flex items-center gap-0.5 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs text-neutral-500 hover:bg-neutral-50"
        >
          추가 설명 {open ? "▲" : "▼"}
        </button>
      </div>

      {/* 펼치기 설명 */}
      {open && (
        <div className="rounded-lg bg-neutral-50 p-4 flex flex-col gap-3">
          <p className="text-sm font-semibold text-neutral-700">🇰🇷 한국 소비자물가 상승률 (통계청)</p>
          <div className="grid grid-cols-6 gap-2">
            {INFLATION_DATA.map((d) => (
              <div key={d.year} className="flex flex-col items-center gap-0.5">
                <span className="text-xs text-neutral-400">{d.year}</span>
                <span className={`text-sm font-semibold tabular-nums ${d.rate >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {d.rate >= 0 ? "+" : ""}{(d.rate * 100).toFixed(1)}%
                </span>
              </div>
            ))}
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-xs text-neutral-400">5년 평균</span>
              <span className="text-sm font-bold text-amber-600 tabular-nums">
                +{(INFLATION_AVG * 100).toFixed(1)}%
              </span>
            </div>
          </div>
          <p className="text-xs text-neutral-500">5년 평균(2021~2025) 기준. 시뮬레이션 기본값으로 설정되어 있습니다.</p>
        </div>
      )}

      {/* 직접 입력 */}
      <div className="flex items-center gap-2">
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
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
        <span className="shrink-0 text-xs text-neutral-500">%</span>
      </div>
    </div>
  );
}

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-neutral-700">{label}</label>
      {children}
      {hint && <p className="text-xs text-neutral-500">{hint}</p>}
    </div>
  );
}

function ManWonInput({
  value,
  onChange,
  placeholder,
}: {
  value: number;
  onChange: (v: number) => void;
  placeholder?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");
  const displayVal = value === 0 ? "" : String(Math.round(value / 10_000));

  return (
    <div className="flex items-center gap-2">
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
        className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900"
      />
      <span className="shrink-0 text-xs text-neutral-500">만원</span>
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
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={20}
            max={90}
            value={form.currentAge}
            onChange={(e) => onChange("currentAge", Number(e.target.value))}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
          <span className="shrink-0 text-xs text-neutral-500">세</span>
        </div>
      </FieldRow>
      <FieldRow label="은퇴 목표 나이">
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={form.currentAge + 1}
            max={90}
            value={form.retirementAge}
            onChange={(e) => onChange("retirementAge", Math.max(form.currentAge + 1, Number(e.target.value)))}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
          <span className="shrink-0 text-xs text-neutral-500">세</span>
        </div>
      </FieldRow>
      <FieldRow
        label="자산 생존 목표 나이"
        hint="몇 살까지 자산이 유지되길 원하시나요? (기본 90세)"
      >
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={70}
            max={120}
            value={form.targetAge}
            onChange={(e) => onChange("targetAge", Number(e.target.value))}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
          <span className="shrink-0 text-xs text-neutral-500">세</span>
        </div>
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
            <span className="text-xs font-semibold text-neutral-700">{ex.label}</span>
            <span className="mt-0.5 text-sm font-bold text-neutral-900">{ex.value}만원</span>
            <span className="mt-0.5 text-[10px] text-neutral-500">{ex.desc}</span>
          </button>
        ))}
      </div>
      <FieldRow
        label="월 목표 생활비"
        hint="통계청 2024 가계동향조사 기준. 위 버튼으로 빠르게 선택하거나 직접 입력하세요."
      >
        <ManWonInput value={form.monthlyBudget} onChange={(v) => onChange("monthlyBudget", v)} />
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
        label="개인연금/IRP 예상 연 수령액"
        hint="연저펀·IRP 합산 연간 수령 예상액."
      >
        <ManWonInput
          value={form.privatePensionYearly}
          onChange={(v) => onChange("privatePensionYearly", v)}
          placeholder="0"
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
        <h1 className="text-2xl font-semibold tracking-tight">설정 편집</h1>
        <p className="mt-1 text-xs text-neutral-500">슬라이더에서 조정한 값이 반영되어 있습니다.</p>
      </header>

      {/* 투자자산 */}
      <section className="rounded-xl border border-neutral-200 bg-white p-5 flex flex-col gap-3">
        <p className="text-sm font-semibold text-neutral-700">투자자산</p>
        <div className="rounded-lg bg-neutral-50 p-3 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-neutral-400">내 자산 기준 (자동)</p>
            <p className="text-base font-bold text-neutral-900">{fmtKRWShort(portfolioData.totalKrw)}</p>
          </div>
          {form.overrideAssetsKrw === 0 ? (
            <button
              onClick={() => set("overrideAssetsKrw", portfolioData.totalKrw || 100_000_000)}
              className="text-xs text-blue-600 hover:underline"
            >
              직접 입력
            </button>
          ) : (
            <button
              onClick={() => set("overrideAssetsKrw", 0)}
              className="text-xs text-neutral-400 hover:underline"
            >
              자동으로 되돌리기
            </button>
          )}
        </div>
        {form.overrideAssetsKrw > 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-xs text-neutral-500">직접 입력 (만원 단위)</p>
            <ManWonInput value={form.overrideAssetsKrw} onChange={(v) => set("overrideAssetsKrw", v)} />
          </div>
        )}
      </section>

      {/* 기본 정보 */}
      <section className="rounded-xl border border-neutral-200 bg-white p-5 flex flex-col gap-4">
        <p className="text-sm font-semibold text-neutral-700">기본 정보</p>
        <div className="grid grid-cols-3 gap-3">
          <FieldRow label="현재 나이">
            <div className="flex items-center gap-1.5">
              <input
                type="number" min={20} max={90} value={form.currentAge}
                onChange={(e) => set("currentAge", Number(e.target.value))}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
              />
              <span className="shrink-0 text-xs text-neutral-500">세</span>
            </div>
          </FieldRow>
          <FieldRow label="은퇴 목표">
            <div className="flex items-center gap-1.5">
              <input
                type="number" min={form.currentAge + 1} max={90} value={form.retirementAge}
                onChange={(e) => set("retirementAge", Math.max(form.currentAge + 1, Number(e.target.value)))}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
              />
              <span className="shrink-0 text-xs text-neutral-500">세</span>
            </div>
          </FieldRow>
          <FieldRow label="생존 목표">
            <div className="flex items-center gap-1.5">
              <input
                type="number" min={70} max={120} value={form.targetAge}
                onChange={(e) => set("targetAge", Number(e.target.value))}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
              />
              <span className="shrink-0 text-xs text-neutral-500">세</span>
            </div>
          </FieldRow>
        </div>
      </section>

      {/* 월 생활비 */}
      <section className="rounded-xl border border-neutral-200 bg-white p-5 flex flex-col gap-3">
        <p className="text-sm font-semibold text-neutral-700">월 생활비</p>
        <div className="grid grid-cols-3 gap-2">
          {[{label:"186만원",value:186},{label:"280만원",value:280},{label:"400만원",value:400}].map((ex) => (
            <button key={ex.value} onClick={() => set("monthlyBudget", ex.value * 10_000)}
              className={`rounded-lg border py-2 text-sm font-medium transition-colors ${
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
        <p className="text-sm font-semibold text-neutral-700">연금</p>
        <FieldRow label="국민연금 월 수령액">
          <ManWonInput value={form.nationalPensionMonthly} onChange={(v) => set("nationalPensionMonthly", v)} placeholder="0" />
        </FieldRow>
        <FieldRow label="개인연금 / IRP 연 수령액">
          <ManWonInput value={form.privatePensionYearly} onChange={(v) => set("privatePensionYearly", v)} placeholder="0" />
        </FieldRow>
      </section>

      {/* 수익률 / 물가상승률 */}
      <section className="rounded-xl border border-neutral-200 bg-white p-5 flex flex-col gap-5">
        <p className="text-sm font-semibold text-neutral-700">수익률 / 물가상승률</p>

        <div className="flex flex-col gap-3">
          <label className="text-sm text-neutral-600">예상 연 수익률</label>
          <ReturnRatePicker
            value={form.expectedReturn}
            onChange={(v) => set("expectedReturn", v)}
            avgReturnPct={portfolioData.avgReturnPct}
          />
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-sm text-neutral-600">물가상승률</label>
          <InflationPicker
            value={form.inflation}
            onChange={(v) => set("inflation", v)}
          />
        </div>
      </section>

      {/* 버튼 */}
      <div className="flex gap-3 pb-4">
        <button onClick={onCancel}
          className="flex-1 rounded-xl border border-neutral-200 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
          취소
        </button>
        <button onClick={() => onSave(form)}
          className="flex-1 rounded-xl bg-amber-500 py-3 text-sm font-semibold text-white hover:bg-amber-600 active:scale-95 transition-transform">
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
        <label className="text-sm font-medium text-neutral-700">예상 연 수익률</label>
        <ReturnRatePicker
          value={form.expectedReturn}
          onChange={(v) => onChange("expectedReturn", v)}
          avgReturnPct={portfolioData.avgReturnPct}
        />
      </div>

      {/* 물가상승률 */}
      <div className="flex flex-col gap-3">
        <label className="text-sm font-medium text-neutral-700">물가상승률</label>
        <InflationPicker
          value={form.inflation}
          onChange={(v) => onChange("inflation", v)}
        />
      </div>
    </div>
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
      <span className="text-xs font-medium text-neutral-500">{label}</span>
      <span className="text-xl font-bold text-neutral-900 leading-tight">{value}</span>
      {sub && <span className={`text-xs ${subColor}`}>{sub}</span>}
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
          <div key={c.label} className="flex items-center gap-1.5 text-xs text-neutral-600">
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
        <span className={`text-sm font-semibold ${isGreen ? "text-emerald-700" : "text-red-700"}`}>{title}</span>
        <span className={`text-sm font-semibold tabular-nums ${isGreen ? "text-emerald-700" : "text-red-700"}`}>
          {fmtKRW(total)}
        </span>
      </div>
      {/* 서브 항목 (들여쓰기) */}
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between py-1 pl-4">
          <span className="text-sm text-neutral-500">{r.label}</span>
          <div className="flex items-center gap-3">
            {r.pct != null && (
              <span className="text-xs text-neutral-400 tabular-nums">{r.pct.toFixed(0)}%</span>
            )}
            <span className="text-sm tabular-nums text-neutral-500">{fmtKRW(r.amount)}</span>
          </div>
        </div>
      ))}
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
      <p className="text-sm font-semibold">
        {icons[type]} {title}
      </p>
      <p className="mt-0.5 text-xs opacity-90">{desc}</p>
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
    min: 500_000,
    max: 10_000_000,
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
    key: "privatePensionYearly",
    label: "개인연금 연수령",
    min: 0,
    max: 50_000_000,
    step: 1_000_000,
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
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-500">
        파라미터 조정
      </h2>
      <div className="grid grid-cols-3 gap-x-4 gap-y-3">
        {SLIDERS.map((s) => {
          const value = profile[s.key] as number;
          const effectiveMin = s.key === "retirementAge" ? profile.currentAge + 1 : s.min;
          const pct = Math.max(0, Math.min(100, ((value - effectiveMin) / (s.max - effectiveMin)) * 100));
          return (
            <div key={s.key} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[11px]">
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
                  if (s.key === "retirementAge") v = Math.max(profile.currentAge + 1, v);
                  onChange({ ...profile, [s.key]: v });
                }}
                className="w-full cursor-pointer appearance-none rounded-full accent-amber-500"
                style={{
                  height: "4px",
                  backgroundImage: `linear-gradient(to right, #f59e0b ${pct}%, #e5e7eb ${pct}%)`,
                }}
              />
              <div className="flex justify-between text-[9px] text-neutral-400">
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
  const monthlyDiv = portfolioData.monthlyDivKrw;
  const monthlyNational = profile.nationalPensionMonthly;
  const monthlyPrivate = Math.round(profile.privatePensionYearly / 12);
  const totalMonthlyInflow = monthlyDiv + monthlyNational + monthlyPrivate;
  const monthlyOutflow = profile.monthlyBudget;
  const monthlySurplus = totalMonthlyInflow - monthlyOutflow;
  const netYearlyWithdrawal = Math.max(0, monthlyOutflow - totalMonthlyInflow) * 12;

  // ── 연금저축/IRP 55세 잠금 처리 ──────────────────────────────────────────────
  const PENSION_UNLOCK_AGE = 55;
  const pensionLocked =
    profile.retirementAge < PENSION_UNLOCK_AGE && portfolioData.pensionKrw > 0;
  const yearsToUnlock = pensionLocked ? PENSION_UNLOCK_AGE - profile.retirementAge : 0;
  // override 중에는 연금 비율만큼 잠금 추정 (정확도 한계 있음 — override 시 직접 입력값 기준)
  const lockedPensionKrw = pensionLocked
    ? profile.overrideAssetsKrw > 0
      ? 0  // override 자산은 사용자가 직접 입력한 값 → 잠금 분리 불가, 비활성화
      : portfolioData.pensionKrw
    : 0;
  const immediateAssets = effectiveAssets - lockedPensionKrw;

  // ── Horizon: 최소 100세까지 계산 ──────────────────────────────────────────
  const horizonYears = Math.max(
    profile.targetAge - profile.retirementAge + 5,
    100 - profile.retirementAge + 5,
  );

  // ── 생존 기간 시뮬 (2-phase: 잠금 연금 있을 때) ────────────────────────────
  let depletionResult: DepletionOutput;
  if (pensionLocked && lockedPensionKrw > 0) {
    // Phase 1: retirementAge → 55세 (비연금 자산만 사용)
    const phase1 = computeDepletion({
      startAge: profile.retirementAge,
      startAssets: immediateAssets,
      yearlyWithdrawal: netYearlyWithdrawal,
      expectedReturn: profile.expectedReturn,
      inflation: profile.inflation,
      inflateWithdrawal: true,
      horizonYears: yearsToUnlock,
    });
    // 55세 시점: 비연금 잔액 + 연금 성장분
    const pensionGrown = lockedPensionKrw * Math.pow(1 + profile.expectedReturn, yearsToUnlock);
    const assetsAt55 = phase1.finalAssets + pensionGrown;
    // 55세 시점의 연간 인출액 (물가 누적 반영)
    const withdrawalAt55 =
      netYearlyWithdrawal * Math.pow(1 + profile.inflation, yearsToUnlock);

    // Phase 2: 55세 → 이후 (연금 합산 자산)
    const phase2HorizonYears = Math.max(
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
      horizonYears: phase2HorizonYears,
    });
    depletionResult = {
      series: [...phase1.series, ...phase2.series],
      depletedAtAge: phase1.depletedAtAge ?? phase2.depletedAtAge,
      finalAssets: phase2.finalAssets,
      finalRealAssets: phase2.finalRealAssets,
    };
  } else {
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
          <h1 className="text-2xl font-semibold tracking-tight">은퇴 자산 통합 관리</h1>
          <p className="mt-0.5 text-xs text-neutral-400">
            {dateStr} | 정은한 은퇴를 위한 자산 분석 리포트
          </p>
        </div>
        <button
          onClick={onEdit}
          className="shrink-0 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
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

      {/* 55세 연금 잠금 안내 */}
      {pensionLocked && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">연금저축/IRP {fmtKRWShort(lockedPensionKrw)}은 55세부터 인출 가능합니다</p>
          <p className="mt-0.5 text-xs text-amber-600">
            은퇴({profile.retirementAge}세)→55세 구간은 비연금 자산만 운용, 55세부터 연금 합산하여 계산했습니다.
          </p>
        </div>
      )}

      {/* 슬라이더 패널 */}
      <SliderPanel profile={profile} onChange={onProfileChange} />

      {/* 자산 포트폴리오 비중 */}
      {effectiveAssets > 0 && (
        <section className="rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-neutral-500">
            자산 포트폴리오 비중
          </h2>
          <PortfolioBar categories={categories} />
        </section>
      )}

      {/* 월별 현금흐름 상세 */}
      <section className="rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-neutral-500">
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
            <p className="text-xs text-neutral-400">
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
            <span className="text-sm font-medium text-neutral-500">
              {monthlySurplus >= 0 ? "월 잉여금" : "월 부족분"}
            </span>
            <span className={`text-lg font-bold tabular-nums ${
              monthlySurplus >= 0 ? "text-emerald-700" : "text-red-700"
            }`}>
              {monthlySurplus >= 0 ? "+" : "−"}{fmtKRWShort(Math.abs(monthlySurplus))}
            </span>
          </div>
        </div>
      </section>

      {/* 지능형 은퇴 가이드 */}
      <section className="rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-neutral-500">
          지능형 은퇴 가이드
        </h2>
        <div className="flex flex-col gap-2">
          {guide.map((g, i) => (
            <GuideCard key={i} type={g.type} title={g.title} desc={g.desc} />
          ))}
        </div>
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
      <div className="py-12 text-center text-sm text-neutral-400">불러오는 중…</div>
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
