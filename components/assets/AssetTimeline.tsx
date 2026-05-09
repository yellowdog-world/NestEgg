"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from "recharts";
import { fmtKRWShort } from "@/lib/utils/format";

type Point = { date: string; total: number; cost: number };

function shortDate(d: string) {
  // "2026-05-08" → "26.05"
  return d.slice(2, 4) + "." + d.slice(5, 7);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const total = payload.find((p: { dataKey: string }) => p.dataKey === "total")?.value as number | undefined;
  const cost = payload.find((p: { dataKey: string }) => p.dataKey === "cost")?.value as number | undefined;
  const gain = total != null && cost != null ? total - cost : null;
  const gainPct = gain != null && cost && cost > 0 ? (gain / cost) * 100 : null;

  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 shadow-lg text-xs">
      <p className="mb-1.5 font-medium text-neutral-500">{label}</p>
      {total != null && (
        <p className="flex items-center justify-between gap-4">
          <span className="text-amber-500">● 평가금액</span>
          <span className="font-semibold tabular-nums">{fmtKRWShort(total)}</span>
        </p>
      )}
      {cost != null && cost > 0 && (
        <p className="flex items-center justify-between gap-4">
          <span className="text-neutral-400">– 투자원금</span>
          <span className="tabular-nums">{fmtKRWShort(cost)}</span>
        </p>
      )}
      {gain != null && cost != null && cost > 0 && (
        <p className={`flex items-center justify-between gap-4 mt-1 pt-1 border-t border-neutral-100 font-medium ${gain >= 0 ? "text-red-500" : "text-blue-500"}`}>
          <span>수익</span>
          <span className="tabular-nums">
            {gain >= 0 ? "+" : ""}{fmtKRWShort(gain)}
            {gainPct != null && ` (${gainPct >= 0 ? "+" : ""}${gainPct.toFixed(1)}%)`}
          </span>
        </p>
      )}
    </div>
  );
}

export function AssetTimeline({ data }: { data: Point[] }) {
  const hasCost = data.some((d) => d.cost > 0);

  // Y축 범위 — 두 라인 모두 포함
  const allValues = data.flatMap((d) =>
    hasCost ? [d.total, d.cost] : [d.total],
  ).filter((v) => v > 0);
  const minVal = allValues.length ? Math.min(...allValues) * 0.92 : 0;
  const maxVal = allValues.length ? Math.max(...allValues) * 1.05 : 1;

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v) => fmtKRWShort(Number(v))}
            width={72}
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
            domain={[minVal, maxVal]}
          />
          <Tooltip content={<CustomTooltip />} />
          {hasCost && (
            <Legend
              iconType="plainline"
              iconSize={16}
              formatter={(value) => (
                <span style={{ fontSize: 11, color: "#6b7280" }}>
                  {value === "total" ? "평가금액" : "투자원금"}
                </span>
              )}
            />
          )}
          {hasCost && (
            <Line
              type="monotone"
              dataKey="cost"
              name="cost"
              stroke="#d1d5db"
              strokeWidth={1.5}
              strokeDasharray="5 3"
              dot={false}
              activeDot={{ r: 3 }}
            />
          )}
          <Line
            type="monotone"
            dataKey="total"
            name="total"
            stroke="#f59e0b"
            strokeWidth={2.5}
            dot={{ r: 3, fill: "#f59e0b", strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
