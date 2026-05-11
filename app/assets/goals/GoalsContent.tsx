"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Plus, Target, ChevronRight, Trash2, Pencil, Check, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fmtKRWShort } from "@/lib/utils/format";

// ── 타입 ─────────────────────────────────────────────────────────────────────

type Goal = {
  id: string;
  name: string;
  target_krw: number | null;
  color: string;
  sort_order: number;
};

type TickerEntry = {
  goal_id: string;
  ticker: string;
  market: string;
  account_type_filter: string | null;
};

type PortfolioHolding = {
  ticker: string | null;
  market: string | null;
  currency: string;
  eval_krw: number;
  cost_krw?: number;
};

type PortfolioAccount = {
  type: string;
  holdings: PortfolioHolding[];
};

type GoalLive = {
  totalKrw: number;
  costKrw: number;
};

// ── 목표별 live 합계 계산 ──────────────────────────────────────────────────────

function computeGoalLive(
  accounts: PortfolioAccount[],
  tickers: TickerEntry[],
): GoalLive {
  let totalKrw = 0;
  let costKrw = 0;
  for (const acc of accounts) {
    for (const h of acc.holdings) {
      if (!h.ticker) continue;
      const matched = tickers.some(
        (t) =>
          t.ticker === h.ticker &&
          t.market === (h.market ?? "") &&
          (t.account_type_filter == null || t.account_type_filter === acc.type),
      );
      if (!matched) continue;
      totalKrw += h.eval_krw;
      costKrw += h.cost_krw ?? h.eval_krw;
    }
  }
  return { totalKrw, costKrw };
}

// ── 색상 팔레트 ───────────────────────────────────────────────────────────────

const COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444",
  "#8b5cf6", "#3b82f6", "#ec4899", "#14b8a6",
];

// ── 상단 대시보드 ─────────────────────────────────────────────────────────────

