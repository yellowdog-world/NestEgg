"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useMemo } from "react";
import {
  ALL_CATEGORIES,
  CATEGORY_META,
  type AssetCategory,
  type CategoryBreakdown,
} from "@/lib/market/asset-category";
import { fmtKRWShort } from "@/lib/utils/format";

// ── 타입 ─────────────────────────────────────────────────────────────────────

export type CategoryPoint = {
  date: string; // "2026-05-01"
} & CategoryBreakdown;

// ── 날짜 포맷 ─────────────────────────────────────────────────────────────────

function shortDate(d: string) {
  // "2026-05-08" → "5/8"
  const [, m, day] = d.split("-");
  return `${parseInt(m)}/${parseInt(day)}`;
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  const total = (payload as { value: number }[]).reduce((s, p) => s + (p.value ?? 0), 0);

  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2.5 shadow-lg text-sm min-w-[180px]">
      <p className="mb-2 font-medium text-neutral-500">{label}</p>
      <p className="mb-1.5 flex items-center justify-between gap-4 border-b border-neutral-100 pb-1.5">
        <span className="text-neutral-700 font-semibold">합계</span>
        <span className="font-bold tabular-nums text-neutral-900">{fmtKRWShort(total)}</span>
      </p>
      {[...payload].reverse().map((p: { name: AssetCategory; value: number; fill: string }) => {
        const meta = CATEGORY_META[p.name as AssetCategory];
        if (!p.value) return null;
        const pct = total > 0 ? ((p.value / total) * 100).toFixed(1) : "0.0";
        return (
          <p key={p.name} className="flex items-center justify-between gap-3 py-0.5">
            <span className="flex items-center gap-1.5 text-neutral-600">
              <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ background: meta?.color }} />
              {meta?.label ?? p.name}
            </span>
            <span className="tabular-nums text-neutral-700">
              {fmtKRWShort(p.value)}
              <span className="ml-1 text-neutral-400">({pct}%)</span>
            </span>
          </p>
        );
      })}
    </div>
  );
}

// ── 스택 영역 차트 ─────────────────────────────────────────────────────────────

