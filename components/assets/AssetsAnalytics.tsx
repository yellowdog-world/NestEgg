"use client";

import Link from "next/link";
import { useState, useMemo, useCallback } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  BarChart, Bar, XAxis, LabelList,
} from "recharts";
import { AssetTimeline } from "./AssetTimeline";
import { fmtKRWShort } from "@/lib/utils/format";
import type { EnrichedAccount } from "./AssetsViewSwitcher";

// ── 색상 팔레트 ───────────────────────────────────────────────────────────────
const PALETTE = [
  "#3b82f6","#ec4899","#60a5fa","#f472b6",
  "#06b6d4","#8b5cf6","#10b981","#f59e0b",
  "#6366f1","#14b8a6","#a78bfa","#34d399",
  "#fb923c","#e879f9","#4ade80","#facc15",
];

const ACCOUNT_LABEL: Record<string, string> = {
  pension_fund: "연저펀", isa: "ISA", irp: "IRP",
  regular: "일반계좌", corp: "법인", bank: "은행", overseas: "해외증권",
};

// ── 배당 타입 ────────────────────────────────────────────────────────────────
export type DividendRow = {
  id: string;
  received_at: string;
  ticker: string | null;
  name: string;
  quantity: number | null;
  per_share: number | null;
  currency: string;
  amount_original: number;
  amount_krw: number;
  usd_krw_rate: number | null;
  dividend_type: string;
  account_id: string | null;
};

// ── 탭 타입 ──────────────────────────────────────────────────────────────────
type MainTab = "gain" | "dividend" | "trend" | "weight";
type WeightTab = "security" | "type" | "broker" | "account";
type Item = { name: string; valueKrw: number; pct: number; color: string };

const MAIN_TABS: { id: MainTab; label: string }[] = [
  { id: "gain",     label: "수익"  },
  { id: "dividend", label: "배당"  },
  { id: "trend",    label: "추이"  },
  { id: "weight",   label: "비중"  },
];

const WEIGHT_TABS: { id: WeightTab; label: string }[] = [
  { id: "security", label: "종목별"  },
  { id: "type",     label: "유형별"  },
  { id: "broker",   label: "증권사별" },
  { id: "account",  label: "계좌별"  },
];

