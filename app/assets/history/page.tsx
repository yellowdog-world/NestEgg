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

type HoldingDetail = {
  raw_name: string;
  ticker: string | null;
  market: string | null;
  currency: string;
  eval_krw: number;
};

type DailyRow = {
  snapshot_date: string;
  total_krw: number;
  breakdown: {
    accounts: { type: string; total_krw: number; holdings: HoldingDetail[] }[];
    category_breakdown?: CategoryBreakdown;
    usd_total_krw?: number;
  } | null;
};

type DividendRow = {
  received_at: string; // "YYYY-MM-DD"
  amount_krw: number;
};

type Period = "1W" | "1M" | "3M" | "6M" | "1Y" | "ALL";

const PERIOD_LABELS: { key: Period; label: string }[] = [
  { key: "1W", label: "1주" },
  { key: "1M", label: "1달" },
  { key: "3M", label: "3달" },
  { key: "6M", label: "6달" },
  { key: "1Y", label: "1년" },
  { key: "ALL", label: "전체" },
];

function cutoffDate(period: Period): string | null {
  const days: Record<Period, number | null> = {
    "1W": 7, "1M": 30, "3M": 90, "6M": 180, "1Y": 365, ALL: null,
  };
  const d = days[period];
  if (d === null) return null;
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  return dt.toISOString().slice(0, 10);
}

// ── 변동 카드 ─────────────────────────────────────────────────────────────────

function DeltaCard({ label, current, base }: { label: string; current: number; base: number | null }) {
  if (base === null || base === 0) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white px-3 py-3">
        <p className="text-xs text-neutral-400">{label}</p>
        <p className="mt-1 text-sm text-neutral-300">—</p>
      </div>
    );
  }
  const delta = current - base;
  const pct = (delta / base) * 100;
  const isPos = delta >= 0;
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-3 py-3">
      <p className="text-xs text-neutral-400">{label}</p>
      <p className={`mt-0.5 text-sm font-bold tabular-nums ${isPos ? "text-red-500" : "text-blue-500"}`}>
        {isPos ? "+" : ""}{fmtKRWShort(delta)}
      </p>
      <p className={`text-xs tabular-nums ${isPos ? "text-red-400" : "text-blue-400"}`}>
        ({isPos ? "+" : ""}{pct.toFixed(2)}%)
      </p>
    </div>
  );
}

// ── 지표 카드 ─────────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3.5">
      <p className="text-sm text-neutral-500">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${color ?? "text-neutral-800"}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-neutral-400">{sub}</p>}
    </div>
  );
}

