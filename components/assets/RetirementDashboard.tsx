"use client";

import { useState, useEffect } from "react";
import { fmtKRW, fmtKRWShort } from "@/lib/utils/format";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PortfolioData = {
  totalKrw: number;
  pensionKrw: number;
  stocksKrw: number;
  cashKrw: number;
  monthlyDivKrw: number;
  usdKrw: number;
};

type RetirementProfile = {
  currentAge: number;
  retirementAge: number;
  targetAge: number;
  monthlyBudget: number;
  realEstateValue: number;
  realEstateMarket: number;
  realEstateLoan: number;
  realEstateAddress: string;
  nationalPensionMonthly: number;
  privatePensionYearly: number;
};

const STORAGE_KEY = "retirement-profile";

const DEFAULT: RetirementProfile = {
  currentAge: 50,
  retirementAge: 60,
  targetAge: 90,
  monthlyBudget: 3_000_000,
  realEstateValue: 0,
  realEstateMarket: 0,
  realEstateLoan: 0,
  realEstateAddress: "",
  nationalPensionMonthly: 0,
  privatePensionYearly: 0,
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
  if (years === null || years > 99) return "99년 이상";
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
}: {
  onComplete: (p: RetirementProfile) => void;
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
          <span>{["기본 정보", "생활비 계획", "부동산 자산", "연금 계획"][step]}</span>
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
          <Step3
            form={form}
            onChange={(updates) => setForm((f) => ({ ...f, ...updates }))}
          />
        )}
        {step === 3 && (
          <Step4
            form={form}
            onChange={(k, v) => setForm((f) => ({ ...f, [k]: v }))}
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
            min={form.currentAge}
            max={90}
            value={form.retirementAge}
            onChange={(e) => onChange("retirementAge", Number(e.target.value))}
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

function Step3({
  form,
  onChange,
}: {
  form: RetirementProfile;
  onChange: (updates: Partial<RetirementProfile>) => void;
}) {
  const netValue = Math.max(0, form.realEstateMarket - form.realEstateLoan);

  return (
    <div className="flex flex-col gap-5">
      <p className="font-medium text-neutral-800">부동산 자산이 있으신가요?</p>
      <FieldRow label="주소 (선택)">
        <input
          type="text"
          value={form.realEstateAddress}
          onChange={(e) => onChange({ realEstateAddress: e.target.value })}
          placeholder="예: 서울 강남구 삼성동 000"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
      </FieldRow>
      <FieldRow label="현재 시세">
        <ManWonInput
          value={form.realEstateMarket}
          onChange={(v) => onChange({ realEstateMarket: v, realEstateValue: Math.max(0, v - form.realEstateLoan) })}
        />
      </FieldRow>
      <FieldRow label="대출 잔액">
        <ManWonInput
          value={form.realEstateLoan}
          onChange={(v) => onChange({ realEstateLoan: v, realEstateValue: Math.max(0, form.realEstateMarket - v) })}
        />
      </FieldRow>
      {(form.realEstateMarket > 0 || form.realEstateLoan > 0) && (
        <div className="rounded-lg bg-neutral-50 p-3 text-sm">
          <span className="text-neutral-500">순자산 (시세 - 대출): </span>
          <span className="font-semibold">{fmtKRWShort(netValue)}</span>
        </div>
      )}
      {form.realEstateMarket === 0 && (
        <p className="text-xs text-neutral-400">부동산이 없다면 그냥 다음으로 넘어가세요.</p>
      )}
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

function CashflowRow({
  label,
  amount,
  pct,
  accent,
  bold,
}: {
  label: string;
  amount: number;
  pct?: number;
  accent?: "red" | "green";
  bold?: boolean;
}) {
  return (
    <tr className="border-t border-neutral-100">
      <td className={`py-2 pr-3 text-sm ${bold ? "font-semibold" : ""}`}>{label}</td>
      <td
        className={`py-2 pr-3 text-right text-sm tabular-nums ${bold ? "font-semibold" : ""} ${
          accent === "red" ? "text-red-700" : accent === "green" ? "text-emerald-700" : ""
        }`}
      >
        {amount >= 0 ? fmtKRW(amount) : `−${fmtKRW(Math.abs(amount))}`}
      </td>
      {pct != null ? (
        <td className="py-2 text-right text-xs text-neutral-400">{pct.toFixed(0)}%</td>
      ) : (
        <td />
      )}
    </tr>
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

  if (profile.realEstateValue > totalNetAssets * 0.5) {
    tips.push({
      type: "info",
      title: "부동산 비중이 높습니다",
      desc: `순자산의 ${((profile.realEstateValue / totalNetAssets) * 100).toFixed(0)}%가 부동산입니다. 유동성 확보를 위해 금융 자산 비중 확대를 검토하세요.`,
    });
  }

  return tips;
}

function Dashboard({
  profile,
  portfolioData,
  onEdit,
}: {
  profile: RetirementProfile;
  portfolioData: PortfolioData;
  onEdit: () => void;
}) {
  const now = new Date();
  const dateStr = `${now.getFullYear()}년 ${now.getMonth() + 1}월 기준`;

  // ── 계산 ─────────────────────────────────────────────────────────────────
  const totalNetAssets = portfolioData.totalKrw + profile.realEstateValue;

  const monthlyDiv = portfolioData.monthlyDivKrw;
  const monthlyNational = profile.nationalPensionMonthly;
  const monthlyPrivate = Math.round(profile.privatePensionYearly / 12);
  const totalMonthlyInflow = monthlyDiv + monthlyNational + monthlyPrivate;
  const monthlyOutflow = profile.monthlyBudget;
  const monthlySurplus = totalMonthlyInflow - monthlyOutflow;

  // 생존 기간: 투자 자산(부동산 제외) / 월 순 소진액
  const liquidAssets = portfolioData.totalKrw;
  const netMonthlyBurn = Math.max(0, monthlyOutflow - totalMonthlyInflow);
  const survivalYears: number | null =
    netMonthlyBurn === 0 ? null : liquidAssets / (netMonthlyBurn * 12);

  const targetYears = profile.targetAge - profile.currentAge;
  const survivalOk = survivalYears === null || survivalYears >= targetYears;

  // 포트폴리오 분류
  const otherKrw = Math.max(
    0,
    portfolioData.totalKrw - portfolioData.pensionKrw - portfolioData.stocksKrw - portfolioData.cashKrw,
  );
  const categories = [
    { label: "부동산", value: profile.realEstateValue, color: "bg-blue-800", textColor: "text-blue-800" },
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
    totalNetAssets,
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
          value={fmtKRWShort(totalNetAssets)}
          sub={
            profile.realEstateValue > 0
              ? `투자자산 ${fmtKRWShort(portfolioData.totalKrw)} + 부동산 ${fmtKRWShort(profile.realEstateValue)}`
              : "부동산 제외 투자자산"
          }
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
          sub={`목표: ${profile.targetAge}세까지 유지`}
          accent={survivalOk ? "green" : "red"}
        />
      </div>

      {/* 자산 포트폴리오 비중 */}
      {totalNetAssets > 0 && (
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
        <table className="w-full">
          <thead>
            <tr className="text-xs text-neutral-400">
              <th className="pb-2 pr-3 text-left">구분 / 항목</th>
              <th className="pb-2 pr-3 text-right">금액</th>
              <th className="pb-2 text-right">비중</th>
            </tr>
          </thead>
          <tbody>
            {inflows.length > 0 ? (
              <>
                <tr>
                  <td
                    colSpan={3}
                    className="pt-2 pb-1 text-xs font-semibold text-emerald-700"
                  >
                    수입 (Inflow)
                  </td>
                </tr>
                {inflows.map((r) => (
                  <CashflowRow
                    key={r.label}
                    label={r.label}
                    amount={r.amount}
                    pct={totalMonthlyInflow > 0 ? (r.amount / totalMonthlyInflow) * 100 : 0}
                    accent="green"
                  />
                ))}
              </>
            ) : (
              <tr>
                <td colSpan={3} className="py-2 text-xs text-neutral-400">
                  수입 정보 없음 — 설정에서 연금 정보를 입력하거나 자산 탭에서 종목을 등록하세요.
                </td>
              </tr>
            )}

            <tr>
              <td colSpan={3} className="pt-3 pb-1 text-xs font-semibold text-red-700">
                지출 (Outflow)
              </td>
            </tr>
            <CashflowRow
              label="기초 생활비 및 보험료"
              amount={monthlyOutflow}
              accent="red"
            />

            <tr>
              <td colSpan={3} className="pt-3 pb-1 text-xs font-semibold text-neutral-600">
                잔여 (Surplus)
              </td>
            </tr>
            <CashflowRow
              label={monthlySurplus >= 0 ? "여유 자금 (여가/재투자)" : "부족분"}
              amount={Math.abs(monthlySurplus)}
              accent={monthlySurplus >= 0 ? "green" : "red"}
              bold
            />
          </tbody>
        </table>
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

  if (!profile || editing) {
    return (
      <SetupWizard
        onComplete={(p) => {
          setProfile(p);
          setEditing(false);
        }}
      />
    );
  }

  return (
    <Dashboard
      profile={profile}
      portfolioData={portfolioData}
      onEdit={() => setEditing(true)}
    />
  );
}
