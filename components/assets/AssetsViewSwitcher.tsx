"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { AccountCard, type HoldingWithLive } from "./AccountCard";
import { fmtKRWShort, fmtKRW, fmtUSD, fmtNum } from "@/lib/utils/format";

export type EnrichedAccount = {
  account: { id: string; type: string; broker: string | null; nickname: string | null };
  capturedAt: string | null;
  holdings: HoldingWithLive[];
  totalEvalKrw: number;
  totalCostKrw: number;
};

type Tab = "account" | "type" | "broker" | "security";

const TABS: { id: Tab; label: string }[] = [
  { id: "account", label: "계좌별" },
  { id: "type", label: "유형별" },
  { id: "broker", label: "증권사별" },
  { id: "security", label: "종목별" },
];

const ACCOUNT_LABEL: Record<string, string> = {
  pension_fund: "연저펀",
  isa: "ISA",
  irp: "IRP",
  regular: "일반계좌",
  corp: "법인",
  bank: "은행",
  overseas: "해외증권",
};

const TYPE_COLOR: Record<string, string> = {
  pension_fund: "bg-violet-100 text-violet-700",
  isa: "bg-blue-100 text-blue-700",
  irp: "bg-indigo-100 text-indigo-700",
  regular: "bg-neutral-100 text-neutral-600",
  corp: "bg-orange-100 text-orange-700",
  bank: "bg-green-100 text-green-700",
  overseas: "bg-sky-100 text-sky-700",
};