function GoalsDashboard({
  goals,
  liveMap,
  snapshotDate,
}: {
  goals: Goal[];
  liveMap: Map<string, GoalLive>;
  snapshotDate: string | null;
}) {
  const totalCurrent = goals.reduce((s, g) => s + (liveMap.get(g.id)?.totalKrw ?? 0), 0);
  const totalTarget  = goals.reduce((s, g) => s + Number(g.target_krw ?? 0), 0);
  const totalCost    = goals.reduce((s, g) => s + (liveMap.get(g.id)?.costKrw ?? 0), 0);
  const totalPnl     = totalCurrent - totalCost;
  const pnlPct       = totalCost > 0 ? (totalPnl / totalCost) * 100 : null;
  const progress     = totalTarget > 0 ? (totalCurrent / totalTarget) * 100 : null;

  const activeGoals = goals.filter((g) => (liveMap.get(g.id)?.totalKrw ?? 0) > 0);

  if (totalCurrent === 0) return null;

  return (
    <div className="mb-5 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      {/* 합산 수치 */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-neutral-400">전체 목표 합산</p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums text-neutral-900">
            {fmtKRWShort(totalCurrent)}
          </p>
          {totalTarget > 0 && (
            <p className="mt-0.5 text-sm text-neutral-400">
              목표 {fmtKRWShort(Number(totalTarget))}
            </p>
          )}
        </div>
        {totalCost > 0 && (
          <div className="shrink-0 text-right">
            <p className={`text-lg font-bold tabular-nums ${totalPnl >= 0 ? "text-emerald-600" : "text-red-500"}`}>
              {totalPnl >= 0 ? "+" : ""}{fmtKRWShort(totalPnl)}
            </p>
            {pnlPct !== null && (
              <p className={`text-sm ${totalPnl >= 0 ? "text-emerald-500" : "text-red-400"}`}>
                {totalPnl >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
              </p>
            )}
            <p className="text-xs text-neutral-400">원금 대비</p>
          </div>
        )}
      </div>

      {/* 전체 진행률 바 */}
      {progress !== null && (
        <div className="mt-4">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-neutral-100">
            <div
              className="h-2.5 rounded-full bg-amber-400 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-xs text-neutral-400">
            <span>전체 달성률</span>
            <span className="tabular-nums">{progress.toFixed(1)}%</span>
          </div>
        </div>
      )}

      {/* 목표별 비중 스택 바 */}
      {activeGoals.length > 0 && (
        <div className="mt-4">
          <div className="flex h-3 overflow-hidden rounded-full">
            {activeGoals.map((g) => {
              const cur = liveMap.get(g.id)?.totalKrw ?? 0;
              return (
                <div
                  key={g.id}
                  style={{ width: `${(cur / totalCurrent) * 100}%`, background: g.color }}
                  title={`${g.name}: ${fmtKRWShort(cur)}`}
                />
              );
            })}
          </div>

          {/* 범례 */}
          <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5">
            {activeGoals.map((g) => {
              const live = liveMap.get(g.id);
              const cur = live?.totalKrw ?? 0;
              const pct = totalCurrent > 0 ? (cur / totalCurrent) * 100 : 0;
              const pnl = (live?.totalKrw ?? 0) - (live?.costKrw ?? 0);
              return (
                <div key={g.id} className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: g.color }}
                  />
                  <span className="min-w-0 truncate text-xs text-neutral-600">{g.name}</span>
                  <span className="shrink-0 tabular-nums text-xs text-neutral-400">
                    {pct.toFixed(0)}%
                  </span>
                  {live?.costKrw && live.costKrw > 0 && (
                    <span className={`shrink-0 text-xs tabular-nums ${pnl >= 0 ? "text-emerald-500" : "text-red-400"}`}>
                      {pnl >= 0 ? "+" : ""}{fmtKRWShort(pnl)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {snapshotDate && (
        <p className="mt-3 text-right text-xs text-neutral-300">기준 {snapshotDate}</p>
      )}
    </div>
  );
}

// ── 목표 카드 ─────────────────────────────────────────────────────────────────

function GoalCard({
  goal,
  live,
  onDelete,
  onSaved,
}: {
  goal: Goal;
  live: GoalLive | null;
  onDelete: (id: string) => void;
  onSaved: (updated: Goal) => void;
}) {
  const supabase = createClient();
  const [editing, setEditing]     = useState(false);
  const [editName, setEditName]   = useState(goal.name);
  const [editBil, setEditBil]     = useState(
    goal.target_krw ? String(Number(goal.target_krw) / 1_0000_0000) : "",
  );
  const [editColor, setEditColor] = useState(goal.color);
  const [saving, setSaving]       = useState(false);

  const current  = live?.totalKrw ?? 0;
  const costKrw  = live?.costKrw ?? 0;
  const pnl      = live ? current - costKrw : null;
  const pnlPct   = costKrw > 0 && pnl !== null ? (pnl / costKrw) * 100 : null;
  const targetKrw = Number(goal.target_krw ?? 0);

  // 금액 목표가 있으면 달성률 바, 없으면 수익률 바 (이름에서 X% 파싱, 없으면 10% 기준)
  const yieldTargetPct = targetKrw === 0
    ? parseFloat(goal.name.match(/(\d+(?:\.\d+)?)%/)?.[1] ?? "10")
    : 0;
  const progress = targetKrw > 0 && current > 0
    ? Math.min((current / targetKrw) * 100, 100)
    : targetKrw === 0 && pnlPct !== null && current > 0
    ? Math.min(Math.max((pnlPct / yieldTargetPct) * 100, 0), 100)
    : null;

  async function handleSave() {
    if (!editName.trim()) return;
    setSaving(true);
    const newTargetKrw = editBil ? Math.round(parseFloat(editBil) * 1_0000_0000) : null;
    const { error } = await supabase
      .from("investment_goals")
      .update({ name: editName.trim(), target_krw: newTargetKrw, color: editColor })
      .eq("id", goal.id);
    setSaving(false);
    if (error) return;
    setEditing(false);
    // 낙관적 업데이트: 재조회 없이 부모 배열을 즉시 갱신
    onSaved({ ...goal, name: editName.trim(), target_krw: newTargetKrw, color: editColor });
  }

  // ── 편집 모드 ──────────────────────────────────────────────────────────────
  if (editing) {
    return (
      <div className="rounded-xl border border-amber-300 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-2">
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
            placeholder="목표 이름"
            autoFocus
          />
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="number"
                value={editBil}
                onChange={(e) => setEditBil(e.target.value)}
                step="0.1"
                min="0"
                placeholder="목표금액 (억원, 미입력 가능)"
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
              />
              {editBil && (
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400">
                  억원
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setEditColor(c)}
                  className="h-6 w-6 rounded-full border-2 transition-transform"
                  style={{
                    background: c,
                    borderColor: editColor === c ? c : "transparent",
                    transform: editColor === c ? "scale(1.2)" : "scale(1)",
                  }}
                />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setEditing(false); setEditName(goal.name); setEditBil(goal.target_krw ? String(Number(goal.target_krw) / 1_0000_0000) : ""); setEditColor(goal.color); }}
              className="flex items-center gap-1 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-50"
            >
              <X className="h-3.5 w-3.5" /> 취소
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !editName.trim()}
              className="flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-40"
            >
              <Check className="h-3.5 w-3.5" /> {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── 일반 모드 ──────────────────────────────────────────────────────────────
  return (
    <div className="relative rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <Link href={`/assets/goals/${goal.id}`} className="block">
        {/* 헤더 */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: goal.color }} />
            <span className="text-base font-semibold text-neutral-800">{goal.name}</span>
          </div>
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
        </div>

        {/* 금액 */}
        <div className="mt-2.5 flex items-end justify-between gap-2">
          <div>
            {current > 0 ? (
              <>
                <p className="text-xl font-bold tabular-nums text-neutral-900">
                  {fmtKRWShort(current)}
                </p>
                {targetKrw > 0 && (
                  <p className="text-xs text-neutral-400">
                    목표 {fmtKRWShort(targetKrw)}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-neutral-400">추적 종목을 추가해 주세요</p>
            )}
          </div>
          {pnl !== null && current > 0 && (
            <div className="shrink-0 text-right">
              <p className={`text-sm font-semibold tabular-nums ${pnl >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                {pnl >= 0 ? "+" : ""}{fmtKRWShort(pnl)}
              </p>
              {pnlPct !== null && (
                <p className={`text-xs ${pnl >= 0 ? "text-emerald-500" : "text-red-400"}`}>
                  {pnl >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
                </p>
              )}
            </div>
          )}
        </div>

        {/* 진행률 바 */}
        {progress !== null && (
          <div className="mt-2">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
              <div
                className="h-1.5 rounded-full transition-all"
                style={{ width: `${progress}%`, background: goal.color }}
              />
            </div>
            <p className="mt-0.5 text-right text-xs text-neutral-400">
              {targetKrw > 0
                ? `${progress.toFixed(1)}% · 잔여 ${fmtKRWShort(Math.max(0, targetKrw - current))}`
                : `수익률 ${pnlPct !== null && pnlPct >= 0 ? "+" : ""}${pnlPct?.toFixed(2) ?? "0.00"}% · 목표 ${yieldTargetPct}%`
              }
            </p>
          </div>
        )}
      </Link>

      {/* 수정 / 삭제 버튼 */}
      <div className="absolute right-3 top-3 flex items-center gap-0.5">
        <button
          onClick={(e) => { e.preventDefault(); setEditing(true); }}
          className="rounded p-1 text-neutral-300 hover:text-amber-500"
          title="수정"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(e) => { e.preventDefault(); onDelete(goal.id); }}
          className="rounded p-1 text-neutral-300 hover:text-red-400"
          title="삭제"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── 새 목표 생성 폼 ───────────────────────────────────────────────────────────

function NewGoalForm({ onCreated }: { onCreated: () => void }) {
  const supabase = createClient();
  const [name, setName]         = useState("");
  const [targetBil, setTargetBil] = useState("");
  const [color, setColor]       = useState(COLORS[0]);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError("");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("로그인 필요"); setSaving(false); return; }

    const targetKrw = targetBil ? Math.round(parseFloat(targetBil) * 1_0000_0000) : null;
    const { error: err } = await supabase.from("investment_goals").insert({
      user_id: user.id,
      name: name.trim(),
      target_krw: targetKrw,
      color,
    });

    setSaving(false);
    if (err) { setError(err.message); return; }
    setName(""); setTargetBil("");
    onCreated();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-dashed border-neutral-300 bg-white p-4">
      <p className="mb-3 text-sm font-semibold text-neutral-700">새 투자 목표</p>
      <div className="flex flex-col gap-2">
        <input
          type="text"
          placeholder='이름 (예: "나스닥 3억 모으기")'
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
          required
        />
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="number"
              placeholder="목표금액 (억원, 미입력 가능)"
              value={targetBil}
              onChange={(e) => setTargetBil(e.target.value)}
              step="0.1"
              min="0"
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
            />
            {targetBil && (
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400">
                억원
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="h-6 w-6 rounded-full border-2 transition-transform"
                style={{
                  background: c,
                  borderColor: color === c ? c : "transparent",
                  transform: color === c ? "scale(1.2)" : "scale(1)",
                }}
              />
            ))}
          </div>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="self-end rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-40"
        >
          {saving ? "저장 중..." : "추가"}
        </button>
      </div>
    </form>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export function GoalsContent() {
  const supabase = createClient();
  const [goals, setGoals]           = useState<Goal[]>([]);
  const [liveMap, setLiveMap]       = useState<Map<string, GoalLive>>(new Map());
  const [snapshotDate, setSnapshotDate] = useState<string | null>(null);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);

  async function load() {
    setLoading(true);

    // ① 목표 목록
    const { data: goalData } = await supabase
      .from("investment_goals")
      .select("id, name, target_krw, color, sort_order")
      .eq("is_active", true)
      .order("sort_order")
      .order("created_at");
    const goalList = goalData ?? [];
    setGoals(goalList);

    if (!goalList.length) { setLoading(false); return; }

    // ② 전체 ticker map (goal 전체)
    const { data: tickerData } = await supabase
      .from("goal_ticker_map")
      .select("goal_id, ticker, market, account_type_filter")
      .in("goal_id", goalList.map((g) => g.id));
    const allTickers = tickerData ?? [];

    // ③ 최신 포트폴리오 스냅샷
    const { data: portfolioSnap } = await supabase
      .from("portfolio_daily_snapshots")
      .select("snapshot_date, breakdown")
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .single();

    if (portfolioSnap?.breakdown?.accounts) {
      const accounts = portfolioSnap.breakdown.accounts as PortfolioAccount[];
      const map = new Map<string, GoalLive>();
      for (const g of goalList) {
        const goalTickers = allTickers.filter((t) => t.goal_id === g.id);
        if (goalTickers.length) {
          map.set(g.id, computeGoalLive(accounts, goalTickers));
        }
      }
      setLiveMap(map);
      setSnapshotDate(portfolioSnap.snapshot_date);
    }

    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(id: string) {
    if (!confirm("이 목표를 삭제할까요? 관련 스냅샷도 모두 삭제됩니다.")) return;
    await supabase.from("investment_goals").delete().eq("id", id);
    load();
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* 헤더 */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-neutral-900">투자 목표</h1>
          <p className="mt-0.5 text-sm text-neutral-500">버킷별 달성 현황 · 매일 07시 업데이트</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-600"
        >
          <Plus className="h-4 w-4" />
          새 목표
        </button>
      </div>

      {/* 생성 폼 */}
      {showForm && (
        <div className="mb-4">
          <NewGoalForm onCreated={() => { setShowForm(false); load(); }} />
        </div>
      )}

      {loading ? (
        <div className="flex h-40 items-center justify-center text-neutral-400">불러오는 중...</div>
      ) : goals.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-200">
          <Target className="h-8 w-8 text-neutral-300" />
          <p className="text-sm text-neutral-400">아직 목표가 없어요</p>
          <button onClick={() => setShowForm(true)} className="text-sm text-amber-500 underline">
            첫 목표 만들기
          </button>
        </div>
      ) : (
        <>
          {/* 대시보드 */}
          <GoalsDashboard goals={goals} liveMap={liveMap} snapshotDate={snapshotDate} />

          {/* 목표 카드 목록 */}
          <div className="flex flex-col gap-3">
            {goals.map((g) => (
              <GoalCard
                key={g.id}
                goal={g}
                live={liveMap.get(g.id) ?? null}
                onDelete={handleDelete}
                onSaved={(updated) =>
                  setGoals((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
