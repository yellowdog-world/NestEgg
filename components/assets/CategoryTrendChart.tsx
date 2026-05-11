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
