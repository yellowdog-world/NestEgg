"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { fmtKRWShort } from "@/lib/utils/format";
import { AssetTimeline } from "@/components/assets/AssetTimeline";
import {
  CategoryTrendChart,
  CategoryBarToday,
  GenericStackedChart,
  GenericBarToday,
  buildSeries,
  ACCOUNT_TYPE_COLOR,
  ACCOUNT_TYPE_LABEL,
  type CategoryPoint,
  type GenericPoint,
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
    accounts: {
      account_id: string;
      broker: string | null;
      type: string;
      nickname: string | null;
      total_krw: number;
      holdings: HoldingDetail[];
    }[];
    category_breakdown?: CategoryBreakdown;
    usd_total_krw?: number;
    broker_breakdown?: Record<string, number>;
    account_type_breakdown?: Record<string, number>;
    account_breakdown?: Record<string, { total_krw: number; label: string }>;
    holdings_breakdown?: Record<string, { name: string; eval_krw: number }>;
  } | null;
};

type DividendRow = { received_at: string; amount_krw: number };
type Period = "1W" | "1M" | "3M" | "6M" | "1Y" | "ALL";
type ChartView = "total" | "category" | "broker" | "accountType" | "account";

const PERIOD_LABELS: { key: Period; label: string }[] = [
  { key: "1W", label: "1주" },
  { key: "1M", label: "1달" },
  { key: "3M", label: "3달" },
  { key: "6M", label: "6달" },
  { key: "1Y", label: "1년" },
  { key: "ALL", label: "전체" },
];