// ── 메인 ─────────────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const [rows, setRows] = useState<DailyRow[]>([]);
  const [dividends, setDividends] = useState<DividendRow[]>([]);
  const [period, setPeriod] = useState<Period>("3M");
  const [view, setView] = useState<"total" | "category">("total");
  const [loading, setLoading] = useState(true);
  const [fireTarget, setFireTarget] = useState<number>(0);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const [{ data: snap }, { data: divs }] = await Promise.all([
        supabase
          .from("portfolio_daily_snapshots")
          .select("snapshot_date, total_krw, breakdown")
          .order("snapshot_date", { ascending: true }),
        supabase
          .from("dividends")
          .select("received_at, amount_krw")
          .gte("received_at", oneYearAgo.toISOString().slice(0, 10))
          .order("received_at", { ascending: true }),
      ]);

      setRows((snap as DailyRow[]) ?? []);
      setDividends((divs as DividendRow[]) ?? []);
      setLoading(false);
    }
    load();

    // FIRE 달성률: localStorage의 은퇴 프로필에서 계산
    try {
      const raw = localStorage.getItem("retirement-profile");
      if (raw) {
        const profile = JSON.parse(raw) as { monthlyBudget?: number };
        if (profile.monthlyBudget) {
          setFireTarget(Math.round((profile.monthlyBudget * 12) / 0.04));
        }
      }
    } catch { /* ignore */ }
  }, []);

  // 기간 필터
  const filtered = useMemo(() => {
    const cut = cutoffDate(period);
    return cut ? rows.filter((r) => r.snapshot_date >= cut) : rows;
  }, [rows, period]);

  // 차트 데이터
  const timelineData = useMemo(
    () => filtered.map((r) => ({ date: r.snapshot_date, total: r.total_krw, cost: 0 })),
    [filtered],
  );
  const categoryData = useMemo((): CategoryPoint[] =>
    filtered.map((r) => {
      const cb: CategoryBreakdown =
        r.breakdown?.category_breakdown ??
        aggregateByCategory((r.breakdown?.accounts ?? []).flatMap((a) => a.holdings));
      return { date: r.snapshot_date, ...cb };
    }),
    [filtered],
  );

  // 최신 데이터
  const latestRow = rows[rows.length - 1];
  const todayTotal = latestRow?.total_krw ?? 0;

  const todayBreakdown = useMemo((): CategoryBreakdown => {
    if (!latestRow?.breakdown) return emptyCategoryBreakdown();
    return (
      latestRow.breakdown.category_breakdown ??
      aggregateByCategory((latestRow.breakdown.accounts ?? []).flatMap((a) => a.holdings))
    );
  }, [latestRow]);

  // 변동 기준 계산
  function baseTotal(days: number): number | null {
    const dt = new Date();
    dt.setDate(dt.getDate() - days);
    const cutStr = dt.toISOString().slice(0, 10);
    const prev = [...rows].reverse().find((r) => r.snapshot_date <= cutStr);
    return prev?.total_krw ?? null;
  }
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const ytdBase = (() => {
    const r = rows.find((r) => r.snapshot_date >= yearStart);
    // 오늘 것과 같은 날짜면 비교 의미 없음
    return r && r.snapshot_date < (latestRow?.snapshot_date ?? "") ? r.total_krw : null;
  })();

  // Drawdown (고점 대비 낙폭)
  const { drawdownPct, peakDate } = useMemo(() => {
    if (!rows.length) return { drawdownPct: 0, peakDate: "" };
    let peak = 0;
    let pDate = "";
    for (const r of rows) {
      if (r.total_krw > peak) { peak = r.total_krw; pDate = r.snapshot_date; }
    }
    const dd = peak > 0 ? ((todayTotal - peak) / peak) * 100 : 0;
    return { drawdownPct: dd, peakDate: pDate };
  }, [rows, todayTotal]);

  // 환 노출
  const usdTotalKrw = latestRow?.breakdown?.usd_total_krw ??
    (latestRow?.breakdown?.accounts ?? [])
      .flatMap((a) => a.holdings)
      .filter((h) => h.currency === "USD")
      .reduce((s, h) => s + h.eval_krw, 0);
  const usdPct = todayTotal > 0 ? (usdTotalKrw / todayTotal) * 100 : 0;

  // FIRE 달성률
  const firePct = fireTarget > 0 ? Math.min(100, (todayTotal / fireTarget) * 100) : null;

  // 배당 수익률
  const totalDivKrw = dividends.reduce((s, d) => s + Number(d.amount_krw), 0);
  const divYield = todayTotal > 0 && totalDivKrw > 0 ? (totalDivKrw / todayTotal) * 100 : null;

  // Top 5 보유 종목 (오늘 기준)
  const top5 = useMemo(() => {
    if (!latestRow?.breakdown) return [];
    const map = new Map<string, { name: string; eval_krw: number }>();
    for (const acc of latestRow.breakdown.accounts ?? []) {
      for (const h of acc.holdings) {
        const key = h.ticker ?? h.raw_name;
        const prev = map.get(key) ?? { name: h.raw_name, eval_krw: 0 };
        map.set(key, { ...prev, eval_krw: prev.eval_krw + h.eval_krw });
      }
    }
    return [...map.values()]
      .sort((a, b) => b.eval_krw - a.eval_krw)
      .slice(0, 5);
  }, [latestRow]);
  const top5Max = top5[0]?.eval_krw ?? 1;

  const hasEnoughData = rows.length >= 2;

  // ── 렌더 ────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader latestDate={null} />
        <div className="flex h-40 items-center justify-center text-neutral-400">불러오는 중…</div>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader latestDate={null} />
        <div className="rounded-xl border border-neutral-200 bg-white px-6 py-12 text-center">
          <p className="text-base text-neutral-500">아직 일별 스냅샷 데이터가 없어요.</p>
          <p className="mt-1 text-sm text-neutral-400">매일 07:00 자동 저장됩니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader latestDate={latestRow?.snapshot_date ?? null} />

      {/* ① 변동 카드 */}
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <DeltaCard label="어제 대비" current={todayTotal} base={baseTotal(1)} />
          <DeltaCard label="1주 대비"  current={todayTotal} base={baseTotal(7)} />
          <DeltaCard label="1달 대비"  current={todayTotal} base={baseTotal(30)} />
          <DeltaCard label="연초 대비" current={todayTotal} base={ytdBase} />
        </div>
        {!hasEnoughData && (
          <p className="text-center text-xs text-neutral-400">
            매일 07:00 수집됩니다 — 이틀 이상 쌓이면 변동이 표시돼요
          </p>
        )}
      </div>

      {/* ② 주요 지표 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCard
          label="고점 대비 낙폭"
          value={drawdownPct === 0 ? "고점" : `${drawdownPct.toFixed(2)}%`}
          sub={peakDate ? `고점 ${peakDate}` : undefined}
          color={drawdownPct < -5 ? "text-blue-600" : drawdownPct < 0 ? "text-blue-400" : "text-emerald-600"}
        />
        <MetricCard
          label="USD 직접 노출"
          value={`${usdPct.toFixed(1)}%`}
          sub={fmtKRWShort(usdTotalKrw)}
          color="text-neutral-800"
        />
        <MetricCard
          label="연간 배당 수익률"
          value={divYield !== null ? `${divYield.toFixed(2)}%` : "—"}
          sub={divYield !== null ? `${fmtKRWShort(totalDivKrw)} / 년` : "배당 내역 없음"}
          color={divYield !== null ? "text-amber-600" : "text-neutral-400"}
        />
        <MetricCard
          label="FIRE 달성률"
          value={firePct !== null ? `${firePct.toFixed(1)}%` : "—"}
          sub={firePct !== null ? `목표 ${fmtKRWShort(fireTarget)}` : "은퇴시뮬 설정 필요"}
          color={firePct !== null && firePct >= 100 ? "text-emerald-600" : "text-neutral-800"}
        />
      </div>

      {/* ③ FIRE 달성률 바 (설정된 경우만) */}
      {firePct !== null && (
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-neutral-600">FIRE 달성률</span>
            <span className={`text-base font-bold tabular-nums ${firePct >= 100 ? "text-emerald-600" : "text-neutral-800"}`}>
              {firePct.toFixed(1)}%
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-neutral-100">
            <div
              className={`h-2.5 rounded-full transition-all ${firePct >= 100 ? "bg-emerald-400" : firePct >= 80 ? "bg-amber-400" : "bg-indigo-400"}`}
              style={{ width: `${Math.min(100, firePct)}%` }}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-xs text-neutral-400">
            <span>현재 {fmtKRWShort(todayTotal)}</span>
            <span>목표 {fmtKRWShort(fireTarget)} (연 지출 × 25배)</span>
          </div>
        </div>
      )}

      {/* ④ 추이 차트 */}
      <div className="rounded-xl border border-neutral-200 bg-white px-4 py-4 sm:px-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1">
            {PERIOD_LABELS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setPeriod(key)}
                className={`rounded-md px-2.5 py-1 text-sm font-medium transition-colors ${
                  period === key ? "bg-neutral-900 text-white" : "text-neutral-500 hover:bg-neutral-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg border border-neutral-200 p-0.5">
            {(["total", "category"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                  view === v ? "bg-neutral-100 text-neutral-900" : "text-neutral-400 hover:text-neutral-700"
                }`}
              >
                {v === "total" ? "총 자산" : "카테고리별"}
              </button>
            ))}
          </div>
        </div>
        {view === "total" ? <AssetTimeline data={timelineData} /> : <CategoryTrendChart data={categoryData} />}
      </div>

      {/* ⑤ 전략별 현황 */}
      <div className="rounded-xl border border-neutral-200 bg-white px-4 py-4 sm:px-5">
        <h2 className="mb-3 text-lg font-semibold">
          전략별 현황
          <span className="ml-2 text-sm font-normal text-neutral-400">{latestRow?.snapshot_date} 기준</span>
        </h2>
        <CategoryBarToday breakdown={todayBreakdown} totalKrw={todayTotal} />
      </div>

      {/* ⑥ 환 노출 + Top 5 (2열) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

        {/* 환 노출 */}
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-4">
          <h2 className="mb-3 text-lg font-semibold">환 노출</h2>
          <div className="flex items-center justify-between text-sm text-neutral-600 mb-1.5">
            <span>USD 직접 보유 (해외직투)</span>
            <span className="font-semibold tabular-nums">{usdPct.toFixed(1)}%</span>
          </div>
          {/* USD vs KRW 바 */}
          <div className="flex h-3 w-full overflow-hidden rounded-full">
            <div className="bg-indigo-400 transition-all" style={{ width: `${usdPct}%` }} />
            <div className="bg-neutral-200 flex-1" />
          </div>
          <div className="mt-2 flex justify-between text-xs text-neutral-400">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-indigo-400" />
              USD {fmtKRWShort(usdTotalKrw)}
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-neutral-300" />
              KRW {fmtKRWShort(Math.max(0, todayTotal - usdTotalKrw))}
            </span>
          </div>
          <p className="mt-3 text-xs text-neutral-400">
            * KRX 상장 해외 ETF(KODEX·TIGER 등)는 원화 결제이므로 KRW로 집계됩니다
          </p>
        </div>

        {/* Top 5 종목 */}
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-4">
          <h2 className="mb-3 text-lg font-semibold">Top 5 보유 종목</h2>
          {top5.length === 0 ? (
            <p className="text-sm text-neutral-400">데이터가 없어요</p>
          ) : (
            <div className="space-y-2">
              {top5.map((item, i) => {
                const pct = todayTotal > 0 ? (item.eval_krw / todayTotal) * 100 : 0;
                const barPct = (item.eval_krw / top5Max) * 100;
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-4 shrink-0 text-center text-xs font-bold text-neutral-400">{i + 1}</span>
                    <span className="w-28 shrink-0 truncate text-sm text-neutral-700">{item.name}</span>
                    <div className="flex-1 min-w-0">
                      <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
                        <div className="h-1.5 rounded-full bg-amber-400" style={{ width: `${barPct}%` }} />
                      </div>
                    </div>
                    <span className="w-10 shrink-0 text-right text-xs tabular-nums text-neutral-500">{pct.toFixed(1)}%</span>
                    <span className="w-20 shrink-0 text-right text-sm font-medium tabular-nums">{fmtKRWShort(item.eval_krw)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ⑦ 배당 내역 (최근 12개월) */}
      {dividends.length > 0 && (
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-4 sm:px-5">
          <h2 className="mb-1 text-lg font-semibold">연간 배당 현황</h2>
          <p className="mb-3 text-sm text-neutral-400">최근 12개월 수령 배당금</p>
          <MonthlyDividendBar dividends={dividends} />
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-neutral-500">합계</span>
            <span className="font-bold text-amber-600 tabular-nums">{fmtKRWShort(totalDivKrw)}</span>
          </div>
          {divYield !== null && (
            <div className="mt-1 flex items-center justify-between text-sm">
              <span className="text-neutral-500">수익률 (현재 자산 기준)</span>
              <span className="font-bold tabular-nums text-neutral-700">{divYield.toFixed(2)}%</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── 월별 배당 바 차트 ─────────────────────────────────────────────────────────

function MonthlyDividendBar({ dividends }: { dividends: DividendRow[] }) {
  const monthly = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of dividends) {
      const ym = d.received_at.slice(0, 7); // "YYYY-MM"
      map.set(ym, (map.get(ym) ?? 0) + Number(d.amount_krw));
    }
    // 최근 12개월 키 생성 (없는 달은 0)
    const result: { ym: string; label: string; amount: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const dt = new Date();
      dt.setDate(1);
      dt.setMonth(dt.getMonth() - i);
      const ym = dt.toISOString().slice(0, 7);
      const label = `${dt.getMonth() + 1}월`;
      result.push({ ym, label, amount: map.get(ym) ?? 0 });
    }
    return result;
  }, [dividends]);

  const max = Math.max(...monthly.map((m) => m.amount), 1);

  return (
    <div className="flex items-end gap-1 h-20">
      {monthly.map(({ ym, label, amount }) => (
        <div key={ym} className="flex flex-1 flex-col items-center gap-0.5">
          <div className="flex w-full flex-col justify-end" style={{ height: "60px" }}>
            <div
              className={`w-full rounded-sm transition-all ${amount > 0 ? "bg-amber-400" : "bg-neutral-100"}`}
              style={{ height: `${(amount / max) * 60}px` }}
              title={amount > 0 ? fmtKRWShort(amount) : "0"}
            />
          </div>
          <span className="text-[10px] text-neutral-400">{label}</span>
        </div>
      ))}
    </div>
  );
}

function PageHeader({ latestDate }: { latestDate: string | null }) {
  return (
    <header>
      <Link href="/assets" className="text-base text-neutral-600 hover:text-neutral-900">← 자산</Link>
      <div className="mt-1 flex items-end justify-between gap-2">
        <h1 className="text-3xl font-bold tracking-tight">자산 추이</h1>
        {latestDate && <p className="text-sm text-neutral-400">{latestDate} 기준</p>}
      </div>
    </header>
  );
}
