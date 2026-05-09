"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";

// ── 공통 스타일 ──────────────────────────────────────────────────────────────
const inputCls =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 outline-none focus:border-neutral-900";
const labelCls = "flex flex-col gap-1 text-sm";
const labelTitleCls = "font-medium text-neutral-700";
const hintCls = "text-xs text-neutral-600";
const unitCls = "shrink-0 text-xs text-neutral-600 whitespace-nowrap";

// ── 기본 숫자 필드 ───────────────────────────────────────────────────────────
type Props = {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  hint?: string;
  className?: string;
};

export function NumberField({
  label,
  value,
  onChange,
  unit,
  step,
  min,
  max,
  hint,
  className,
}: Props) {
  return (
    <label className={cn(labelCls, className)}>
      <span className={labelTitleCls}>{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(Number(e.target.value))}
          step={step}
          min={min}
          max={max}
          className={inputCls}
        />
        {unit && <span className={unitCls}>{unit}</span>}
      </div>
      {hint && <span className={hintCls}>{hint}</span>}
    </label>
  );
}

// ── 원화 필드: 포커스 해제 시 콤마 표시 ─────────────────────────────────────
type MoneyProps = {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  hint?: string;
  className?: string;
};

export function MoneyField({ label, value, onChange, unit, hint, className }: MoneyProps) {
  const [focused, setFocused] = useState(false);

  const display = focused
    ? value === 0 ? "" : String(value)
    : value === 0 ? "" : value.toLocaleString("ko-KR");

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/[^0-9]/g, "");
    onChange(raw ? Number(raw) : 0);
  }

  return (
    <label className={cn(labelCls, className)}>
      <span className={labelTitleCls}>{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="text"
          inputMode="numeric"
          value={display}
          placeholder="0"
          onChange={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className={inputCls}
        />
        {unit && <span className={unitCls}>{unit}</span>}
      </div>
      {hint && <span className={hintCls}>{hint}</span>}
    </label>
  );
}

// ── 비율 필드: 0.04 ↔ 4% 변환 ────────────────────────────────────────────────
type PercentProps = {
  label: string;
  value: number;          // 내부값: 0.04
  onChange: (v: number) => void;
  step?: number;          // % 단위 스텝 (기본 0.5)
  min?: number;           // % 단위 최솟값 (기본 없음)
  max?: number;           // % 단위 최댓값 (기본 없음)
  hint?: string;
  className?: string;
};

export function PercentField({
  label,
  value,
  onChange,
  min,
  max,
  hint,
  className,
}: PercentProps) {
  const toDisplay = (v: number) =>
    Number.isFinite(v) ? String(parseFloat((v * 100).toFixed(4))) : "0";

  const [focused, setFocused] = useState(false);
  const [local, setLocal] = useState(toDisplay(value));

  function handleFocus() {
    setLocal(toDisplay(value));
    setFocused(true);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setLocal(raw);
    const n = parseFloat(raw);
    if (!isNaN(n)) onChange(n / 100);
  }

  function handleBlur() {
    const n = parseFloat(local);
    const clamped = isNaN(n) ? 0
      : min !== undefined && n < min ? min
      : max !== undefined && n > max ? max
      : n;
    setLocal(String(clamped));
    onChange(clamped / 100);
    setFocused(false);
  }

  return (
    <label className={cn(labelCls, className)}>
      <span className={labelTitleCls}>{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="text"
          inputMode="decimal"
          value={focused ? local : toDisplay(value)}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          className={inputCls}
        />
        <span className={unitCls}>%</span>
      </div>
      {hint && <span className={hintCls}>{hint}</span>}
    </label>
  );
}

// ── 셀렉트 ───────────────────────────────────────────────────────────────────
type SelectProps<V extends string> = {
  label: string;
  value: V;
  onChange: (v: V) => void;
  options: { value: V; label: string }[];
};

export function SelectField<V extends string>({ label, value, onChange, options }: SelectProps<V>) {
  return (
    <label className={labelCls}>
      <span className={labelTitleCls}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as V)}
        className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 outline-none focus:border-neutral-900"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// ── 토글 ─────────────────────────────────────────────────────────────────────
export function ToggleField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4"
      />
      {label}
    </label>
  );
}