export function CategoryTrendChart({ data }: { data: CategoryPoint[] }) {
  if (!data.length) {
    return (
      <div className="flex h-56 items-center justify-center text-base text-neutral-400">
        데이터가 없어요
      </div>
    );
  }

  // 실제로 값이 있는 카테고리만 렌더링
  const activeCategories = ALL_CATEGORIES.filter((cat) =>
    data.some((d) => (d[cat] ?? 0) > 0),
  );

  return (
    <div className="h-56 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            {activeCategories.map((cat) => (
              <linearGradient key={cat} id={`grad-${cat}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={CATEGORY_META[cat].color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={CATEGORY_META[cat].color} stopOpacity={0.05} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={(v) => fmtKRWShort(Number(v))}
            width={60}
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          {activeCategories.map((cat) => (
            <Area
              key={cat}
              type="monotone"
              dataKey={cat}
              name={cat}
              stackId="1"
              stroke={CATEGORY_META[cat].color}
              strokeWidth={1.5}
              fill={`url(#grad-${cat})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── 오늘 현황 가로 막대 ────────────────────────────────────────────────────────

export function CategoryBarToday({
  breakdown,
  totalKrw,
}: {
  breakdown: CategoryBreakdown;
  totalKrw: number;
}) {
  const items = ALL_CATEGORIES.map((cat) => ({
    cat,
    amount: breakdown[cat] ?? 0,
    meta: CATEGORY_META[cat],
  })).filter((i) => i.amount > 0);

  if (!items.length) return null;

  return (
    <div className="space-y-2">
      {/* 전체 비중 바 */}
      <div className="flex h-3 w-full overflow-hidden rounded-full">
        {items.map(({ cat, amount, meta }) => (
          <div
            key={cat}
            style={{
              width: `${(amount / totalKrw) * 100}%`,
              background: meta.color,
            }}
            title={`${meta.label}: ${fmtKRWShort(amount)}`}
          />
        ))}
      </div>

      {/* 항목별 행 */}
      <div className="space-y-1.5">
        {items.map(({ cat, amount, meta }) => {
          const pct = totalKrw > 0 ? (amount / totalKrw) * 100 : 0;
          return (
            <div key={cat} className="flex items-center gap-2">
              {/* 색상 도트 + 이름 */}
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: meta.color }}
              />
              <span className="w-20 shrink-0 text-sm text-neutral-600">{meta.label}</span>
              {/* 바 */}
              <div className="flex-1 min-w-0">
                <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className="h-1.5 rounded-full"
                    style={{ width: `${pct}%`, background: meta.color }}
                  />
                </div>
              </div>
              {/* 비중 + 금액 */}
              <span className="w-10 shrink-0 text-right text-sm tabular-nums text-neutral-500">
                {pct.toFixed(1)}%
              </span>
              <span className="w-20 shrink-0 text-right text-sm font-medium tabular-nums text-neutral-800">
                {fmtKRWShort(amount)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// GenericStackedChart — 카테고리 외 임의 key 집합에 대한 스택 영역 차트
// ══════════════════════════════════════════════════════════════════════════════

export type SeriesMeta = { key: string; label: string; color: string };

/** 동적 key를 가진 일별 포인트 */
export type GenericPoint = { date: string } & Record<string, string | number>;

// 증권사·계좌유형 차트에 쓸 고정 색상 팔레트
const PALETTE = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444",
  "#8b5cf6", "#3b82f6", "#ec4899", "#14b8a6",
  "#f97316", "#84cc16", "#06b6d4", "#a78bfa",
];

// 계좌 유형 고정 색상 (항상 같은 색으로)
export const ACCOUNT_TYPE_COLOR: Record<string, string> = {
  pension_fund: "#7c3aed",
  isa:          "#2563eb",
  irp:          "#4f46e5",
  regular:      "#6b7280",
  corp:         "#ea580c",
  bank:         "#16a34a",
  overseas:     "#0284c7",
};

export const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  pension_fund: "연저펀",
  isa:          "ISA",
  irp:          "IRP",
  regular:      "일반계좌",
  corp:         "법인",
  bank:         "은행",
  overseas:     "해외증권",
};

/** key 배열 → SeriesMeta 배열 (색상 자동 할당) */
export function buildSeries(
  keys: string[],
  colorOverride?: Record<string, string>,
  labelOverride?: Record<string, string>,
): SeriesMeta[] {
  return keys.map((key, i) => ({
    key,
    label: labelOverride?.[key] ?? key,
    color: colorOverride?.[key] ?? PALETTE[i % PALETTE.length],
  }));
}

// ── Generic Tooltip ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function GenericTooltip({ active, payload, label, series }: any) {
  if (!active || !payload?.length) return null;
  const total = (payload as { value: number }[]).reduce((s, p) => s + (p.value ?? 0), 0);
  const seriesMap = new Map<string, SeriesMeta>((series as SeriesMeta[]).map((s: SeriesMeta) => [s.key, s]));

  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2.5 shadow-lg text-sm min-w-[180px]">
      <p className="mb-2 font-medium text-neutral-500">{label}</p>
      <p className="mb-1.5 flex items-center justify-between gap-4 border-b border-neutral-100 pb-1.5">
        <span className="font-semibold text-neutral-700">합계</span>
        <span className="font-bold tabular-nums text-neutral-900">{fmtKRWShort(total)}</span>
      </p>
      {[...payload].reverse().map((p: { name: string; value: number }) => {
        const meta = seriesMap.get(p.name);
        if (!p.value || !meta) return null;
        const pct = total > 0 ? ((p.value / total) * 100).toFixed(1) : "0.0";
        return (
          <p key={p.name} className="flex items-center justify-between gap-3 py-0.5">
            <span className="flex items-center gap-1.5 text-neutral-600">
              <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ background: meta.color }} />
              {meta.label}
            </span>
            <span className="tabular-nums text-neutral-700">
              {fmtKRWShort(p.value)}
              <span className="ml-1 text-neutral-400">({pct}%)</span>
            </span>
          </p>
        );
      })}
    </div>
  );
}

// ── 스택 영역 차트 ─────────────────────────────────────────────────────────────

export function GenericStackedChart({
  data,
  series,
}: {
  data: GenericPoint[];
  series: SeriesMeta[];
}) {
  const activeSeries = useMemo(
    () => series.filter((s) => data.some((d) => Number(d[s.key] ?? 0) > 0)),
    [data, series],
  );

  if (!data.length || !activeSeries.length) {
    return (
      <div className="flex h-56 items-center justify-center text-base text-neutral-400">
        데이터가 없어요
      </div>
    );
  }

  return (
    <div className="h-56 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            {activeSeries.map((s) => (
              <linearGradient key={s.key} id={`ggrad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={s.color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={s.color} stopOpacity={0.05} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(d: string) => {
              const [, m, day] = d.split("-");
              return `${parseInt(m)}/${parseInt(day)}`;
            }}
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={(v) => fmtKRWShort(Number(v))}
            width={60}
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<GenericTooltip series={activeSeries} />} />
          {activeSeries.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.key}
              stackId="1"
              stroke={s.color}
              strokeWidth={1.5}
              fill={`url(#ggrad-${s.key})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── 범례 바 (오늘 현황) ────────────────────────────────────────────────────────

export function GenericBarToday({
  breakdown,
  series,
  totalKrw,
}: {
  breakdown: Record<string, number>;
  series: SeriesMeta[];
  totalKrw: number;
}) {
  const items = series
    .map((s) => ({ ...s, amount: breakdown[s.key] ?? 0 }))
    .filter((i) => i.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  if (!items.length) return <p className="text-sm text-neutral-400">데이터 없음</p>;

  return (
    <div className="space-y-2">
      <div className="flex h-3 w-full overflow-hidden rounded-full">
        {items.map((item) => (
          <div
            key={item.key}
            style={{ width: `${(item.amount / totalKrw) * 100}%`, background: item.color }}
            title={`${item.label}: ${fmtKRWShort(item.amount)}`}
          />
        ))}
      </div>
      <div className="space-y-1.5">
        {items.map((item) => {
          const pct = totalKrw > 0 ? (item.amount / totalKrw) * 100 : 0;
          return (
            <div key={item.key} className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: item.color }} />
              <span className="w-24 shrink-0 truncate text-sm text-neutral-600">{item.label}</span>
              <div className="flex-1 min-w-0">
                <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
                  <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: item.color }} />
                </div>
              </div>
              <span className="w-10 shrink-0 text-right text-sm tabular-nums text-neutral-500">{pct.toFixed(1)}%</span>
              <span className="w-20 shrink-0 text-right text-sm font-medium tabular-nums text-neutral-800">{fmtKRWShort(item.amount)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
