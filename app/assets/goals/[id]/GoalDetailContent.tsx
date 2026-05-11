"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, X, BarChart2, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fmtKRWShort } from "@/lib/utils/format";

// ── 타입 ─────────────────────────────────────────────────────────────────────

type Goal = {
  id: string;
  name: string;
  target_krw: number | null;
  color: string;
};

type TickerMap = {
  id: string;
  ticker: string;
  market: string;
  account_type_filter: string | null;
  display_label: string | null;
};

// portfolio_daily_snapshots.breakdown.accounts[].holdings 구조
type PortfolioHolding = {
  raw_name: string;
  ticker: string | null;
  market: string | null;
  currency: string;
  eval_krw: number;
  cost_krw?: number;
  qty?: number;
};

type PortfolioAccount = {
  account_id: string;
  broker: string | null;
  type: string;
  nickname: string | null;
  total_krw: number;
  holdings: PortfolioHolding[];
};

// 목표 보유 현황 그룹 (계좌유형별)
type LiveAccountGroup = {
  account_type: string;
  broker: string | null;
  holdings: {
    raw_name: string;
    ticker: string;
    market: string;
    qty: number;
    currency: string;
    eval_krw: number;
    cost_krw: number;
  }[];
  group_total: number;
  group_cost: number;
};

type PortfolioSnapshotDate = string | null;

// ── 계좌 유형 레이블 ──────────────────────────────────────────────────────────

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  pension_fund: "연금저축펀드",
  isa: "ISA",
  irp: "IRP",
  regular: "일반계좌",
  corp: "법인",
  bank: "은행",
  overseas: "해외직투",
};

const MARKETS = ["KRX", "NYSE", "NASDAQ", "AMEX", "TSE"];
const ACCOUNT_TYPES = [
  { value: "", label: "전체 계좌" },
  { value: "pension_fund", label: "연금저축펀드" },
  { value: "isa", label: "ISA" },
  { value: "irp", label: "IRP" },
  { value: "regular", label: "일반계좌" },
  { value: "overseas", label: "해외직투" },
  { value: "corp", label: "법인" },
  { value: "bank", label: "은행" },
];

// ── 진행률 바 ─────────────────────────────────────────────────────────────────

