"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fmtKRW, fmtKRWShort } from "@/lib/utils/format";

const ACCOUNT_TYPE_OPTIONS = [
  { value: "pension_fund", label: "연저펀" },
  { value: "isa", label: "ISA" },
  { value: "irp", label: "IRP" },
  { value: "regular", label: "일반계좌" },
  { value: "corp", label: "법인" },
  { value: "bank", label: "은행" },
  { value: "overseas", label: "해외증권" },
] as const;

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

export type HoldingWithLive = {
  id: string;
  raw_name: string;
  quantity: number;
  avg_price: number | null;
  currency: string;
  ticker: string | null;
  market: string | null;
  isCash: boolean;
  livePrice: number | null;
  livePriceChangePercent: number | null;
  liveCurrency: string | null;
  liveEvalKrw: number | null;
  liveReturnPct: number | null;
};

type Props = {
  account: { id: string; type: string; broker: string | null; nickname: string | null };
  capturedAt: string | null;
  holdings: HoldingWithLive[];
  totalEvalKrw: number;
  totalCostKrw: number;
  usdKrw: number;
};

/** "1.91억원" → "1.91억" / "9011만원" → "9011만" */
function fmtShort(n: number): string {
  return fmtKRWShort(n).replace(/원$/, "");
}

export function AccountCard({ account, capturedAt, holdings, totalEvalKrw, totalCostKrw, usdKrw }: Props) {
  const router = useRouter();

  const [editId, setEditId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState("");
  const [editAvg, setEditAvg] = useState("");
  const [saving, setSaving] = useState(false);

  const [showAccountEdit, setShowAccountEdit] = useState(false);
  const [acctForm, setAcctForm] = useState({
    type: account.type,
    broker: account.broker ?? "",
    nickname: account.nickname ?? "",
  });
  const [acctSaving, setAcctSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  async function saveAccount() {
    setAcctSaving(true);
    try {
      const res = await fetch(`/api/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(acctForm),
      });
      if (!res.ok) throw new Error("저장 실패");
      setShowAccountEdit(false);
      router.refresh();
    } catch {
      alert("저장에 실패했어요.");
    } finally {
      setAcctSaving(false);
    }
  }

  async function deleteAccount() {
    setAcctSaving(true);
    try {
      const res = await fetch(`/api/accounts/${account.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("삭제 실패");
      setShowAccountEdit(false);
      router.refresh();
    } catch {
      alert("삭제에 실패했어요.");
    } finally {
      setAcctSaving(false);
    }
  }

  function startEdit(h: HoldingWithLive) {
    setEditId(h.id);
    setEditQty(String(h.quantity));
    setEditAvg(h.avg_price !== null ? String(h.avg_price) : "");
  }

  async function saveEdit(id: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/holdings/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          quantity: editQty ? Number(editQty) : undefined,
          avg_price: editAvg !== "" ? Number(editAvg) : undefined,
        }),
      });
      if (!res.ok) throw new Error("저장 실패");
      setEditId(null);
      router.refresh();
    } catch {
      alert("저장에 실패했어요.");
    } finally {
      setSaving(false);
    }
  }

  const typeColor = TYPE_COLOR[account.type] ?? "bg-neutral-100 text-neutral-600";

  return (
    <div className="flex flex-col rounded-xl border border-neutral-200 bg-white shadow-sm">
      {/* 계좌 편집 모달 */}
      {showAccountEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h3 className="mb-4 text-base font-semibold">계좌 편집</h3>
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-neutral-700">계좌 유형</span>
                <select
                  value={acctForm.type}
                  onChange={(e) => setAcctForm({ ...acctForm, type: e.target.value })}
                  className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
                >
                  {ACCOUNT_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-neutral-700">증권사/은행</span>
                <input
                  value={acctForm.broker}
                  onChange={(e) => setAcctForm({ ...acctForm, broker: e.target.value })}
                  placeholder="미래에셋, 키움 등"
                  className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-neutral-700">별칭</span>
                <input
                  value={acctForm.nickname}
                  onChange={(e) => setAcctForm({ ...acctForm, nickname: e.target.value })}
                  placeholder="메인 ISA 등 (선택)"
                  className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                onClick={saveAccount}
                disabled={acctSaving}
                className="flex-1 rounded-md bg-neutral-900 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {acctSaving ? "저장 중…" : "저장"}
              </button>
              <button
                onClick={() => { setShowAccountEdit(false); setShowDeleteConfirm(false); }}
                className="rounded-md border border-neutral-300 px-4 py-2 text-sm"
              >
                취소
              </button>
            </div>
            <div className="mt-3 border-t border-neutral-100 pt-3">
              {!showDeleteConfirm ? (
                <button onClick={() => setShowDeleteConfirm(true)} className="text-xs text-red-500 hover:underline">
                  계좌 삭제
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-600">정말 삭제할까요? 종목 데이터도 모두 삭제됩니다.</span>
                  <button
                    onClick={deleteAccount}
                    disabled={acctSaving}
                    className="shrink-0 rounded bg-red-600 px-2 py-0.5 text-xs text-white"
                  >
                    삭제
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 계좌 헤더 */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${typeColor}`}>
              {ACCOUNT_LABEL[account.type] ?? account.type}
            </span>
            <p className="text-sm font-medium text-neutral-700">
              {account.broker ?? "—"}
              {account.nickname ? <span className="text-neutral-400"> · {account.nickname}</span> : null}
            </p>
            {capturedAt && (
              <span className="text-xs text-neutral-400">
                {new Date(capturedAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })} 기준
              </span>
            )}
          </div>
          <div className="flex shrink-0 gap-1.5">
            <button
              onClick={() => {
                setAcctForm({ type: account.type, broker: account.broker ?? "", nickname: account.nickname ?? "" });
                setShowDeleteConfirm(false);
                setShowAccountEdit(true);
              }}
              className="rounded-md border border-neutral-200 px-2.5 py-1.5 text-xs text-neutral-500 hover:bg-neutral-50"
            >
              편집
            </button>
            <Link
              href={`/assets/holdings/${account.id}`}
              className="rounded-md border border-neutral-200 px-2.5 py-1.5 text-xs text-neutral-500 hover:bg-neutral-50"
            >
              종목 편집
            </Link>
          </div>
        </div>

        {/* 통계 한 줄 */}
        {(() => {
          const gain = totalEvalKrw - totalCostKrw;
          const pct = totalCostKrw > 0 ? (gain / totalCostKrw) * 100 : null;
          const pos = gain >= 0;
          return (
            <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-base tabular-nums">
              {totalCostKrw > 0 && (
                <>
                  <span className="text-neutral-400">원금</span>
                  <span className="font-semibold text-neutral-700">{fmtKRWShort(totalCostKrw)}</span>
                  <span className="text-neutral-300">·</span>
                </>
              )}
              <span className="text-neutral-400">평가</span>
              <span className="font-semibold text-neutral-900">
                {totalEvalKrw > 0 ? fmtKRWShort(totalEvalKrw) : "—"}
              </span>
              {pct !== null && totalEvalKrw > 0 && (
                <>
                  <span className="text-neutral-300">·</span>
                  <span className={`font-semibold ${pos ? "text-red-500" : "text-blue-500"}`}>
                    {pos ? "+" : ""}{pct.toFixed(1)}%
                  </span>
                  <span className={pos ? "text-red-400" : "text-blue-400"}>
                    {pos ? "+" : ""}{fmtKRWShort(gain)}
                  </span>
                </>
              )}
            </div>
          );
        })()}
      </div>

      {/* 종목 목록 */}
      {holdings.length > 0 && (
        <div className="border-t border-neutral-100">
          <div className="divide-y divide-neutral-50">
            {[...holdings].sort((a, b) => (a.isCash === b.isCash ? 0 : a.isCash ? 1 : -1)).map((h) => {
              if (editId === h.id) {
                // 인라인 편집 행
                return (
                  <div key={h.id} className="grid grid-cols-[1fr_auto_auto] gap-x-3 items-center px-4 py-3 bg-blue-50">
                    <div className="text-sm font-medium text-neutral-700">{h.raw_name}</div>
                    <div className="flex flex-col gap-1 w-14">
                      <input
                        type="number"
                        value={editQty}
                        onChange={(e) => setEditQty(e.target.value)}
                        placeholder="수량"
                        className="w-full rounded border border-blue-300 px-1.5 py-1 text-right text-xs"
                      />
                      <input
                        type="number"
                        value={editAvg}
                        onChange={(e) => setEditAvg(e.target.value)}
                        placeholder="평단"
                        className="w-full rounded border border-blue-300 px-1.5 py-1 text-right text-xs"
                      />
                    </div>
                    <div className="flex flex-col gap-1 w-24 items-end">
                      <button
                        onClick={() => saveEdit(h.id)}
                        disabled={saving}
                        className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
                      >
                        저장
                      </button>
                      <button
                        onClick={() => setEditId(null)}
                        className="rounded border border-neutral-300 px-2.5 py-1 text-xs text-neutral-500"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                );
              }

              if (h.isCash) {
                // 예수금 행 — 한 줄
                const balanceStr =
                  h.avg_price !== null
                    ? h.currency === "USD"
                      ? `$${h.avg_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                      : fmtKRW(h.avg_price)
                    : "—";
                return (
                  <div
                    key={h.id}
                    className="flex items-center gap-2 px-4 py-2 bg-neutral-50/60"
                  >
                    <span className="flex-1 truncate text-xs text-neutral-500">
                      {h.raw_name} · {h.currency}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-neutral-400">{balanceStr}</span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-neutral-700">
                      {h.liveEvalKrw != null ? fmtKRWShort(h.liveEvalKrw) : "—"}
                    </span>
                  </div>
                );
              }

              // 일반 종목 행 — 한 줄 (수량·원금·평가·수익금·수익율)
              // 미국 주식은 티커, 한국 주식은 종목명 표시
              const displayName =
                h.market !== "KRX" && h.ticker ? h.ticker : h.raw_name;

              const changeSign = (h.livePriceChangePercent ?? 0) >= 0;
              const returnSign = (h.liveReturnPct ?? 0) >= 0;

              // 원금(KRW) 계산: USD 종목은 avg_price × qty × usdKrw
              const costKrw =
                h.avg_price !== null
                  ? h.market !== "KRX"
                    ? h.avg_price * h.quantity * usdKrw
                    : h.avg_price * h.quantity
                  : null;
              const gainKrw =
                costKrw !== null && h.liveEvalKrw !== null
                  ? h.liveEvalKrw - costKrw
                  : null;

              return (
                <div
                  key={h.id}
                  onClick={() => startEdit(h)}
                  className="flex items-center gap-1.5 px-4 py-2 cursor-pointer hover:bg-neutral-50 transition-colors"
                >
                  {/* 종목명(또는 티커) + 당일등락률 */}
                  <div className="flex min-w-0 flex-1 items-center gap-1">
                    <span className="truncate text-sm font-medium text-neutral-900">{displayName}</span>
                    {h.livePriceChangePercent != null && (
                      <span className={`shrink-0 text-[11px] tabular-nums ${changeSign ? "text-red-500" : "text-blue-500"}`}>
                        {changeSign ? "▲" : "▼"}{Math.abs(h.livePriceChangePercent).toFixed(2)}%
                      </span>
                    )}
                  </div>

                  {/* 수량·원금·평가·수익금·수익율 */}
                  <div className="flex shrink-0 items-center gap-1 text-[11px] tabular-nums">
                    <span className="text-neutral-400">{h.quantity.toLocaleString()}주</span>

                    {costKrw !== null && (
                      <>
                        <span className="text-neutral-200">·</span>
                        <span className="text-neutral-400">원{fmtShort(costKrw)}</span>
                      </>
                    )}

                    {h.liveEvalKrw !== null && (
                      <>
                        <span className="text-neutral-200">·</span>
                        <span className="font-medium text-neutral-700">평{fmtShort(h.liveEvalKrw)}</span>
                      </>
                    )}

                    {gainKrw !== null && (
                      <>
                        <span className="text-neutral-200">·</span>
                        <span className={gainKrw >= 0 ? "text-red-500" : "text-blue-500"}>
                          {gainKrw >= 0 ? "+" : ""}{fmtShort(gainKrw)}
                        </span>
                      </>
                    )}

                    {h.liveReturnPct !== null && (
                      <span className={`font-semibold ${returnSign ? "text-red-500" : "text-blue-500"}`}>
                        {returnSign ? "+" : ""}{h.liveReturnPct.toFixed(1)}%
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 홀딩 없음 */}
      {holdings.length === 0 && (
        <div className="px-5 pb-5 pt-2">
          <p className="text-xs text-neutral-400">
            종목 없음 —{" "}
            <Link href={`/assets/holdings/${account.id}`} className="text-blue-600 underline">
              편집하기
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
