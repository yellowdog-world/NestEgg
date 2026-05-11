"use client";

import { useState, useMemo, useCallback } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { fmtKRWShort } from "@/lib/utils/format";
import type { EnrichedAccount } from "./AssetsViewSwitcher";

// ── 색상 팔레트 ───────────────────────────────────────────────────────────────
const PALETTE = [
  "#3b82f6", "#ec4899", "#60a5fa", "#f472b6",
  "#06b6d4", "#8b5cf6", "#10b981", "#f59e0b",
  "#6366f1", "#14b8a6", "#a78bfa", "#34d399",
  "#fb923c", "#e879f9", "#4ade80", "#facc15",
];

const ACCOUNT_LABEL: Record<string, string> = {
  pension_fund: "연저펀", isa: "ISA", irp: "IRP",
  regular: "일반계좌", corp: "법인", bank: "은행", overseas: "해외증권",
};

type Tab = "security" | "type" | "broker";
type Item = { name: string; valueKrw: number; pct: number; color: string };


export function PortfolioComposition({
  accounts,
  usdKrw,
}: {
  accounts: EnrichedAccount[];
  usdKrw: number;
}) {
  const [tab, setTab] = useState<Tab>("security");
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const totalEval = accounts.reduce((s, a) => s + a.totalEvalKrw, 0);

  // ── 종목별 ──────────────────────────────────────────────────────────────────
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
      .slice(0, 12) // 최대 12개
      .map((e, i) => ({
        name: e.name,
        valueKrw: e.val,
        pct: totalEval > 0 ? (e.val / totalEval) * 100 : 0,
        color: PALETTE[i % PALETTE.length],
      }));
  }, [accounts, totalEval]);

  // ── 유형별 ──────────────────────────────────────────────────────────────────
  const byType = useMemo((): Item[] => {
    const map = new Map<string, number>();
    for (const { account, totalEvalKrw } of accounts) {
      const k = ACCOUNT_LABEL[account.type] ?? account.type;
      map.set(k, (map.get(k) ?? 0) + totalEvalKrw);
    }
    return [...map.entries()]
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([name, val], i) => ({
        name,
        valueKrw: val,
        pct: totalEval > 0 ? (val / totalEval) * 100 : 0,
        color: PALETTE[i % PALETTE.length],
      }));
  }, [accounts, totalEval]);

  // ── 계좌별 ──────────────────────────────────────────────────────────────────
  const byBroker = useMemo((): Item[] => {
    const map = new Map<string, number>();
    for (const { account, totalEvalKrw } of accounts) {
      const k = [account.broker, account.nickname].filter(Boolean).join(" ") || "기타";
      map.set(k, (map.get(k) ?? 0) + totalEvalKrw);
    }
    return [...map.entries()]
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([name, val], i) => ({
        name,
        valueKrw: val,
        pct: totalEval > 0 ? (val / totalEval) * 100 : 0,
        color: PALETTE[i % PALETTE.length],
      }));
  }, [accounts, totalEval]);

  const items = tab === "security" ? bySecurity : tab === "type" ? byType : byBroker;
  const active = activeIdx !== null ? items[activeIdx] : null;

  const onEnter = useCallback((_: unknown, index: number) => setActiveIdx(index), []);
  const onLeave = useCallback(() => setActiveIdx(null), []);

  if (totalEval <= 0) return null;

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5">
      {/* 상단: 제목 + 서브탭 */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-neutral-700">포트폴리오 비중</h2>
        <div className="flex gap-1 rounded-lg bg-neutral-100 p-0.5">
          {(["security", "type", "broker"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setActiveIdx(null); }}
              className={`rounded-md px-2.5 py-1 text-sm font-medium transition-colors ${
                tab === t ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"
              }`}
            >
              {t === "security" ? "종목별" : t === "type" ? "유형별" : "계좌별"}
            </button>
          ))}
        </div>
      </div>

      {/* 도넛 차트 + 중앙 텍스트 */}
      <div className="relative mx-auto h-52 w-52">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={items}
              dataKey="valueKrw"
              cx="50%"
              cy="50%"
              innerRadius={68}
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
                  opacity={activeIdx === null || activeIdx === i ? 1 : 0.35}
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
              <p className="mt-0.5 max-w-[90px] text-center text-sm text-neutral-500 leading-tight truncate">
                {active.name}
              </p>
            </>
          ) : (
            <>
              <p className="text-xl font-bold tabular-nums text-neutral-900">
                {items.length}개
              </p>
              <p className="text-sm text-neutral-400">
                {tab === "security" ? "종목" : tab === "type" ? "유형" : "계좌"}
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
            className={`flex items-center justify-between gap-3 py-2.5 cursor-pointer transition-colors ${
              activeIdx === i ? "opacity-100" : activeIdx !== null ? "opacity-40" : ""
            }`}
            onMouseEnter={() => setActiveIdx(i)}
            onMouseLeave={() => setActiveIdx(null)}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="truncate text-base text-neutral-800">{item.name}</span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-sm text-neutral-400 tabular-nums">
                {fmtKRWShort(item.valueKrw)}
              </span>
              <span className="w-12 text-right text-base font-semibold tabular-nums text-neutral-900">
                {item.pct.toFixed(2)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