function ProgressBar({ current, target, color }: { current: number; target: number; color: string }) {
  const pct = Math.min((current / target) * 100, 100);
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-neutral-100">
      <div className="h-2.5 rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

// ── 보유 종목 타입 ────────────────────────────────────────────────────────────

type UserHolding = {
  raw_name: string;
  ticker: string;
  market: string;
  account_type: string;
  selKey: string; // `${ticker}::${market}::${account_type}` — 선택 식별자
};

// ── 목표 이름 기반 추천 로직 ──────────────────────────────────────────────────

function getRecommendedKeys(goalName: string, holdings: UserHolding[]): Set<string> {
  const g = goalName.toLowerCase();
  return new Set(
    holdings
      .filter((h) => {
        const raw = h.raw_name.toLowerCase();
        const t   = h.ticker.toLowerCase();
        // 티커 직접 언급 (예: "SCHD 3억", "QQQ 모으기")
        if (g.includes(t)) return true;
        // 나스닥
        if (/나스닥|nasdaq/.test(g) && /나스닥|nasdaq/.test(raw)) return true;
        // S&P500
        if (/s&p|sp500/.test(g) && /s&p|sp500|s&p500/.test(raw)) return true;
        // 배당 (커버드콜 제외)
        if (/배당/.test(g) && !/커버드콜/.test(g) && /배당/.test(raw) && !/커버드콜/.test(raw)) return true;
        // 커버드콜
        if (/커버드콜/.test(g) && /커버드콜/.test(raw)) return true;
        // 미국 직투 — 종목명에 미국/미국직투 언급 + 미국 거래소
        if (/미국직투|미국주식/.test(g) && ["NYSE", "NASDAQ", "AMEX"].includes(h.market)) return true;
        return false;
      })
      .map((h) => h.selKey),
  );
}

// ── 종목 행 (체크박스 + 이름 + 추천 뱃지) ────────────────────────────────────

function HoldingRow({
  h,
  isAdded,
  isSelected,
  isRecommended,
  onToggle,
}: {
  h: UserHolding;
  isAdded: boolean;
  isSelected: boolean;
  isRecommended: boolean;
  onToggle: (key: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => !isAdded && onToggle(h.selKey)}
      disabled={isAdded}
      className={`flex w-full items-center gap-3 border-t border-neutral-100 px-3 py-2.5 text-left transition-colors ${
        isAdded
          ? "cursor-default opacity-40"
          : isSelected
          ? "bg-amber-50"
          : "hover:bg-neutral-50"
      }`}
    >
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] text-white transition-colors ${
          isSelected ? "border-amber-500 bg-amber-500" : "border-neutral-300 bg-white"
        }`}
      >
        {isSelected && "✓"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm text-neutral-800">{h.raw_name}</span>
          {isRecommended && !isAdded && (
            <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">
              추천
            </span>
          )}
        </span>
        <span className="text-xs text-neutral-400">{h.ticker} · {h.market}</span>
      </span>
      {isAdded && (
        <span className="shrink-0 text-[10px] text-neutral-400">추가됨</span>
      )}
    </button>
  );
}

// ── 티커 추가 폼 (보유 종목 선택 + 직접 입력) ─────────────────────────────────

function AddTickerForm({
  goalId,
  goalName,
  existingTickers,
  onAdded,
}: {
  goalId: string;
  goalName: string;
  existingTickers: TickerMap[];
  onAdded: () => void;
}) {
  const supabase = createClient();
  const [mode, setMode] = useState<"holdings" | "manual">("holdings");

  // ── 보유 종목 선택 모드 ────────────────────────────────────────────────────
  const [userHoldings, setUserHoldings] = useState<UserHolding[]>([]);
  const [holdingsLoading, setHoldingsLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // ── 직접 입력 모드 ─────────────────────────────────────────────────────────
  const [manualTicker, setManualTicker] = useState("");
  const [manualMarket, setManualMarket] = useState("KRX");
  const [manualAccountType, setManualAccountType] = useState("");
  const [manualLabel, setManualLabel] = useState("");

  // 이미 추가된 키 목록 (ticker::market 기준)
  const alreadyAdded = new Set(
    existingTickers.map((t) => `${t.ticker}::${t.market}`)
  );

  // 추천 키 목록 (보유 종목 로딩 후 계산)
  const recommendedKeys = getRecommendedKeys(goalName, userHoldings);

  // 보유 종목 불러오기 — ticker 기준 중복 제거 (market null인 row 우선 제외)
  useEffect(() => {
    if (mode !== "holdings") return;
    (async () => {
      setHoldingsLoading(true);
      const { data } = await supabase
        .from("holdings")
        .select("raw_name, security_ticker, security_market")
        .not("raw_name", "ilike", "%예수금%")
        .not("security_ticker", "is", null);

      if (data) {
        // ticker 기준으로 Map 구성 — market이 있는 row가 있으면 그걸 우선
        const tickerMap = new Map<string, UserHolding>();
        for (const h of data) {
          const ticker = h.security_ticker!;
          const market = h.security_market ?? "KRX";
          const existing = tickerMap.get(ticker);
          // market이 명시된 row가 있으면 그걸 유지, 없으면 현재 row 저장
          if (!existing || (!existing.market.length && h.security_market)) {
            tickerMap.set(ticker, {
              raw_name: h.raw_name,
              ticker,
              market,
              account_type: "",
              selKey: `${ticker}::${market}`,
            });
          }
        }
        const list = [...tickerMap.values()].sort((a, b) =>
          a.raw_name.localeCompare(b.raw_name, "ko"),
        );
        setUserHoldings(list);
      }
      setHoldingsLoading(false);
    })();
  }, [mode]);

  function toggleSelect(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function selectAll() {
    const available = userHoldings.filter((h) => !alreadyAdded.has(h.selKey));
    setSelected(new Set(available.map((h) => h.selKey)));
  }

  // 선택한 종목들 일괄 추가 — account_type_filter 없이 (전체 계좌 자동 집계)
  async function handleAddSelected() {
    if (!selected.size) return;
    setSaving(true);
    setError("");

    const rows = [...selected].map((key) => {
      const [ticker, market] = key.split("::");
      return { goal_id: goalId, ticker, market, account_type_filter: null };
    });

    const { error: err } = await supabase.from("goal_ticker_map").insert(rows);
    setSaving(false);
    if (err) {
      setError(err.code === "23505" ? "이미 추가된 종목이 포함되어 있어요." : err.message);
      return;
    }
    setSelected(new Set());
    onAdded();
  }

  // 직접 입력 제출
  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!manualTicker.trim()) return;
    setSaving(true);
    setError("");

    const { error: err } = await supabase.from("goal_ticker_map").insert({
      goal_id: goalId,
      ticker: manualTicker.trim().toUpperCase(),
      market: manualMarket,
      account_type_filter: manualAccountType || null,
      display_label: manualLabel.trim() || null,
    });

    setSaving(false);
    if (err) {
      setError(err.code === "23505" ? "이미 추가된 티커입니다." : err.message);
      return;
    }
    setManualTicker("");
    setManualLabel("");
    onAdded();
  }

  return (
    <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-4">
      {/* 모드 탭 */}
      <div className="mb-3 flex gap-1">
        {(["holdings", "manual"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { setMode(m); setError(""); }}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              mode === m
                ? "bg-neutral-900 text-white"
                : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {m === "holdings" ? "보유 종목에서 선택" : "직접 입력"}
          </button>
        ))}
      </div>

      {/* ── 보유 종목 선택 ── */}
      {mode === "holdings" && (
        <div>
          {holdingsLoading ? (
            <p className="py-4 text-center text-sm text-neutral-400">불러오는 중...</p>
          ) : userHoldings.length === 0 ? (
            <p className="py-4 text-center text-sm text-neutral-400">
              등록된 보유 종목이 없어요.
              <br />
              <button
                type="button"
                onClick={() => setMode("manual")}
                className="mt-1 text-amber-500 underline"
              >
                직접 입력
              </button>
              으로 추가해 주세요.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
              {/* 전체 선택 헤더 */}
              <button
                type="button"
                onClick={selectAll}
                className="flex w-full items-center gap-2 border-b border-neutral-100 bg-neutral-50 px-3 py-2 text-left"
              >
                <span className="text-xs font-semibold text-neutral-500">전체 선택</span>
                <span className="text-xs text-neutral-400">
                  ({userHoldings.filter((h) => !alreadyAdded.has(h.selKey)).length}개)
                </span>
              </button>

              <div className="max-h-72 overflow-y-auto">
                {/* 추천 섹션 */}
                {recommendedKeys.size > 0 && (
                  <>
                    <div className="sticky top-0 bg-amber-50 px-3 py-1.5">
                      <span className="text-[11px] font-semibold text-amber-600">
                        ✦ 목표와 관련된 종목
                      </span>
                    </div>
                    {userHoldings
                      .filter((h) => recommendedKeys.has(h.selKey))
                      .map((h) => (
                        <HoldingRow
                          key={h.selKey}
                          h={h}
                          isAdded={alreadyAdded.has(h.selKey)}
                          isSelected={selected.has(h.selKey)}
                          isRecommended
                          onToggle={toggleSelect}
                        />
                      ))}
                    {/* 나머지 구분선 */}
                    {userHoldings.some((h) => !recommendedKeys.has(h.selKey)) && (
                      <div className="bg-neutral-50 px-3 py-1.5">
                        <span className="text-[11px] font-semibold text-neutral-400">기타 보유 종목</span>
                      </div>
                    )}
                  </>
                )}

                {/* 나머지 종목 */}
                {userHoldings
                  .filter((h) => !recommendedKeys.has(h.selKey))
                  .map((h) => (
                    <HoldingRow
                      key={h.selKey}
                      h={h}
                      isAdded={alreadyAdded.has(h.selKey)}
                      isSelected={selected.has(h.selKey)}
                      isRecommended={false}
                      onToggle={toggleSelect}
                    />
                  ))}
              </div>
            </div>
          )}

          {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm text-neutral-500">
              {selected.size > 0 ? `${selected.size}개 선택됨` : "종목을 선택하세요"}
            </span>
            <button
              type="button"
              onClick={handleAddSelected}
              disabled={saving || selected.size === 0}
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-40"
            >
              {saving ? "추가 중..." : `${selected.size > 0 ? `${selected.size}개 ` : ""}추가`}
            </button>
          </div>
        </div>
      )}

      {/* ── 직접 입력 ── */}
      {mode === "manual" && (
        <form onSubmit={handleManualSubmit} className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="티커 (예: SCHD, 448540)"
              value={manualTicker}
              onChange={(e) => setManualTicker(e.target.value)}
              className="flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm uppercase focus:border-amber-400 focus:outline-none"
              required
            />
            <select
              value={manualMarket}
              onChange={(e) => setManualMarket(e.target.value)}
              className="rounded-lg border border-neutral-200 bg-white px-2 py-2 text-sm focus:border-amber-400 focus:outline-none"
            >
              {MARKETS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <select
              value={manualAccountType}
              onChange={(e) => setManualAccountType(e.target.value)}
              className="flex-1 rounded-lg border border-neutral-200 bg-white px-2 py-2 text-sm focus:border-amber-400 focus:outline-none"
            >
              {ACCOUNT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="표시명 (선택)"
              value={manualLabel}
              onChange={(e) => setManualLabel(e.target.value)}
              className="flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={saving || !manualTicker.trim()}
            className="self-end rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-40"
          >
            {saving ? "추가 중..." : "추가"}
          </button>
        </form>
      )}
    </div>
  );
}

// ── portfolio snapshot → goal live breakdown 계산 ─────────────────────────────

function buildLiveBreakdown(
  accounts: PortfolioAccount[],
  goalTickers: TickerMap[],
): LiveAccountGroup[] {
  const groupMap = new Map<string, LiveAccountGroup>();

  for (const acc of accounts) {
    for (const h of acc.holdings) {
      if (!h.ticker) continue;

      // goal_ticker_map에 매칭되는지 확인
      const matched = goalTickers.some(
        (gt) =>
          gt.ticker === h.ticker &&
          gt.market === (h.market ?? "") &&
          (gt.account_type_filter == null || gt.account_type_filter === acc.type),
      );
      if (!matched) continue;

      const key = `${acc.type}::${acc.broker ?? ""}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          account_type: acc.type,
          broker: acc.broker,
          holdings: [],
          group_total: 0,
          group_cost: 0,
        });
      }

      const evalKrw = h.eval_krw;
      const costKrw = h.cost_krw ?? evalKrw; // 구버전 스냅샷엔 cost_krw 없을 수 있음

      const group = groupMap.get(key)!;
      group.holdings.push({
        raw_name: h.raw_name,
        ticker: h.ticker,
        market: h.market ?? "",
        qty: h.qty ?? 0,
        currency: h.currency,
        eval_krw: evalKrw,
        cost_krw: costKrw,
      });
      group.group_total += evalKrw;
      group.group_cost += costKrw;
    }
  }

  return [...groupMap.values()];
}