function GainBadge({ evalKrw, costKrw }: { evalKrw: number; costKrw: number }) {
  if (costKrw <= 0 || evalKrw <= 0) return <span className="text-sm text-neutral-300">—</span>;
  const gain = evalKrw - costKrw;
  const pct = (gain / costKrw) * 100;
  const pos = gain >= 0;
  return (
    <span className={`text-sm font-semibold tabular-nums ${pos ? "text-red-500" : "text-blue-500"}`}>
      {pos ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

function PctBar({ pct, colorClass = "bg-neutral-400" }: { pct: number; colorClass?: string }) {
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between text-xs text-neutral-400">
        <span>전체 비중</span>
        <span>{pct.toFixed(1)}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-neutral-100">
        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
}

export function AssetsViewSwitcher({
  accounts,
  usdKrw,
}: {
  accounts: EnrichedAccount[];
  usdKrw: number;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = (searchParams.get("tab") as Tab | null) ?? "account";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [expandedBroker, setExpandedBroker] = useState<string | null>(null);

  function switchTab(t: Tab) {
    setTab(t);
    router.replace(`/assets?tab=${t}`, { scroll: false });
  }
  const isEmpty = accounts.length === 0;
  const totalEval = accounts.reduce((s, a) => s + a.totalEvalKrw, 0);

  // ── 유형별 ────────────────────────────────────────────────────────────────────
  const byType = useMemo(() => {
    const map = new Map<string, { evalKrw: number; costKrw: number; count: number }>();
    for (const { account, totalEvalKrw, totalCostKrw } of accounts) {
      const k = account.type;
      const p = map.get(k) ?? { evalKrw: 0, costKrw: 0, count: 0 };
      map.set(k, { evalKrw: p.evalKrw + totalEvalKrw, costKrw: p.costKrw + totalCostKrw, count: p.count + 1 });
    }
    return [...map.entries()]
      .sort(([, a], [, b]) => b.evalKrw - a.evalKrw)
      .map(([type, v]) => ({ type, ...v, pct: totalEval > 0 ? (v.evalKrw / totalEval) * 100 : 0 }));
  }, [accounts, totalEval]);

  // ── 증권사별 ──────────────────────────────────────────────────────────────────
  const byBroker = useMemo(() => {
    const map = new Map<string, {
      evalKrw: number; costKrw: number; count: number; types: string[];
      accts: EnrichedAccount[];
    }>();
    for (const a of accounts) {
      const k = a.account.broker ?? "기타";
      const p = map.get(k) ?? { evalKrw: 0, costKrw: 0, count: 0, types: [], accts: [] };
      p.evalKrw += a.totalEvalKrw;
      p.costKrw += a.totalCostKrw;
      p.count += 1;
      const label = ACCOUNT_LABEL[a.account.type] ?? a.account.type;
      if (!p.types.includes(label)) p.types.push(label);
      p.accts.push(a);
      map.set(k, p);
    }
    return [...map.entries()]
      .sort(([, a], [, b]) => b.evalKrw - a.evalKrw)
      .map(([broker, v]) => ({ broker, ...v, pct: totalEval > 0 ? (v.evalKrw / totalEval) * 100 : 0 }));
  }, [accounts, totalEval]);

  // ── 종목별 ────────────────────────────────────────────────────────────────────
  const bySecurity = useMemo(() => {
    type Entry = {
      name: string;
      ticker: string | null;
      currency: "KRW" | "USD";
      evalKrw: number;
      costKrw: number;
      totalQty: number;
      accts: string[];
    };
    const map = new Map<string, Entry>();
    for (const { account, holdings } of accounts) {
      const acctLabel =
        [account.broker, account.nickname].filter(Boolean).join(" · ") ||
        (ACCOUNT_LABEL[account.type] ?? account.type);
      for (const h of holdings) {
        const key = h.ticker ?? h.raw_name;
        const prev = map.get(key) ?? {
          name: h.raw_name,
          ticker: h.ticker,
          currency: (h.currency === "USD" ? "USD" : "KRW") as "KRW" | "USD",
          evalKrw: 0,
          costKrw: 0,
          totalQty: 0,
          accts: [],
        };
        prev.evalKrw += h.liveEvalKrw ?? 0;
        prev.totalQty += h.quantity;
        if (h.avg_price != null && h.quantity > 0) {
          prev.costKrw += h.currency === "USD"
            ? h.quantity * h.avg_price * usdKrw
            : h.quantity * h.avg_price;
        }
        if (!prev.accts.includes(acctLabel)) prev.accts.push(acctLabel);
        map.set(key, prev);
      }
    }
    return [...map.values()]
      .filter((e) => e.evalKrw > 0)
      .sort((a, b) => b.evalKrw - a.evalKrw);
  }, [accounts, usdKrw]);

  return (
    <section>
      {/* 탭 바 */}
      <div className="mb-4 flex gap-1 rounded-lg bg-neutral-100 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => switchTab(t.id)}
            className={`flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 계좌별 */}
      {tab === "account" && (
        <div className="grid gap-4 lg:grid-cols-2">
          {isEmpty ? (
            <EmptyState />
          ) : (
            accounts.map(({ account, capturedAt, holdings, totalEvalKrw, totalCostKrw }) => (
              <AccountCard
                key={account.id}
                account={account}
                capturedAt={capturedAt}
                holdings={holdings}
                totalEvalKrw={totalEvalKrw}
                totalCostKrw={totalCostKrw}
                usdKrw={usdKrw}
              />
            ))
          )}
        </div>
      )}

      {/* 유형별 */}
      {tab === "type" && (
        <div className="flex flex-col gap-3">
          {byType.map(({ type, evalKrw, costKrw, count, pct }) => (
            <div key={type} className="rounded-xl border border-neutral-200 bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_COLOR[type] ?? "bg-neutral-100 text-neutral-600"}`}>
                    {ACCOUNT_LABEL[type] ?? type}
                  </span>
                  <span className="text-xs text-neutral-400">{count}개 계좌</span>
                </div>
                <GainBadge evalKrw={evalKrw} costKrw={costKrw} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-neutral-400">투자원금</p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-neutral-700">{fmtKRWShort(costKrw)}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-400">평가금</p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-neutral-900">{fmtKRWShort(evalKrw)}</p>
                </div>
              </div>
              <PctBar pct={pct} />
            </div>
          ))}
          {isEmpty && <EmptyState />}
        </div>
      )}

      {/* 증권사별 */}
      {tab === "broker" && (
        <div className="flex flex-col gap-3">
          {byBroker.map(({ broker, evalKrw, costKrw, count, types, pct, accts }) => {
            const open = expandedBroker === broker;
            return (
              <div key={broker} className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
                {/* 헤더 — 클릭 시 펼치기/접기 */}
                <button
                  type="button"
                  onClick={() => setExpandedBroker(open ? null : broker)}
                  className="w-full p-4 text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-neutral-900">{broker}</span>
                        <span className="text-xs text-neutral-400">{count}개 계좌</span>
                        <div className="flex flex-wrap gap-1">
                          {types.map((t) => (
                            <span key={t} className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500">{t}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <GainBadge evalKrw={evalKrw} costKrw={costKrw} />
                      <ChevronDown
                        className={`h-4 w-4 text-neutral-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                      />
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-neutral-400">투자원금</p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums text-neutral-700">{fmtKRWShort(costKrw)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-neutral-400">평가금</p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums text-neutral-900">{fmtKRWShort(evalKrw)}</p>
                    </div>
                  </div>
                  <PctBar pct={pct} />
                </button>

                {/* 펼쳐진 계좌 목록 */}
                {open && (
                  <div className="border-t border-neutral-100">
                    {accts.map(({ account, capturedAt, totalEvalKrw: aEval, totalCostKrw: aCost }) => {
                      const gain = aEval - aCost;
                      const retPct = aCost > 0 ? (gain / aCost) * 100 : null;
                      const pos = (retPct ?? 0) >= 0;
                      return (
                        <div key={account.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-neutral-50">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLOR[account.type] ?? "bg-neutral-100 text-neutral-600"}`}>
                                {ACCOUNT_LABEL[account.type] ?? account.type}
                              </span>
                              {account.nickname && (
                                <span className="text-xs text-neutral-500">{account.nickname}</span>
                              )}
                            </div>
                            {capturedAt && (
                              <p className="mt-0.5 text-xs text-neutral-400">
                                {new Date(capturedAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })} 기준
                              </p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-semibold tabular-nums text-neutral-900">
                              {aEval > 0 ? fmtKRWShort(aEval) : "—"}
                            </p>
                            {retPct != null && (
                              <p className={`text-xs font-medium tabular-nums ${pos ? "text-red-500" : "text-blue-500"}`}>
                                {pos ? "+" : ""}{retPct.toFixed(1)}%
                              </p>
                            )}
                          </div>
                          <Link
                            href={`/assets/holdings/${account.id}`}
                            className="shrink-0 rounded-md border border-neutral-200 px-2.5 py-1.5 text-xs text-neutral-500 hover:bg-neutral-50"
                            onClick={(e) => e.stopPropagation()}
                          >
                            종목
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {isEmpty && <EmptyState />}
        </div>
      )}

      {/* 종목별 */}
      {tab === "security" && (
        <div className="flex flex-col gap-2.5">
          {bySecurity.map((sec) => {
            const gain = sec.evalKrw - sec.costKrw;
            const pct = sec.costKrw > 0 ? (gain / sec.costKrw) * 100 : null;
            const pos = (pct ?? 0) >= 0;
            const share = totalEval > 0 ? (sec.evalKrw / totalEval) * 100 : 0;
            const isUsd = sec.currency === "USD";
            const evalDisplay = isUsd
              ? `$${(sec.evalKrw / usdKrw).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
              : fmtKRWShort(sec.evalKrw);
            const gainDisplay = isUsd
              ? (pos ? "+" : "") + `$${Math.abs(gain / usdKrw).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
              : (pos ? "+" : "") + fmtKRWShort(gain);
            const isCash = sec.name.includes("예수금");
            const qtyDisplay = sec.totalQty > 0 ? `${fmtNum(sec.totalQty)}${isCash ? "건" : "주"}` : null;
            const href = sec.ticker
              ? `/assets/security/${encodeURIComponent(sec.ticker)}`
              : null;
            const isKrx = /^\d{6}$/.test(sec.ticker ?? "");
            const inner = (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-lg font-bold text-neutral-900">{sec.ticker ?? sec.name}</p>
                    {isKrx && sec.name && (
                      <p className="text-sm text-neutral-500 truncate">{sec.name}</p>
                    )}
                  </div>
                  <p className="text-lg font-bold tabular-nums text-neutral-900 shrink-0">{evalDisplay}</p>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="text-sm text-neutral-400">
                    {qtyDisplay ?? ""}
                    {isUsd && qtyDisplay && <span className="ml-1.5 text-neutral-500">· {fmtKRWShort(sec.evalKrw)}</span>}
                  </span>
                  {pct != null ? (
                    <span className={`shrink-0 text-sm font-medium tabular-nums ${pos ? "text-red-500" : "text-blue-500"}`}>
                      {gainDisplay} ({pos ? "+" : ""}{pct.toFixed(1)}%)
                    </span>
                  ) : (
                    <span className="text-sm text-neutral-300">—</span>
                  )}
                </div>
                {share > 0.1 && (
                  <div className="mt-2.5 flex items-center gap-2">
                    <div className="flex-1 h-1 rounded-full bg-neutral-100">
                      <div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.min(share, 100)}%` }} />
                    </div>
                    <span className="text-xs text-neutral-400 tabular-nums w-8 text-right">{share.toFixed(1)}%</span>
                  </div>
                )}
              </>
            );
            return href ? (
              <Link
                key={sec.name}
                href={href}
                className="block rounded-xl border border-neutral-200 bg-white px-4 py-4 active:bg-neutral-50"
              >
                {inner}
              </Link>
            ) : (
              <div key={sec.name} className="rounded-xl border border-neutral-200 bg-white px-4 py-4">
                {inner}
              </div>
            );
          })}
          {bySecurity.length === 0 && (
            <p className="rounded-xl border border-dashed border-neutral-200 py-10 text-center text-sm text-neutral-400">
              종목 데이터가 없습니다.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="col-span-full rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-500">
      아직 계좌가 없어요.{" "}
      <Link className="text-blue-700 underline" href="/assets/upload">
        첫 캡처 업로드
      </Link>
      로 자동 등록됩니다.
    </div>
  );
}
