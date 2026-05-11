"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { createClient } from "@/lib/supabase/client";
import { fmtKRWShort } from "@/lib/utils/format";

// ── 타입 ─────────────────────────────────────────────────────────────────────

type Snapshot = {
  snapshot_date: string;
  total_krw: number;
  cost_basis_krw: number | null;
};

type PnLPoint = {
  date: string;            // "5/8"
  fullDate: string;        // "2026-05-08"
  dailyPnl: number;        // 당일 수익
  monthlyCum: number;      // 월간 누적
  annualCum: number;       // 연간 누적
  totalKrw: number;        // 당일 평가금액
};

type Period = "1M" | "3M" | "6M" | "1Y" | "ALL";
const PERIOD_LABELS: { key: Period; label: string }[] = [
  { key: "1M", label: "1달" },
  { key: "3M", label: "3달" },
  { key: "6M", label: "6달" },
  { key: "1Y", label: "1년" },
  { key: "ALL", label: "전체" },
];

// ── 날짜 포맷 ─────────────────────────────────────────────────────────────────

function shortDate(d: string) {
  const [, m, day] = d.split("-");
  return `${parseInt(m)}/${parseInt(day)}`;
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as PnLPoint;
  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2.5 shadow-lg text-sm min-w-[180px]">
      <p className="mb-2 font-medium text-neutral-500">{label}</p>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-neutral-500">평가금액</span>
          <span className="font-semibold tabular-nums">{fmtKRWShort(d.totalKrw)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-neutral-500">일간 수익</span>
          <span className={`font-semibold tabular-nums ${d.dailyPnl >= 0 ? "text-emerald-600" : "text-red-500"}`}>
            {d.dailyPnl >= 0 ? "+" : ""}{fmtKRWShort(d.dailyPnl)}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-neutral-500">월 누적</span>
          <span className={`font-semibold tabular-nums ${d.monthlyCum >= 0 ? "text-emerald-600" : "text-red-500"}`}>
            {d.monthlyCum >= 0 ? "+" : ""}{fmtKRWShort(d.monthlyCum)}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-neutral-500">연 누적</span>
          <span className={`font-semibold tabular-nums ${d.annualCum >= 0 ? "text-emerald-600" : "text-red-500"}`}>
            {d.annualCum >= 0 ? "+" : ""}{fmtKRWShort(d.annualCum)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── P&L 데이터 계산 ───────────────────────────────────────────────────────────

function computePnLPoints(snapshots: Snapshot[]): PnLPoint[] {
  if (snapshots.length < 2) return [];

  const points: PnLPoint[] = [];

  // 월·연 시작 기준을 추적
  let monthStart = snapshots[0].total_krw;
  let yearStart = snapshots[0].total_krw;
  let currentMonth = snapshots[0].snapshot_date.slice(0, 7); // "2026-05"
  let currentYear = snapshots[0].snapshot_date.slice(0, 4);  // "2026"

  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1];
    const cur = snapshots[i];

    const month = cur.snapshot_date.slice(0, 7);
    const year = cur.snapshot_date.slice(0, 4);

    // 월이 바뀌면 월 누적 리셋
    if (month !== currentMonth) {
      monthStart = prev.total_krw;
      currentMonth = month;
    }
    // 연이 바뀌면 연 누적 리셋
    if (year !== currentYear) {
      yearStart = prev.total_krw;
      currentYear = year;
    }

    const dailyPnl = cur.total_krw - prev.total_krw;
    const monthlyCum = cur.total_krw - monthStart;
    const annualCum = cur.total_krw - yearStart;

    points.push({
      date: shortDate(cur.snapshot_date),
      fullDate: cur.snapshot_date,
      dailyPnl,
      monthlyCum,
      annualCum,
      totalKrw: cur.total_krw,
    });
  }

  return points;
}

// ── 요약 카드 ─────────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: number;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-3 py-3">
      <p className="text-xs text-neutral-400">{label}</p>
      <p className={`mt-1 text-base font-bold tabular-nums ${value >= 0 ? "text-emerald-600" : "text-red-500"}`}>
        {value >= 0 ? "+" : ""}{fmtKRWShort(value)}
      </p>
      {sub && <p className="text-xs text-neutral-400">{sub}</p>}
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export function PerformanceContent({ goalId }: { goalId: string }) {
  const supabase = createClient();
  const [goalName, setGoalName] = useState("");
  const [goalColor, setGoalColor] = useState("#6366f1");
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [period, setPeriod] = useState<Period>("3M");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);

      // 목표 이름
      const { data: g } = await supabase
        .from("investment_goals")
        .select("name, color")
        .eq("id", goalId)
        .single();
      if (g) { setGoalName(g.name); setGoalColor(g.color); }

      // 전체 스냅샷 (최대 2년)
      const since = new Date();
      since.setFullYear(since.getFullYear() - 2);
      const { data: snaps } = await supabase
        .from("goal_daily_snapshots")
        .select("snapshot_date, total_krw, cost_basis_krw")
        .eq("goal_id", goalId)
        .gte("snapshot_date", since.toISOString().slice(0, 10))
        .order("snapshot_date");
      setSnapshots(snaps ?? []);

      setLoading(false);
    })();
  }, [goalId]);

  // 기간 필터링
  const filteredSnapshots = useMemo(() => {
    const days: Record<Period, number | null> = {
      "1M": 30, "3M": 90, "6M": 180, "1Y": 365, ALL: null,
    };
    const d = days[period];
    if (!d) return snapshots;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - d);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    // P&L 계산을 위해 1일 전 데이터도 포함
    const idx = snapshots.findIndex((s) => s.snapshot_date >= cutoffStr);
    return idx > 0 ? snapshots.slice(idx - 1) : snapshots;
  }, [snapshots, period]);

  const pnlPoints = useMemo(() => computePnLPoints(filteredSnapshots), [filteredSnapshots]);

  // 요약 수치
  const latestSnap = snapshots[snapshots.length - 1];
  const thisYearStart = snapshots.find(
    (s) => s.snapshot_date.startsWith(new Date().getFullYear().toString()),
  );
  const thisMonthStart = [...snapshots].reverse().find(
    (s) => s.snapshot_date.slice(0, 7) < (latestSnap?.snapshot_date.slice(0, 7) ?? ""),
  );

  const ytdPnl = latestSnap && thisYearStart
    ? latestSnap.total_krw - thisYearStart.total_krw
    : null;
  const mtdPnl = latestSnap && thisMonthStart
    ? latestSnap.total_krw - thisMonthStart.total_krw
    : null;
  const unrealizedPnl =
    latestSnap?.cost_basis_krw !== null && latestSnap
      ? latestSnap.total_krw - (latestSnap.cost_basis_krw ?? latestSnap.total_krw)
      : null;

  // 차트 색상
  const positiveColor = "#10b981";
  const negativeColor = "#ef4444";

  // bar color per point
  const getBarColor = (value: number) => (value >= 0 ? positiveColor : negativeColor);

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center text-neutral-400">불러오는 중...</div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* 뒤로가기 */}
      <Link
        href={`/assets/goals/${goalId}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800"
      >
        <ArrowLeft className="h-4 w-4" /> {goalName || "목표 상세"}
      </Link>

      <h1 className="mb-1 text-xl font-bold text-neutral-900">월간 투자성과</h1>
      <p className="mb-4 text-sm text-neutral-500">{goalName}</p>

      {/* 요약 카드 */}
      {latestSnap && (
        <div className="mb-5 grid grid-cols-3 gap-2">
          {ytdPnl !== null && <SummaryCard label="연초 대비" value={ytdPnl} />}
          {mtdPnl !== null && <SummaryCard label="월초 대비" value={mtdPnl} />}
          {unrealizedPnl !== null && <SummaryCard label="미실현 손익" value={unrealizedPnl} />}
        </div>
      )}

      {/* 기간 탭 */}
      <div className="mb-3 flex gap-1 overflow-x-auto">
        {PERIOD_LABELS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setPeriod(key)}
            className={`shrink-0 rounded-full px-3 py-1 text-sm transition-colors ${
              period === key
                ? "bg-neutral-900 font-semibold text-white"
                : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* P&L 차트 */}
      {pnlPoints.length < 2 ? (
        <div className="flex h-56 items-center justify-center rounded-xl border border-neutral-100 bg-white text-sm text-neutral-400">
          데이터가 2일 이상 쌓이면 차트가 표시돼요
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          {/* 일간 수익 (막대) */}
          <p className="mb-2 text-xs font-semibold text-neutral-500">일간 수익</p>
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={pnlPoints} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis
                  dataKey="date"
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
                <Bar
                  dataKey="dailyPnl"
                  name="일간 수익"
                  radius={[2, 2, 0, 0]}
                  // recharts Cell per bar
                  fill={goalColor}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* 누적 손익 (라인) */}
          <p className="mb-2 mt-5 text-xs font-semibold text-neutral-500">누적 손익</p>
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={pnlPoints} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis
                  dataKey="date"
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
                <Legend
                  wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
                  formatter={(value) => value === "monthlyCum" ? "월 누적" : "연 누적"}
                />
                <Line
                  type="monotone"
                  dataKey="monthlyCum"
                  name="monthlyCum"
                  stroke={goalColor}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
                <Line
                  type="monotone"
                  dataKey="annualCum"
                  name="annualCum"
                  stroke="#9ca3af"
                  strokeWidth={1.5}
                  strokeDasharray="4 2"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