const VIEW_LABELS: { key: ChartView; label: string }[] = [
  { key: "total",       label: "총 자산" },
  { key: "category",    label: "전략" },
  { key: "broker",      label: "증권사" },
  { key: "accountType", label: "계좌유형" },
  { key: "account",     label: "계좌별" },
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
  const [view, setView] = useState<ChartView>("total");
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
    try {
      const raw = localStorage.getItem("retirement-profile");
      if (raw) {
        const p = JSON.parse(raw) as { monthlyBudget?: number };
        if (p.monthlyBudget) setFireTarget(Math.round((p.monthlyBudget * 12) / 0.04));
      }
    } catch { /* ignore */ }
  }, []);

  // 기간 필터
  const filtered = useMemo(() => {
    const cut = cutoffDate(period);
    return cut ? rows.filter((r) => r.snapshot_date >= cut) : rows;
  }, [rows, period]);

  // 총 자산 라인 데이터
  const timelineData = useMemo(
    () => filtered.map((r) => ({ date: r.snapshot_date, total: r.total_krw, cost: 0 })),
    [filtered],
  );

  // 카테고리별 스택 데이터
  const categoryData = useMemo((): CategoryPoint[] =>
    filtered.map((r) => {
      const cb: CategoryBreakdown =
        r.breakdown?.category_breakdown ??
        aggregateByCategory((r.breakdown?.accounts ?? []).flatMap((a) => a.holdings));
      return { date: r.snapshot_date, ...cb };
    }),
    [filtered],
  );

  // 전체 행에서 동적 key 수집 (증권사 / 계좌유형 / 계좌)
  const allBrokers = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      for (const k of Object.keys(r.breakdown?.broker_breakdown ?? {})) set.add(k);
    }
    return [...set].sort();
  }, [rows]);

  const allAccountTypes = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      for (const k of Object.keys(r.breakdown?.account_type_breakdown ?? {})) set.add(k);
    }
    // 고정 순서로 정렬
    const ORDER = ["pension_fund", "isa", "irp", "regular", "overseas", "corp", "bank"];
    return [...set].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  }, [rows]);

  const allAccounts = useMemo(() => {
    // account_id → label (최신 row 기준)
    const map = new Map<string, string>();
    for (const r of rows) {
      for (const [id, v] of Object.entries(r.breakdown?.account_breakdown ?? {})) {
        map.set(id, v.label);
      }
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  // SeriesMeta 생성
  const brokerSeries    = useMemo(() => buildSeries(allBrokers), [allBrokers]);
  const accountTypeSeries = useMemo(
    () => buildSeries(allAccountTypes, ACCOUNT_TYPE_COLOR, ACCOUNT_TYPE_LABEL),
    [allAccountTypes],
  );
  const accountSeries   = useMemo(
    () => buildSeries(allAccounts.map(([id]) => id), {}, Object.fromEntries(allAccounts)),
    [allAccounts],
  );

  // GenericPoint 빌더
  function buildGenericData(
    keyExtractor: (row: DailyRow) => Record<string, number>,
  ): GenericPoint[] {
    return filtered.map((r) => ({ date: r.snapshot_date, ...keyExtractor(r) }));
  }

  const brokerData     = useMemo(() => buildGenericData((r) => r.breakdown?.broker_breakdown ?? {}), [filtered]);
  const accountTypeData = useMemo(() => buildGenericData((r) => r.breakdown?.account_type_breakdown ?? {}), [filtered]);
  const accountData    = useMemo(() =>
    buildGenericData((r) =>
      Object.fromEntries(
        Object.entries(r.breakdown?.account_breakdown ?? {}).map(([k, v]) => [k, v.total_krw]),
      ),
    ),
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

  const todayBroker       = latestRow?.breakdown?.broker_breakdown ?? {};
  const todayAccountType  = latestRow?.breakdown?.account_type_breakdown ?? {};
  const todayAccountMap   = latestRow?.breakdown?.account_breakdown ?? {};
  const todayAccount      = Object.fromEntries(
    Object.entries(todayAccountMap).map(([k, v]) => [k, v.total_krw]),
  );

  // 변동 기준
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
    return r && r.snapshot_date < (latestRow?.snapshot_date ?? "") ? r.total_krw : null;
  })();

  // Drawdown
  const { drawdownPct, peakDate } = useMemo(() => {
    let peak = 0, pDate = "";
    for (const r of rows) {
      if (r.total_krw > peak) { peak = r.total_krw; pDate = r.snapshot_date; }
    }
    return { drawdownPct: peak > 0 ? ((todayTotal - peak) / peak) * 100 : 0, peakDate: pDate };
  }, [rows, todayTotal]);

  // 환 노출
  const usdTotalKrw = latestRow?.breakdown?.usd_total_krw ??
    (latestRow?.breakdown?.accounts ?? []).flatMap((a) => a.holdings)
      .filter((h) => h.currency === "USD").reduce((s, h) => s + h.eval_krw, 0);
  const usdPct = todayTotal > 0 ? (usdTotalKrw / todayTotal) * 100 : 0;

  // FIRE / 배당
  const firePct = fireTarget > 0 ? Math.min(100, (todayTotal / fireTarget) * 100) : null;
  const totalDivKrw = dividends.reduce((s, d) => s + Number(d.amount_krw), 0);
  const divYield = todayTotal > 0 && totalDivKrw > 0 ? (totalDivKrw / todayTotal) * 100 : null;

  // Top 5
  const top5 = useMemo(() => {
    const hb = latestRow?.breakdown?.holdings_breakdown ?? {};
    return Object.entries(hb)
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.eval_krw - a.eval_krw)
      .slice(0, 5);
  }, [latestRow]);
  const top5Max = top5[0]?.eval_krw ?? 1;

  const hasEnoughData = rows.length >= 2;

  // ── 현재 뷰에 맞는 차트/바 렌더 ──────────────────────────────────────────

  function renderChart() {
    switch (view) {
      case "total":       return <AssetTimeline data={timelineData} />;
      case "category":    return <CategoryTrendChart data={categoryData} />;
      case "broker":      return <GenericStackedChart data={brokerData} series={brokerSeries} />;
      case "accountType": return <GenericStackedChart data={accountTypeData} series={accountTypeSeries} />;
      case "account":     return <GenericStackedChart data={accountData} series={accountSeries} />;
    }
  }

  function renderBar() {
    switch (view) {
      case "total":       return null;
      case "category":    return <CategoryBarToday breakdown={todayBreakdown} totalKrw={todayTotal} />;
      case "broker":      return <GenericBarToday breakdown={todayBroker} series={brokerSeries} totalKrw={todayTotal} />;
      case "accountType": return <GenericBarToday breakdown={todayAccountType} series={accountTypeSeries} totalKrw={todayTotal} />;
      case "account":     return <GenericBarToday breakdown={todayAccount} series={accountSeries} totalKrw={todayTotal} />;
    }
  }

  function viewTitle() {
    const titles: Record<ChartView, string> = {
      total: "총 자산",
      category: "전략별",
      broker: "증권사별",
      accountType: "계좌 유형별",
      account: "계좌별",
    };
    return titles[view];
  }

  // ── 로딩/빈 상태 ─────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex flex-col gap-4">
      <PageHeader latestDate={null} />
      <div className="flex h-40 items-center justify-center text-neutral-400">불러오는 중…</div>
    </div>
  );

  if (!rows.length) return (
    <div className="flex flex-col gap-4">
      <PageHeader latestDate={null} />
      <div className="rounded-xl border border-neutral-200 bg-white px-6 py-12 text-center">
        <p className="text-base text-neutral-500">아직 일별 스냅샷 데이터가 없어요.</p>
        <p className="mt-1 text-sm text-neutral-400">매일 07:00 자동 저장됩니다.</p>
      </div>
    </div>
  );

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
            매일 07:00 수집 — 이틀 이상 쌓이면 변동이 표시돼요
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

      {/* ③ FIRE 진행 바 */}
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
        {/* 기간 탭 */}
        <div className="mb-3 flex gap-1">
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

        {/* 뷰 탭 — 한 줄에 맞게 scroll 가능 */}
        <div className="mb-4 flex gap-1 overflow-x-auto pb-1">
          {VIEW_LABELS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`shrink-0 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                view === key
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-200 text-neutral-500 hover:border-neutral-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {renderChart()}
      </div>

      {/* ⑤ 현황 바 (총 자산 뷰 제외) */}
      {view !== "total" && renderBar() && (
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-4 sm:px-5">
          <h2 className="mb-3 text-lg font-semibold">
            {viewTitle()} 현황
            <span className="ml-2 text-sm font-normal text-neutral-400">{latestRow?.snapshot_date} 기준</span>
          </h2>
          {renderBar()}
        </div>
      )}

      {/* ⑥ 환 노출 + Top 5 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-4">
          <h2 className="mb-3 text-lg font-semibold">환 노출</h2>
          <div className="flex items-center justify-between text-sm text-neutral-600 mb-1.5">
            <span>USD 직접 보유</span>
            <span className="font-semibold">{usdPct.toFixed(1)}%</span>
          </div>
          <div className="flex h-3 w-full overflow-hidden rounded-full">
            <div className="bg-indigo-400" style={{ width: `${usdPct}%` }} />
            <div className="flex-1 bg-neutral-200" />
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
          <p className="mt-2 text-xs text-neutral-400">* KRX 상장 해외 ETF는 원화 결제로 KRW 집계</p>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-4">
          <h2 className="mb-3 text-lg font-semibold">Top 5 보유 종목</h2>
          {top5.length === 0 ? (
            <p className="text-sm text-neutral-400">데이터 없음</p>
          ) : (
            <div className="space-y-2">
              {top5.map((item, i) => {
                const pct = todayTotal > 0 ? (item.eval_krw / todayTotal) * 100 : 0;
                return (
                  <div key={item.key} className="flex items-center gap-2">
                    <span className="w-4 shrink-0 text-center text-xs font-bold text-neutral-400">{i + 1}</span>
                    <span className="w-28 shrink-0 truncate text-sm text-neutral-700">{item.name}</span>
                    <div className="flex-1 min-w-0">
                      <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
                        <div className="h-1.5 rounded-full bg-amber-400" style={{ width: `${(item.eval_krw / top5Max) * 100}%` }} />
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

      {/* ⑦ 배당 */}
      {dividends.length > 0 && (
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-4 sm:px-5">
          <h2 className="mb-1 text-lg font-semibold">연간 배당 현황</h2>
          <p className="mb-3 text-sm text-neutral-400">최근 12개월</p>
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

// ── 월별 배당 바 ──────────────────────────────────────────────────────────────

function MonthlyDividendBar({ dividends }: { dividends: DividendRow[] }) {
  const monthly = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of dividends) {
      const ym = d.received_at.slice(0, 7);
      map.set(ym, (map.get(ym) ?? 0) + Number(d.amount_krw));
    }
    const result: { ym: string; label: string; amount: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const dt = new Date();
      dt.setDate(1);
      dt.setMonth(dt.getMonth() - i);
      const ym = dt.toISOString().slice(0, 7);
      result.push({ ym, label: `${dt.getMonth() + 1}월`, amount: map.get(ym) ?? 0 });
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
              className={`w-full rounded-sm ${amount > 0 ? "bg-amber-400" : "bg-neutral-100"}`}
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