// ── 계좌유형 표시 순서 & 색상 ─────────────────────────────────────────────────

const ACCOUNT_TYPE_ORDER = [
  "overseas", "pension_fund", "isa", "irp", "regular", "corp", "bank",
];

const ACCOUNT_TYPE_BG: Record<string, string> = {
  overseas:     "bg-rose-50",
  pension_fund: "bg-sky-50",
  isa:          "bg-emerald-50",
  irp:          "bg-violet-50",
  regular:      "bg-amber-50",
  corp:         "bg-orange-50",
  bank:         "bg-neutral-50",
};

// ── 계좌유형별 holdings 테이블 ────────────────────────────────────────────────

function HoldingsTable({
  groups,
  snapshotDate,
}: {
  groups: LiveAccountGroup[];
  snapshotDate: PortfolioSnapshotDate;
}) {
  if (!groups.length) {
    return (
      <div className="rounded-xl border border-neutral-100 bg-white p-6 text-center text-sm text-neutral-400">
        추적 종목을 보유한 계좌가 없어요.
        <br />
        아래에서 종목을 추가하고 포트폴리오에 등록되어 있는지 확인해 주세요.
      </div>
    );
  }

  const grandTotal = groups.reduce((s, g) => s + g.group_total, 0);
  const grandCost  = groups.reduce((s, g) => s + g.group_cost, 0);
  const grandPnl   = grandTotal - grandCost;

  // ── 계좌유형으로 1차 그룹화 ───────────────────────────────────────────────
  const byType = new Map<string, LiveAccountGroup[]>();
  for (const g of groups) {
    if (!byType.has(g.account_type)) byType.set(g.account_type, []);
    byType.get(g.account_type)!.push(g);
  }
  const sortedTypes = [...byType.keys()].sort((a, b) => {
    const oa = ACCOUNT_TYPE_ORDER.indexOf(a);
    const ob = ACCOUNT_TYPE_ORDER.indexOf(b);
    return (oa === -1 ? 99 : oa) - (ob === -1 ? 99 : ob);
  });

  return (
    <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">

      {/* ── 모바일: 계좌유형 요약 카드 2열 그리드 ── */}
      <div className="grid grid-cols-2 gap-px bg-neutral-200 md:hidden">
        {sortedTypes.map((accountType) => {
          const brokerGroups = byType.get(accountType)!;
          const typeTotal = brokerGroups.reduce((s, g) => s + g.group_total, 0);
          const typeCost  = brokerGroups.reduce((s, g) => s + g.group_cost, 0);
          const typePnl   = typeTotal - typeCost;
          const bgCls     = ACCOUNT_TYPE_BG[accountType] ?? "bg-neutral-50";
          return (
            <div key={accountType} className={`flex flex-col gap-0.5 px-3 py-3 ${bgCls}`}>
              <p className="text-[11px] font-bold tracking-wide text-neutral-500">
                {ACCOUNT_TYPE_LABEL[accountType] ?? accountType}
              </p>
              <p className="text-base font-bold tabular-nums text-neutral-900">
                {fmtKRWShort(typeTotal)}
              </p>
              <p className={`text-xs tabular-nums font-medium ${typePnl >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                {typePnl >= 0 ? "+" : ""}{fmtKRWShort(typePnl)}
                {typeCost > 0 && (
                  <span className="ml-1 opacity-70">
                    ({typePnl >= 0 ? "+" : ""}{((typePnl / typeCost) * 100).toFixed(2)}%)
                  </span>
                )}
              </p>
            </div>
          );
        })}
      </div>

      {/* ── 데스크톱: 왼쪽 레이블 + 종목 상세 ── */}
      <div className="hidden md:block">
        {sortedTypes.map((accountType) => {
          const brokerGroups = byType.get(accountType)!;
          const bgCls = ACCOUNT_TYPE_BG[accountType] ?? "bg-neutral-50";

          return (
            <div key={accountType} className="flex border-t border-neutral-200 first:border-t-0">
              {/* 왼쪽 레이블 */}
              <div className={`flex w-14 shrink-0 items-center justify-center border-r border-neutral-200 ${bgCls}`}>
                <span
                  className="text-[11px] font-bold tracking-widest text-neutral-500"
                  style={{ writingMode: "vertical-lr" }}
                >
                  {ACCOUNT_TYPE_LABEL[accountType] ?? accountType}
                </span>
              </div>

              {/* 종목 행 */}
              <div className="flex-1 overflow-hidden">
                {brokerGroups.flatMap((group) =>
                  group.holdings.map((h, i) => {
                    const pnl    = h.eval_krw - h.cost_krw;
                    const pnlPct = h.cost_krw > 0 ? (pnl / h.cost_krw) * 100 : 0;
                    return (
                      <div
                        key={`${group.broker}-${h.ticker}-${i}`}
                        className="flex items-center gap-3 border-b border-neutral-100 px-3 py-2.5 last:border-b-0"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-neutral-800">{h.raw_name}</p>
                          <p className="text-xs text-neutral-400">
                            {group.broker && <span className="mr-1.5">{group.broker} ·</span>}
                            {h.ticker}
                            {h.qty > 0 && (
                              <> · {h.qty.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}주</>
                            )}
                            {h.currency !== "KRW" && (
                              <span className="ml-1 text-neutral-300">{h.currency}</span>
                            )}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold tabular-nums text-neutral-800">
                            {fmtKRWShort(h.eval_krw)}
                          </p>
                          <p className={`text-xs tabular-nums ${pnl >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                            {pnl >= 0 ? "+" : ""}{fmtKRWShort(pnl)}
                            <span className="ml-1 opacity-70">
                              ({pnl >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%)
                            </span>
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 합계 행 */}
      <div className="flex items-center justify-between border-t-2 border-neutral-200 px-4 py-3">
        <div>
          <span className="text-sm font-bold text-neutral-700">합계</span>
          {snapshotDate && (
            <span className="ml-2 text-xs text-neutral-400">기준 {snapshotDate}</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-right">
          <span className="text-base font-bold tabular-nums text-neutral-900">
            {fmtKRWShort(grandTotal)}
          </span>
          <span className={`text-sm tabular-nums ${grandPnl >= 0 ? "text-emerald-600" : "text-red-500"}`}>
            {grandPnl >= 0 ? "+" : ""}{fmtKRWShort(grandPnl)}
            <span className="ml-1 text-xs opacity-70">
              ({grandCost > 0
                ? `${grandPnl >= 0 ? "+" : ""}${((grandPnl / grandCost) * 100).toFixed(2)}%`
                : "—"})
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export function GoalDetailContent({ goalId }: { goalId: string }) {
  const supabase = createClient();
  const [goal, setGoal] = useState<Goal | null>(null);
  const [tickers, setTickers] = useState<TickerMap[]>([]);
  const [liveGroups, setLiveGroups] = useState<LiveAccountGroup[]>([]);
  const [snapshotDate, setSnapshotDate] = useState<PortfolioSnapshotDate>(null);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [notFound, setNotFound] = useState(false);

  async function load() {
    setLoading(true);

    // ① 목표 정보
    const { data: goalData } = await supabase
      .from("investment_goals")
      .select("id, name, target_krw, color")
      .eq("id", goalId)
      .single();

    if (!goalData) { setNotFound(true); setLoading(false); return; }
    setGoal(goalData);

    // ② 티커 맵
    const { data: tickerData } = await supabase
      .from("goal_ticker_map")
      .select("id, ticker, market, account_type_filter, display_label")
      .eq("goal_id", goalId)
      .order("market")
      .order("ticker");
    const tickerList = tickerData ?? [];
    setTickers(tickerList);

    // ③ 최신 포트폴리오 스냅샷 → live breakdown 계산
    if (tickerList.length) {
      const { data: portfolioSnap } = await supabase
        .from("portfolio_daily_snapshots")
        .select("snapshot_date, breakdown")
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .single();

      if (portfolioSnap?.breakdown?.accounts) {
        const groups = buildLiveBreakdown(
          portfolioSnap.breakdown.accounts as PortfolioAccount[],
          tickerList,
        );
        setLiveGroups(groups);
        setSnapshotDate(portfolioSnap.snapshot_date);
      }
    }

    setLoading(false);
  }

  useEffect(() => { load(); }, [goalId]);

  async function handleDeleteTicker(id: string) {
    await supabase.from("goal_ticker_map").delete().eq("id", id);
    load();
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <p className="text-neutral-500">목표를 찾을 수 없어요.</p>
        <Link href="/assets/goals" className="mt-2 inline-flex items-center gap-1 text-sm text-amber-500">
          <ArrowLeft className="h-4 w-4" /> 목표 목록으로
        </Link>
      </div>
    );
  }

  if (loading || !goal) {
    return (
      <div className="flex h-48 items-center justify-center text-neutral-400">불러오는 중...</div>
    );
  }

  // live breakdown 에서 합계 계산
  const current = liveGroups.reduce((s, g) => s + g.group_total, 0);
  const costBasis = liveGroups.reduce((s, g) => s + g.group_cost, 0);
  const pnl = current - costBasis;
  const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* 뒤로가기 */}
      <Link
        href="/assets/goals"
        className="mb-4 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800"
      >
        <ArrowLeft className="h-4 w-4" /> 목표 목록
      </Link>

      {/* 목표 헤더 */}
      <div className="mb-5 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full" style={{ background: goal.color }} />
          <h1 className="text-xl font-bold text-neutral-900">{goal.name}</h1>
        </div>

        <div className="mt-3 flex items-end gap-4">
          <div>
            <p className="text-2xl font-bold tabular-nums text-neutral-900">
              {current > 0 ? fmtKRWShort(current) : "—"}
            </p>
            {Number(goal.target_krw) > 0 && (
              <p className="text-sm text-neutral-400">목표 {fmtKRWShort(Number(goal.target_krw))}</p>
            )}
          </div>
          {current > 0 && pnlPct !== null && (
            <div className="pb-0.5 text-right">
              <p className={`text-base font-semibold tabular-nums ${pnl >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                {pnl >= 0 ? "+" : ""}{fmtKRWShort(pnl)}
              </p>
              <p className={`text-sm ${pnl >= 0 ? "text-emerald-500" : "text-red-400"}`}>
                {pnl >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
              </p>
            </div>
          )}
        </div>

        {Number(goal.target_krw) > 0 && current > 0 && (
          <div className="mt-3">
            <ProgressBar current={current} target={Number(goal.target_krw)} color={goal.color} />
            <p className="mt-1 text-right text-xs text-neutral-400">
              {((current / Number(goal.target_krw)) * 100).toFixed(1)}% 달성
              · 잔여 {fmtKRWShort(Math.max(0, Number(goal.target_krw) - current))}
            </p>
          </div>
        )}

        {/* 성과 차트 링크 */}
        <Link
          href={`/assets/goals/${goal.id}/performance`}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600 hover:border-amber-400 hover:text-amber-600"
        >
          <BarChart2 className="h-4 w-4" />
          월간 투자성과 차트
          <TrendingUp className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* 보유 현황 테이블 */}
      <div className="mb-5">
        <h2 className="mb-2 text-sm font-semibold text-neutral-600">보유 현황</h2>
        <HoldingsTable groups={liveGroups} snapshotDate={snapshotDate} />
      </div>

      {/* 티커 목록 */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-600">
            추적 종목 ({tickers.length})
          </h2>
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="flex items-center gap-1 text-sm text-amber-500 hover:text-amber-700"
          >
            <Plus className="h-4 w-4" />
            종목 추가
          </button>
        </div>

        {showAddForm && (
          <div className="mb-3">
            <AddTickerForm
              goalId={goalId}
              goalName={goal.name}
              existingTickers={tickers}
              onAdded={() => { setShowAddForm(false); load(); }}
            />
          </div>
        )}

        {tickers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-200 p-4 text-center text-sm text-neutral-400">
            아직 추적 종목이 없어요. 위 버튼으로 추가해 주세요.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
            {tickers.map((t, i) => (
              <div
                key={t.id}
                className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-neutral-100" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-neutral-800">
                    {t.display_label ?? t.ticker}
                  </p>
                  <p className="text-xs text-neutral-400">
                    {t.ticker} · {t.market}
                    {t.account_type_filter && (
                      <span className="ml-2 rounded bg-neutral-100 px-1 py-0.5 text-[10px]">
                        {ACCOUNT_TYPE_LABEL[t.account_type_filter] ?? t.account_type_filter}
                      </span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteTicker(t.id)}
                  className="shrink-0 rounded p-1 text-neutral-300 hover:text-red-400"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
