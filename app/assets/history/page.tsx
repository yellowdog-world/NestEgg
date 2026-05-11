"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { fmtKRWShort } from "@/lib/utils/format";
import { AssetTimeline } from "@/components/assets/AssetTimeline";
import {
  CategoryTrendChart,
  CategoryBarToday,
  type CategoryPoint,
} from "@/components/assets/CategoryTrendChart";
import {
  aggregateByCategory,
  type CategoryBreakdown,
  emptyCategoryBreakdown,
} from "@/lib/market/asset-category";

// ── 타입 ─────────────────────────────────────────────────────────────────────

type DailyRow = {
  snapshot_date: string;
  total_krw: number;
  breakdown: {
    accounts: {
      holdings: {
        raw_name: string;
        ticker: string | null;
        market: string | null;
        eval_krw: number;
      }[];
    }[];
    category_breakdown?: CategoryBreakdown;
  } | null;
};

type Period = "1W" | "1M" | "3M" | "6M" | "1Y" | "ALL";

// ── 기간 필터 ─────────────────────────────────────────────────────────────────

const PERIOD_LABELS: { key: Period; label: string }[] = [
  { key: "1W", label: "1주" },
  { key: "1M", label: "1달" },
  { key: "3M", label: "3달" },
  { key: "6M", label: "6달" },
  { key: "1Y", label: "1년" },
  { key: "ALL", label: "전체" },
];

function cutoffDate(period: Period): string | null {
  const now = new Date();
  const days: Record<Period, number | null> = {
    "1W": 7,
    "1M": 30,
    "3M": 90,
    "6M": 180,
    "1Y": 365,
    ALL: null,
  };
  const d = days[period];
  if (d === null) return null;
  const dt = new Date(now);
  dt.setDate(dt.getDate() - d);
  return dt.toISOString().slice(0, 10);
}

// ── 변동 카드 ─────────────────────────────────────────────────────────────────

function DeltaCard({
  label,
  current,
  base,
}: {
  label: string;
  current: number;
  base: number | null;
}) {
  if (base === null || base === 0) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white px-3 py-3">
        <p className="text-xs text-neutral-400">{label}</p>
        <p className="mt-1 text-base font-medium text-neutral-300">—</p>
      </div>
    );
  }
  const delta = current - base;
  const pct = (delta / base) * 100;
  const isPos = delta >= 0;
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-3 py-3">
      <p className="text-xs text-neutral-400">{label}</p>
      <p
        className={`mt-0.5 text-sm font-bold tabular-nums ${
          isPos ? "text-red-500" : "text-blue-500"
        }`}
      >
        {isPos ? "+" : ""}
        {fmtKRWShort(delta)}
      </p>
      <p className={`text-xs tabular-nums ${isPos ? "text-red-400" : "text-blue-400"}`}>
        ({isPos ? "+" : ""}
        {pct.toFixed(2)}%)
      </p>
    </div>
  );
}