// ── 바 차트 레이블 포매터 ─────────────────────────────────────────────────────
function fmtBarLabel(v: unknown): string {
  const n = typeof v === "number" ? v : 0;
  if (n <= 0) return "";
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(0)}억`;
  if (n >= 10_000) return `${Math.round(n / 10_000)}만`;
  return Math.round(n).toLocaleString("ko-KR");
}

// ── 현재 연/월 ────────────────────────────────────────────────────────────────
const NOW = new Date();
const CURRENT_YEAR  = NOW.getFullYear();
const CURRENT_MONTH = NOW.getMonth() + 1;
const TAX_RATE = 0.154;

const DIV_TYPE_LABEL: Record<string, string> = {
  monthly: "월배당",
  regular: "일반배당",
  special: "특별배당",
};

// ── 컴포넌트 ──────────────────────────────────────────────────────────────────
export function AssetsAnalytics({
  accounts,
  usdKrw,
  timelinePoints,
  dividends = [],
}: {
  accounts: EnrichedAccount[];
  usdKrw: number;
  timelinePoints: { date: string; total: number; cost: number }[];
  dividends?: DividendRow[];
}) {
  // ── 탭 상태 ─────────────────────────────────────────────────────────────────
  const [mainTab, setMainTab]     = useState<MainTab>("trend");
  const [weightTab, setWeightTab] = useState<WeightTab>("security");
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  // ── 배당 탭 상태 ─────────────────────────────────────────────────────────────
  const [divYear, setDivYear]   = useState(CURRENT_YEAR);
  const [afterTax, setAfterTax] = useState(false);

  // ── 수익 계산 ────────────────────────────────────────────────────────────────
  const totalEvalKrw = accounts.reduce((s, a) => s + a.totalEvalKrw, 0);
  const totalCostKrw = accounts.reduce((s, a) => s + a.totalCostKrw, 0);
  const totalGain    = totalEvalKrw - totalCostKrw;
  const totalGainPct = totalCostKrw > 0 ? (totalGain / totalCostKrw) * 100 : null;
  const gainPos      = totalGain >= 0;

  // ── 비중 데이터 ──────────────────────────────────────────────────────────────
  const bySecurity = useMemo((): Item[] => {
    const map = new Map<string, { name: string; val: number }>();
    for (const { holdings } of accounts) {
      for (const h of holdings) {
        const key = h.ticker ?? h.raw_name;
        const prev = map.get(key) ?? { name: h.raw_name, val: 0 };
        prev.val += h.liveEvalKrw ?? 0;
        map.set(key, prev);
      }
    }
    return [...map.values()]
      .filter((e) => e.val > 0)
      .sort((a, b) => b.val - a.val)
      .slice(0, 14)
      .map((e, i) => ({
        name: e.name,
        valueKrw: e.val,
        pct: totalEvalKrw > 0 ? (e.val / totalEvalKrw) * 100 : 0,
        color: PALETTE[i % PALETTE.length],
      }));
  }, [accounts, totalEvalKrw]);

  const byType = useMemo((): Item[] => {
    const map = new Map<string, number>();
    for (const { account, totalEvalKrw: ev } of accounts) {
      const k = ACCOUNT_LABEL[account.type] ?? account.type;
      map.set(k, (map.get(k) ?? 0) + ev);
    }
    return [...map.entries()]
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([name, val], i) => ({
        name, valueKrw: val,
        pct: totalEvalKrw > 0 ? (val / totalEvalKrw) * 100 : 0,
        color: PALETTE[i % PALETTE.length],
      }));
  }, [accounts, totalEvalKrw]);

  const byBroker = useMemo((): Item[] => {
    const map = new Map<string, number>();
    for (const { account, totalEvalKrw: ev } of accounts) {
      const k = account.broker ?? "기타";
      map.set(k, (map.get(k) ?? 0) + ev);
    }
    return [...map.entries()]
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([name, val], i) => ({
        name, valueKrw: val,
        pct: totalEvalKrw > 0 ? (val / totalEvalKrw) * 100 : 0,
        color: PALETTE[i % PALETTE.length],
      }));
  }, [accounts, totalEvalKrw]);

  const byAccount = useMemo((): Item[] => {
    return accounts
      .filter((a) => a.totalEvalKrw > 0)
      .sort((a, b) => b.totalEvalKrw - a.totalEvalKrw)
      .map((a, i) => {
        const name = [a.account.broker, a.account.nickname].filter(Boolean).join(" · ")
          || (ACCOUNT_LABEL[a.account.type] ?? a.account.type);
        return {
          name,
          valueKrw: a.totalEvalKrw,
          pct: totalEvalKrw > 0 ? (a.totalEvalKrw / totalEvalKrw) * 100 : 0,
          color: PALETTE[i % PALETTE.length],
        };
      });
  }, [accounts, totalEvalKrw]);

  const weightItems: Record<WeightTab, Item[]> = {
    security: bySecurity,
    type: byType,
    broker: byBroker,
    account: byAccount,
  };

  const items   = weightItems[weightTab];
  const active  = activeIdx !== null ? items[activeIdx] : null;
  const onEnter = useCallback((_: unknown, index: number) => setActiveIdx(index), []);
  const onLeave = useCallback(() => setActiveIdx(null), []);

  // ── 배당 데이터 ──────────────────────────────────────────────────────────────
  const yearDividends = useMemo(
    () => dividends.filter((d) => new Date(d.received_at).getFullYear() === divYear),
    [dividends, divYear],
  );

  const effectKrw = useCallback(
    (d: DividendRow) => afterTax ? d.amount_krw * (1 - TAX_RATE) : d.amount_krw,
    [afterTax],
  );

  const yearTotal = useMemo(
    () => yearDividends.reduce((s, d) => s + effectKrw(d), 0),
    [yearDividends, effectKrw],
  );

  const yieldPct = useMemo(
    () => totalCostKrw > 0 && yearTotal > 0 ? (yearTotal / totalCostKrw) * 100 : null,
    [yearTotal, totalCostKrw],
  );

  const monthlyBarData = useMemo(() => {
    const arr = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, total: 0 }));
    for (const d of yearDividends) arr[new Date(d.received_at).getMonth()].total += effectKrw(d);
    return arr;
  }, [yearDividends, effectKrw]);

  const monthGroups = useMemo(() => {
    const map = new Map<number, DividendRow[]>();
    for (const d of yearDividends) {
      const m = new Date(d.received_at).getMonth() + 1;
      if (!map.has(m)) map.set(m, []);
      map.get(m)!.push(d);
    }
    return [...map.entries()]
      .sort(([a], [b]) => b - a)
      .map(([month, rows]) => ({
        month,
        total: rows.reduce((s, d) => s + effectKrw(d), 0),
        items: [...rows].sort((a, b) => (a.received_at > b.received_at ? -1 : 1)),
      }));
  }, [yearDividends, effectKrw]);

  // ── 렌더 ─────────────────────────────────────────────────────────────────────
  return (
    <section className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
      {/* ── 메인 탭 바 ── */}
      <div className="flex border-b border-neutral-100">
        {MAIN_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setMainTab(t.id)}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              mainTab === t.id
                ? "border-b-2 border-neutral-900 text-neutral-900"
                : "text-neutral-400 hover:text-neutral-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-5">

        {/* ══════════════════════════════════════════════════════════════════════
            수익
        ══════════════════════════════════════════════════════════════════════ */}
        {mainTab === "gain" && (
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-sm text-neutral-500">총 평가금액</p>
              <p className="mt-0.5 text-3xl font-bold tabular-nums text-neutral-900">
                {fmtKRWShort(totalEvalKrw)}
              </p>
              <p className="mt-1 text-sm text-neutral-400 tabular-nums">
                원금 {fmtKRWShort(totalCostKrw)}
              </p>
            </div>
            {totalGainPct !== null && (
              <div className={`rounded-xl p-4 ${gainPos ? "bg-red-50" : "bg-blue-50"}`}>
                <p className={`text-sm font-medium ${gainPos ? "text-red-600" : "text-blue-600"}`}>
                  총 수익
                </p>
                <p className={`mt-0.5 text-2xl font-bold tabular-nums ${gainPos ? "text-red-500" : "text-blue-500"}`}>
                  {gainPos ? "+" : ""}{fmtKRWShort(totalGain)}
                </p>
                <p className={`text-base font-semibold tabular-nums ${gainPos ? "text-red-500" : "text-blue-500"}`}>
                  {gainPos ? "+" : ""}{totalGainPct.toFixed(2)}%
                </p>
              </div>
            )}
            <div className="flex flex-col divide-y divide-neutral-50">
              {accounts
                .filter((a) => a.totalCostKrw > 0)
                .sort((a, b) => b.totalEvalKrw - a.totalEvalKrw)
                .map((a) => {
                  const gain = a.totalEvalKrw - a.totalCostKrw;
                  const pct  = (gain / a.totalCostKrw) * 100;
                  const pos  = gain >= 0;
                  const label = [a.account.broker, a.account.nickname].filter(Boolean).join(" · ")
                    || (ACCOUNT_LABEL[a.account.type] ?? a.account.type);
                  return (
                    <div key={a.account.id} className="flex items-center justify-between py-3">
                      <span className="text-sm text-neutral-700">{label}</span>
                      <div className="text-right">
                        <p className="text-sm font-semibold tabular-nums text-neutral-900">
                          {fmtKRWShort(a.totalEvalKrw)}
                        </p>
                        <p className={`text-xs tabular-nums font-medium ${pos ? "text-red-500" : "text-blue-500"}`}>
                          {pos ? "+" : ""}{fmtKRWShort(gain)} ({pos ? "+" : ""}{pct.toFixed(1)}%)
                        </p>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            배당
        ══════════════════════════════════════════════════════════════════════ */}
        {mainTab === "dividend" && (
          <div className="flex flex-col gap-5">

            {/* 헤더: 연도 선택 + 토글 + 입력 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDivYear((y) => y - 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100"
                >
                  ‹
                </button>
                <span className="text-base font-semibold text-neutral-900">{divYear}년</span>
                <button
                  onClick={() => setDivYear((y) => y + 1)}
                  disabled={divYear >= CURRENT_YEAR}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 disabled:opacity-30"
                >
                  ›
                </button>
              </div>
              <button
                onClick={() => setAfterTax((t) => !t)}
                className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
                  afterTax ? "text-neutral-900" : "text-neutral-400"
                }`}
              >
                <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full border text-[9px] ${
                  afterTax ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 text-transparent"
                }`}>✓</span>
                실수령액
              </button>
            </div>

            {/* 연간 총액 + 배당률 */}
            <div>
              <p className="text-3xl font-bold tabular-nums text-neutral-900">
                {Math.round(yearTotal).toLocaleString("ko-KR")}원
              </p>
              {yieldPct !== null && (
                <p className="mt-0.5 text-sm text-neutral-500">
                  투자배당률 {yieldPct.toFixed(2)}%
                </p>
              )}
            </div>

            {/* 월별 바 차트 */}
            {yearDividends.length > 0 && (
              <div className="h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={monthlyBarData}
                    margin={{ top: 16, right: 2, bottom: 0, left: 2 }}
                    barCategoryGap="20%"
                  >
                    <XAxis
                      dataKey="month"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 10, fill: "#9ca3af" }}
                    />
                    <Bar dataKey="total" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                      {monthlyBarData.map((entry, i) => (
                        <Cell
                          key={`cell-${i}`}
                          fill={
                            entry.month === CURRENT_MONTH && divYear === CURRENT_YEAR
                              ? "#ef4444"
                              : "#fca5a5"
                          }
                        />
                      ))}
                      <LabelList
                        dataKey="total"
                        position="top"
                        formatter={fmtBarLabel}
                        style={{ fontSize: 9, fill: "#9ca3af" }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* 월별 그룹 리스트 */}
            {monthGroups.length > 0 ? (
              <div className="flex flex-col gap-1">
                {monthGroups.map((group) => (
                  <div key={group.month}>
                    {/* 월 헤더 */}
                    <div className="flex items-center justify-between py-2.5 border-b border-neutral-100">
                      <span className="text-base font-semibold text-neutral-800">{group.month}월</span>
                      <span className="text-sm font-semibold tabular-nums text-neutral-800">
                        {Math.round(group.total).toLocaleString("ko-KR")}원
                      </span>
                    </div>
                    {/* 항목 */}
                    {group.items.map((item) => {
                      const day     = new Date(item.received_at).getDate();
                      const isUsd   = item.currency === "USD";
                      const display = effectKrw(item);
                      return (
                        <div
                          key={item.id}
                          className="flex items-center gap-3 py-3.5 border-b border-neutral-50"
                        >
                          {/* 날짜 */}
                          <div className="w-8 shrink-0 text-center text-sm text-neutral-400">
                            {day}일
                          </div>
                          {/* 종목 정보 */}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-neutral-900">
                              {item.ticker ?? item.name}
                            </p>
                            {item.quantity != null && item.per_share != null && (
                              <p className="text-xs text-neutral-500">
                                {item.quantity % 1 === 0
                                  ? item.quantity.toLocaleString("ko-KR")
                                  : item.quantity}주 · 주당{" "}
                                {isUsd
                                  ? `$${item.per_share.toFixed(2)}`
                                  : `${item.per_share.toLocaleString("ko-KR")}원`}
                              </p>
                            )}
                            <span className="mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium bg-rose-50 text-rose-600">
                              {DIV_TYPE_LABEL[item.dividend_type] ?? item.dividend_type}
                            </span>
                          </div>
                          {/* 금액 */}
                          <div className="shrink-0 text-right">
                            <p className="text-sm font-semibold tabular-nums text-neutral-900">
                              {Math.round(display).toLocaleString("ko-KR")}원
                            </p>
                            {isUsd && (
                              <p className="text-xs tabular-nums text-neutral-400">
                                (${Number(item.amount_original).toFixed(2)})
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <p className="text-2xl">💰</p>
                <p className="text-sm font-medium text-neutral-600">
                  {divYear}년 배당 내역이 없습니다
                </p>
                <p className="text-xs text-neutral-400 text-center max-w-[220px]">
                  보유 종목의 배당 이력을 Yahoo Finance에서 자동으로 가져옵니다
                </p>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            추이
        ══════════════════════════════════════════════════════════════════════ */}
        {mainTab === "trend" && (
          <div>
            {timelinePoints.length > 1 ? (
              <>
                <div className="mb-4">
                  <p className="text-xs text-neutral-400">
                    캡처 시점 평가금액(실선) · 투자원금 추정(점선) — 현재 환율 기준 환산
                  </p>
                </div>
                <AssetTimeline data={timelinePoints} />
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <p className="text-3xl">📈</p>
                <p className="text-base font-medium text-neutral-600">아직 데이터가 부족해요</p>
                <p className="text-sm text-neutral-400">스냅샷을 2개 이상 등록하면 추이 차트가 표시됩니다</p>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            비중
        ══════════════════════════════════════════════════════════════════════ */}
        {mainTab === "weight" && (
          <div>
            {/* 서브탭 */}
            <div className="mb-5 flex gap-1 rounded-lg bg-neutral-100 p-0.5">
              {WEIGHT_TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { setWeightTab(t.id); setActiveIdx(null); }}
                  className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
                    weightTab === t.id
                      ? "bg-white text-neutral-900 shadow-sm"
                      : "text-neutral-500"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* 도넛 차트 */}
            <div className="relative mx-auto h-52 w-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={items}
                    dataKey="valueKrw"
                    cx="50%"
                    cy="50%"
                    innerRadius={66}
                    outerRadius={90}
                    paddingAngle={items.length > 1 ? 1.5 : 0}
                    onMouseEnter={onEnter}
                    onMouseLeave={onLeave}
                    stroke="none"
                  >
                    {items.map((item, i) => (
                      <Cell
                        key={item.name}
                        fill={item.color}
                        opacity={activeIdx === null || activeIdx === i ? 1 : 0.3}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              {/* 중앙 텍스트 */}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                {active ? (
                  <>
                    <p className="text-xl font-bold tabular-nums text-neutral-900">
                      {active.pct.toFixed(1)}%
                    </p>
                    <p className="mt-0.5 max-w-[90px] text-center text-xs leading-tight text-neutral-500 truncate">
                      {active.name}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-xl font-bold text-neutral-900">{items.length}개</p>
                    <p className="text-xs text-neutral-400">
                      {WEIGHT_TABS.find((t) => t.id === weightTab)?.label}
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* 범례 리스트 */}
            <div className="mt-4 flex flex-col divide-y divide-neutral-50">
              {items.map((item, i) => (
                <div
                  key={item.name}
                  className="flex cursor-pointer items-center justify-between gap-3 py-2.5 transition-opacity"
                  style={{ opacity: activeIdx === null || activeIdx === i ? 1 : 0.35 }}
                  onMouseEnter={() => setActiveIdx(i)}
                  onMouseLeave={() => setActiveIdx(null)}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="truncate text-sm text-neutral-800">{item.name}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-xs tabular-nums text-neutral-400">
                      {fmtKRWShort(item.valueKrw)}
                    </span>
                    <span className="w-12 text-right text-sm font-semibold tabular-nums text-neutral-900">
                      {item.pct.toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
