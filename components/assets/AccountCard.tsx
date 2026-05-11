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

  // 종목 상세 모달
  const [detailHolding, setDetailHolding] = useState<HoldingWithLive | null>(null);
  const [editMode, setEditMode] = useState(false);
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

  function openDetail(h: HoldingWithLive) {
    setDetailHolding(h);
    setEditMode(false);
  }

  function openEdit(h: HoldingWithLive) {
    setDetailHolding(h);
    setEditMode(true);
    setEditQty(String(h.quantity));
    setEditAvg(h.avg_price !== null ? String(h.avg_price) : "");
  }

  function closeDetail() {
    setDetailHolding(null);
    setEditMode(false);
  }

  async function saveEdit() {
    if (!detailHolding) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/holdings/${detailHolding.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          quantity: editQty ? Number(editQty) : undefined,
          avg_price: editAvg !== "" ? Number(editAvg) : undefined,
        }),
      });
      if (!res.ok) throw new Error("저장 실패");
      closeDetail();
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
      {/* 종목 상세 모달 */}
      {detailHolding && (() => {
        const h = detailHolding;
        const isUsdMarket = h.market !== null && h.market !== "KRX";
        const costKrw = h.avg_price !== null
          ? isUsdMarket ? h.avg_price * h.quantity * usdKrw : h.avg_price * h.quantity
          : null;
        const gainKrw = costKrw !== null && h.liveEvalKrw !== null ? h.liveEvalKrw - costKrw : null;
        const pos = (gainKrw ?? 0) >= 0;
        const retPos = (h.liveReturnPct ?? 0) >= 0;
        const changePos = (h.livePriceChangePercent ?? 0) >= 0;

        const avgPriceStr = h.avg_price !== null
          ? isUsdMarket
            ? `$${h.avg_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : fmtKRW(h.avg_price)
          : "—";
        const livePriceStr = h.livePrice !== null
          ? isUsdMarket
            ? `$${h.livePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : fmtKRW(h.livePrice)
          : "—";

        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={closeDetail}>
            <div
              className="w-full max-w-sm rounded-t-2xl bg-white px-5 pt-4 pb-8 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 드래그 핸들 */}
              <div className="mb-4 flex justify-center">
                <div className="h-1 w-10 rounded-full bg-neutral-200" />
              </div>

              {/* 종목명 + 닫기 */}
              <div className="mb-4 flex items-start justify-between gap-2">
                <div>
                  <p className="text-lg font-semibold text-neutral-900">{h.raw_name}</p>
                  {h.ticker && (
                    <span className="mt-0.5 inline-block rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-500">
                      {h.ticker}
                    </span>
                  )}
                </div>
                <button onClick={closeDetail} className="shrink-0 rounded-full p-1 text-neutral-400 hover:bg-neutral-100">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {!editMode ? (
                /* ── 상세 보기 ── */
                <>
                  <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-100">
                    {[
                      { label: "보유수량", value: `${h.quantity.toLocaleString()}주` },
                      { label: "평균단가", value: avgPriceStr },
                      { label: "현재가", value: h.livePrice !== null ? (
                        <span>
                          {livePriceStr}
                          {h.livePriceChangePercent != null && (
                            <span className={`ml-1.5 text-xs ${changePos ? "text-red-500" : "text-blue-500"}`}>
                              {changePos ? "▲" : "▼"}{Math.abs(h.livePriceChangePercent).toFixed(2)}%
                            </span>
                          )}
                        </span>
                      ) : "—" },
                      { label: "원금", value: costKrw !== null ? fmtKRWShort(costKrw) : "—" },
                      { label: "평가금", value: h.liveEvalKrw !== null ? fmtKRWShort(h.liveEvalKrw) : "—", bold: true },
                      { label: "손익", value: gainKrw !== null ? (
                        <span className={pos ? "text-red-500" : "text-blue-500"}>
                          {pos ? "+" : ""}{fmtKRWShort(gainKrw)}
                        </span>
                      ) : "—" },
                      { label: "수익율", value: h.liveReturnPct !== null ? (
                        <span className={`font-semibold ${retPos ? "text-red-500" : "text-blue-500"}`}>
                          {retPos ? "+" : ""}{h.liveReturnPct.toFixed(2)}%
                        </span>
                      ) : "—" },
                    ].map(({ label, value, bold }) => (
                      <div key={label} className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-sm text-neutral-500">{label}</span>
                        <span className={`text-sm tabular-nums ${bold ? "font-semibold text-neutral-900" : "text-neutral-800"}`}>
                          {value}
                        </span>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => openEdit(h)}
                    className="mt-4 w-full rounded-xl border border-neutral-200 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                  >
                    수정
                  </button>
                </>
              ) : (
                /* ── 편집 폼 ── */
                <>
                  <div className="flex flex-col gap-3">
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="font-medium text-neutral-700">보유수량</span>
                      <input
                        type="number"
                        value={editQty}
                        onChange={(e) => setEditQty(e.target.value)}
                        placeholder="수량"
                        className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="font-medium text-neutral-700">
                        평균단가{isUsdMarket ? " (USD)" : " (KRW)"}
                      </span>
                      <input
                        type="number"
                        value={editAvg}
                        onChange={(e) => setEditAvg(e.target.value)}
                        placeholder="평단가"
                        className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={saveEdit}
                      disabled={saving}
                      className="flex-1 rounded-xl bg-neutral-900 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {saving ? "저장 중…" : "저장"}
                    </button>
                    <button
                      onClick={() => setEditMode(false)}
                      className="rounded-xl border border-neutral-200 px-5 py-2.5 text-sm text-neutral-600"
                    >
                      취소
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}

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
              <span className="text-neutral-400">평가금</span>
              <span className="font-semibold text-neutral-900">
                {totalEvalKrw > 0 ? fmtKRWShort(totalEvalKrw) : "—"}
              </span>
              {pct !== null && totalEvalKrw > 0 && (
                <>
                  <span className="text-neutral-300">·</span>
                  <span className={pos ? "text-red-400" : "text-blue-400"}>
                    {pos ? "+" : ""}{fmtKRWShort(gain)}
                  </span>
                  <span className={`font-semibold ${pos ? "text-red-500" : "text-blue-500"}`}>
                    {pos ? "+" : ""}{pct.toFixed(1)}%
                  </span>
                </>
              )}
            </div>
          );
        })()}
      </div>

      {/* 종목 목록 — 3컬럼 (보유수·평가·수익율) */}
      {holdings.length > 0 && (
        <div className="border-t border-neutral-100">
          {/* 컬럼 헤더 */}
          <div className="flex items-center gap-x-2 px-4 py-1.5 border-b border-neutral-50 text-[10px] text-neutral-400">
            <span className="flex-1 min-w-0">종목명</span>
            <span className="w-[40px] shrink-0 text-right">보유수</span>
            <span className="w-[56px] shrink-0 text-right">평가</span>
            <span className="w-[52px] shrink-0 text-right">수익율</span>
          </div>

          <div className="divide-y divide-neutral-50">
            {[...holdings].sort((a, b) => (a.isCash === b.isCash ? 0 : a.isCash ? 1 : -1)).map((h) => {
              if (h.isCash) {
                const balanceStr = h.avg_price !== null
                  ? h.currency === "USD"
                    ? `$${h.avg_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                    : fmtKRW(h.avg_price)
                  : "—";
                return (
                  <div key={h.id} className="flex items-center gap-x-2 px-4 py-2 bg-neutral-50/60 text-xs tabular-nums">
                    <span className="flex-1 min-w-0 truncate text-neutral-500">{h.raw_name} · {h.currency}</span>
                    <span className="w-[40px] shrink-0 text-right text-neutral-400">{balanceStr}</span>
                    <span className="w-[56px] shrink-0 text-right font-medium text-neutral-700">
                      {h.liveEvalKrw != null ? fmtShort(h.liveEvalKrw) : "—"}
                    </span>
                    <span className="w-[52px] shrink-0" />
                  </div>
                );
              }

              const displayName = h.market !== "KRX" && h.ticker ? h.ticker : h.raw_name;
              const changeSign = (h.livePriceChangePercent ?? 0) >= 0;
              const returnSign = (h.liveReturnPct ?? 0) >= 0;

              return (
                <div
                  key={h.id}
                  onClick={() => openDetail(h)}
                  className="flex items-center gap-x-2 px-4 py-2.5 cursor-pointer hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
                >
                  {/* 종목명 + 당일등락률 */}
                  <div className="flex min-w-0 flex-1 items-center gap-1">
                    <span className="truncate text-sm font-medium text-neutral-900">{displayName}</span>
                    {h.livePriceChangePercent != null && (
                      <span className={`shrink-0 text-xs tabular-nums ${changeSign ? "text-red-500" : "text-blue-500"}`}>
                        {changeSign ? "▲" : "▼"}{Math.abs(h.livePriceChangePercent).toFixed(2)}%
                      </span>
                    )}
                  </div>
                  {/* 보유수 */}
                  <span className="w-[40px] shrink-0 text-right text-xs tabular-nums text-neutral-500 whitespace-nowrap">
                    {h.quantity.toLocaleString()}주
                  </span>
                  {/* 평가 */}
                  <span className="w-[56px] shrink-0 text-right text-xs tabular-nums font-medium text-neutral-800 whitespace-nowrap">
                    {h.liveEvalKrw !== null ? fmtShort(h.liveEvalKrw) : "—"}
                  </span>
                  {/* 수익율 */}
                  <span className={`w-[52px] shrink-0 text-right text-xs tabular-nums font-semibold whitespace-nowrap ${h.liveReturnPct == null ? "text-neutral-300" : returnSign ? "text-red-500" : "text-blue-500"}`}>
                    {h.liveReturnPct !== null ? `${returnSign ? "+" : ""}${h.liveReturnPct.toFixed(1)}%` : "—"}
                  </span>
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