// ── 메인 페이지 ───────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const [rows, setRows] = useState<DailyRow[]>([]);
  const [period, setPeriod] = useState<Period>("3M");
  const [view, setView] = useState<"total" | "category">("total");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from("portfolio_daily_snapshots")
        .select("snapshot_date, total_krw, breakdown")
        .order("snapshot_date", { ascending: true });
      setRows((data as DailyRow[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  // 기간 필터링
  const filtered = useMemo(() => {
    const cut = cutoffDate(period);
    return cut ? rows.filter((r) => r.snapshot_date >= cut) : rows;
  }, [rows, period]);

  // AssetTimeline 포인트
  const timelineData = useMemo(
    () => filtered.map((r) => ({ date: r.snapshot_date, total: r.total_krw, cost: 0 })),
    [filtered],
  );

  // CategoryTrendChart 포인트
  const categoryData = useMemo((): CategoryPoint[] => {
    return filtered.map((r) => {
      const catBreak: CategoryBreakdown =
        r.breakdown?.category_breakdown ??
        aggregateByCategory(
          (r.breakdown?.accounts ?? []).flatMap((a) => a.holdings),
        );
      return { date: r.snapshot_date, ...catBreak };
    });
  }, [filtered]);

  // 최신 데이터
  const latestRow = rows[rows.length - 1];
  const todayTotal = latestRow?.total_krw ?? 0;

  const todayBreakdown: CategoryBreakdown = useMemo(() => {
    if (!latestRow?.breakdown) return emptyCategoryBreakdown();
    return (
      latestRow.breakdown.category_breakdown ??
      aggregateByCategory(
        (latestRow.breakdown.accounts ?? []).flatMap((a) => a.holdings),
      )
    );
  }, [latestRow]);

  // 기간별 비교 기준
  function baseTotal(days: number): number | null {
    const dt = new Date();
    dt.setDate(dt.getDate() - days);
    const cutStr = dt.toISOString().slice(0, 10);
    const prev = [...rows].reverse().find((r) => r.snapshot_date <= cutStr);
    return prev?.total_krw ?? null;
  }

  const yearStart = `${new Date().getFullYear()}-01-01`;
  const ytdBase = rows.find((r) => r.snapshot_date >= yearStart)?.total_krw ?? null;

  // ── 로딩 / 빈 상태 ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Header />
        <div className="flex h-40 items-center justify-center text-neutral-400">
          불러오는 중…
        </div>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="flex flex-col gap-4">
        <Header />
        <div className="rounded-xl border border-neutral-200 bg-white px-6 py-12 text-center">
          <p className="text-base text-neutral-500">아직 일별 스냅샷 데이터가 없어요.</p>
          <p className="mt-1 text-sm text-neutral-400">매일 07:00 자동 저장됩니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* 헤더 */}
      <header>
        <Link href="/assets" className="text-base text-neutral-600 hover:text-neutral-900">
          ← 자산
        </Link>
        <div className="mt-1 flex items-end justify-between gap-2">
          <h1 className="text-3xl font-bold tracking-tight">자산 추이</h1>
          {latestRow && (
            <p className="text-sm text-neutral-400">{latestRow.snapshot_date} 기준</p>
          )}
        </div>
      </header>

      {/* 변동 카드 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <DeltaCard label="어제 대비" current={todayTotal} base={baseTotal(1)} />
        <DeltaCard label="1주 대비" current={todayTotal} base={baseTotal(7)} />
        <DeltaCard label="1달 대비" current={todayTotal} base={baseTotal(30)} />
        <DeltaCard label="연초 대비" current={todayTotal} base={ytdBase} />
      </div>

      {/* 차트 */}
      <div className="rounded-xl border border-neutral-200 bg-white px-4 py-4 sm:px-5">
        {/* 기간 탭 + 뷰 토글 */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1">
            {PERIOD_LABELS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setPeriod(key)}
                className={`rounded-md px-2.5 py-1 text-sm font-medium transition-colors ${
                  period === key
                    ? "bg-neutral-900 text-white"
                    : "text-neutral-500 hover:bg-neutral-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg border border-neutral-200 p-0.5">
            <button
              onClick={() => setView("total")}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                view === "total"
                  ? "bg-neutral-100 text-neutral-900"
                  : "text-neutral-400 hover:text-neutral-700"
              }`}
            >
              총 자산
            </button>
            <button
              onClick={() => setView("category")}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                view === "category"
                  ? "bg-neutral-100 text-neutral-900"
                  : "text-neutral-400 hover:text-neutral-700"
              }`}
            >
              카테고리별
            </button>
          </div>
        </div>

        {view === "total" ? (
          <AssetTimeline data={timelineData} />
        ) : (
          <CategoryTrendChart data={categoryData} />
        )}
      </div>

      {/* 전략별 현황 */}
      <div className="rounded-xl border border-neutral-200 bg-white px-4 py-4 sm:px-5">
        <h2 className="mb-3 text-lg font-semibold">
          전략별 현황
          {latestRow && (
            <span className="ml-2 text-sm font-normal text-neutral-400">
              {latestRow.snapshot_date} 기준
            </span>
          )}
        </h2>
        <CategoryBarToday breakdown={todayBreakdown} totalKrw={todayTotal} />
      </div>
    </div>
  );
}

function Header() {
  return (
    <header>
      <Link href="/assets" className="text-base text-neutral-600 hover:text-neutral-900">
        ← 자산
      </Link>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">자산 추이</h1>
    </header>
  );
}
