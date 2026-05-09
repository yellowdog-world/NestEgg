"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { lookupTicker } from "@/lib/market/ticker-map";

// ── 타입 ─────────────────────────────────────────────────────────────────────

type Holding = {
  raw_name: string;
  ticker?: string;
  quantity: number;
  avg_price: number | null;
  market_price: number | null;
  eval_amount: number | null;
  profit_loss: number | null;
  currency: "KRW" | "USD";
  _delete?: boolean;
};

type ExistingH = {
  id: string;
  raw_name: string;
  quantity: number;
  avg_price: number | null;
  market_price: number | null;
  eval_amount: number | null;
  profit_loss: number | null;
  currency: string;
  security_ticker: string | null;
  security_market: string | null;
};

type ConflictEntry = {
  key: string;
  existing: ExistingH;
  newH: Holding;
  resolution: "merge" | "keep_old" | null;
};

type Props = {
  snapshotId: string;
  accountId: string;
  initial: Holding[];
};

// ── 유틸 ─────────────────────────────────────────────────────────────────────

function matchKey(h: { raw_name: string; security_ticker?: string | null }): string {
  const ticker = h.security_ticker ?? lookupTicker(h.raw_name)?.ticker;
  if (ticker) return `ticker:${ticker.toUpperCase()}`;
  return `name:${h.raw_name.replace(/\s+/g, "").toLowerCase()}`;
}

function mergeHoldings(existing: ExistingH, newH: Holding): Holding {
  const qty = existing.quantity + newH.quantity;
  let avg: number | null = null;
  if (existing.avg_price != null && newH.avg_price != null) {
    avg = (existing.quantity * existing.avg_price + newH.quantity * newH.avg_price) / qty;
  } else {
    avg = existing.avg_price ?? newH.avg_price;
  }
  return {
    raw_name: newH.raw_name || existing.raw_name,
    quantity: qty,
    avg_price: avg,
    market_price: newH.market_price ?? existing.market_price,
    eval_amount: null,
    profit_loss: null,
    currency: newH.currency || (existing.currency as "KRW" | "USD"),
  };
}

function existingToHolding(e: ExistingH): Holding {
  return {
    raw_name: e.raw_name,
    quantity: e.quantity,
    avg_price: e.avg_price,
    market_price: e.market_price,
    eval_amount: e.eval_amount,
    profit_loss: e.profit_loss,
    currency: e.currency as "KRW" | "USD",
  };
}

// ── 숫자 포맷 인풋 ────────────────────────────────────────────────────────────
// 포커스 전: 콤마 포맷 표시 / 포커스 중: 원시값 편집

function NumericInput({
  value,
  onChange,
  placeholder = "—",
  suspect = false,
  decimals = 4,
  signColor = false,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  suspect?: boolean;
  decimals?: number;
  signColor?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const formatted =
    value != null
      ? value.toLocaleString("ko-KR", { maximumFractionDigits: decimals })
      : "";

  const signCls =
    signColor && value != null
      ? value > 0
        ? "text-red-600"
        : value < 0
          ? "text-blue-600"
          : ""
      : "";

  return (
    <input
      type="text"
      inputMode="decimal"
      value={editing ? draft : formatted}
      placeholder={placeholder}
      onFocus={() => {
        setEditing(true);
        setDraft(value != null ? String(value) : "");
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        const n = parseFloat(draft.replace(/,/g, ""));
        onChange(isNaN(n) ? null : n);
      }}
      className={`w-full rounded border px-2 py-1.5 text-right text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-400
        ${suspect ? "border-amber-400 bg-amber-50 font-medium placeholder:text-amber-400" : "border-neutral-200 bg-white"}
        ${!editing && signCls}
      `}
    />
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export function HoldingsEditor({ snapshotId, accountId, initial }: Props) {
  const router = useRouter();
  const [holdings, setHoldings] = useState<Holding[]>(initial);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [conflicts, setConflicts] = useState<ConflictEntry[]>([]);
  const [carryOver, setCarryOver] = useState<ExistingH[]>([]);
  const [showModal, setShowModal] = useState(false);

  // eval_amount 기준 합계 (OCR 원본값, 통화 혼재 가능성 있음)
  const usdTotal = holdings.filter((h) => !h._delete && h.currency === "USD").reduce((s, h) => s + (h.eval_amount ?? 0), 0);
  const krwTotal = holdings.filter((h) => !h._delete && h.currency === "KRW").reduce((s, h) => s + (h.eval_amount ?? 0), 0);

  function update(idx: number, patch: Partial<Holding>) {
    setHoldings((prev) => prev.map((h, i) => (i === idx ? { ...h, ...patch } : h)));
  }
  function add() {
    setHoldings((prev) => [
      ...prev,
      { raw_name: "", ticker: "", quantity: 0, avg_price: null, market_price: null, eval_amount: null, profit_loss: null, currency: "KRW" },
    ]);
  }

  async function callSaveApi(holdingsToSave: Holding[], confirmStatus: boolean) {
    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/snapshots/${snapshotId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          holdings: holdingsToSave.map((h) => ({
            raw_name: h.raw_name,
            ticker: h.ticker || undefined,
            quantity: h.quantity,
            avg_price: h.avg_price,
            market_price: h.market_price,
            eval_amount: h.eval_amount,
            profit_loss: h.profit_loss,
            currency: h.currency,
          })),
          ...(confirmStatus ? { status: "confirmed" } : {}),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "저장 실패");
      if (confirmStatus) router.push("/assets");
      else router.refresh();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "오류");
    } finally {
      setSaving(false);
    }
  }

  async function handleTempSave() {
    await callSaveApi(holdings.filter((h) => !h._delete), false);
  }

  async function handleConfirm() {
    const newList = holdings.filter((h) => !h._delete);
    let existing: ExistingH[] = [];
    try {
      const r = await fetch(`/api/accounts/${accountId}/holdings`);
      const d = await r.json();
      existing = (d.holdings ?? []).map((e: ExistingH) => ({
        ...e,
        quantity: Number(e.quantity),
        avg_price: e.avg_price != null ? Number(e.avg_price) : null,
        market_price: e.market_price != null ? Number(e.market_price) : null,
        eval_amount: e.eval_amount != null ? Number(e.eval_amount) : null,
        profit_loss: e.profit_loss != null ? Number(e.profit_loss) : null,
      }));
    } catch {
      await callSaveApi(newList, true);
      return;
    }
    if (!existing.length) { await callSaveApi(newList, true); return; }

    const matchedExistingKeys = new Set<string>();
    const detected: ConflictEntry[] = [];
    for (const newH of newList) {
      const newKey = matchKey({ raw_name: newH.raw_name });
      const found = existing.find((e) => matchKey(e) === newKey);
      if (found) { detected.push({ key: newKey, existing: found, newH, resolution: null }); matchedExistingKeys.add(matchKey(found)); }
    }
    const carry = existing.filter((e) => !matchedExistingKeys.has(matchKey(e)));
    if (!detected.length) { await callSaveApi([...carry.map(existingToHolding), ...newList], true); return; }
    setConflicts(detected);
    setCarryOver(carry);
    setShowModal(true);
  }

  function resolveAll(resolution: "merge" | "keep_old") {
    setConflicts((prev) => prev.map((c) => ({ ...c, resolution })));
  }

  async function applyResolution() {
    const newList = holdings.filter((h) => !h._delete);
    const conflictNewKeys = new Set(conflicts.map((c) => matchKey({ raw_name: c.newH.raw_name })));
    const final: Holding[] = [];
    for (const newH of newList) {
      const key = matchKey({ raw_name: newH.raw_name });
      const conflict = conflicts.find((c) => c.key === key);
      if (!conflict) { final.push(newH); }
      else if (conflict.resolution === "merge") { final.push(mergeHoldings(conflict.existing, newH)); }
    }
    for (const c of conflicts) { if (c.resolution === "keep_old") final.push(existingToHolding(c.existing)); }
    for (const e of carryOver) final.push(existingToHolding(e));
    setShowModal(false);
    await callSaveApi(final, true);
    void conflictNewKeys; // suppress unused warning
  }

  const allResolved = conflicts.length > 0 && conflicts.every((c) => c.resolution !== null);

  return (
    <div className="flex flex-col gap-4">
      {/* 중복 처리 모달 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-8">
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
            <h3 className="mb-1 text-base font-semibold">이미 등록된 종목이 있어요</h3>
            <p className="mb-4 text-sm text-neutral-500">종목별로 처리 방법을 선택하세요.</p>
            <div className="mb-3 flex gap-2">
              <button onClick={() => resolveAll("merge")} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white">전체 합치기</button>
              <button onClick={() => resolveAll("keep_old")} className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs">전체 기존 유지</button>
            </div>
            <div className="flex flex-col gap-3">
              {conflicts.map((c, i) => (
                <div key={i} className="rounded-lg border border-neutral-200 p-3">
                  <div className="mb-2 font-medium">{c.existing.raw_name}</div>
                  <div className="mb-2 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded bg-neutral-50 p-2">
                      <div className="mb-1 font-medium text-neutral-500">기존</div>
                      <div>수량 {c.existing.quantity.toLocaleString()}</div>
                      {c.existing.avg_price != null && <div>평단가 {c.existing.avg_price.toLocaleString()}</div>}
                    </div>
                    <div className="rounded bg-blue-50 p-2">
                      <div className="mb-1 font-medium text-blue-500">신규</div>
                      <div>수량 {c.newH.quantity.toLocaleString()}</div>
                      {c.newH.avg_price != null && <div>평단가 {c.newH.avg_price.toLocaleString()}</div>}
                    </div>
                  </div>
                  {c.resolution === "merge" && c.existing.avg_price != null && c.newH.avg_price != null && (
                    <div className="mb-2 rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
                      합산 수량 {(c.existing.quantity + c.newH.quantity).toLocaleString()} · 평단가{" "}
                      {((c.existing.quantity * c.existing.avg_price + c.newH.quantity * c.newH.avg_price) / (c.existing.quantity + c.newH.quantity)).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => setConflicts((prev) => prev.map((x, j) => j === i ? { ...x, resolution: "merge" } : x))}
                      className={`flex-1 rounded py-1.5 text-xs font-medium ${c.resolution === "merge" ? "bg-emerald-600 text-white" : "border border-neutral-300"}`}>합치기</button>
                    <button onClick={() => setConflicts((prev) => prev.map((x, j) => j === i ? { ...x, resolution: "keep_old" } : x))}
                      className={`flex-1 rounded py-1.5 text-xs font-medium ${c.resolution === "keep_old" ? "bg-neutral-800 text-white" : "border border-neutral-300"}`}>기존 유지</button>
                  </div>
                </div>
              ))}
            </div>
            {carryOver.length > 0 && <p className="mt-3 text-xs text-neutral-400">중복이 아닌 기존 종목 {carryOver.length}개는 자동으로 유지됩니다.</p>}
            <div className="mt-4 flex gap-2">
              <button onClick={applyResolution} disabled={!allResolved || saving} className="flex-1 rounded-md bg-emerald-600 py-2 text-sm font-medium text-white disabled:opacity-40">
                {saving ? "저장 중…" : "확인 완료"}
              </button>
              <button onClick={() => setShowModal(false)} className="rounded-md border border-neutral-300 px-4 py-2 text-sm">취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 테이블 */}
      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full min-w-[780px] border-collapse text-sm">
          <colgroup>
            <col className="w-[180px]" />
            <col className="w-[80px]" />
            <col className="w-[70px]" />
            <col className="w-[110px]" />
            <col className="w-[110px]" />
            <col className="w-[120px]" />
            <col className="w-[110px]" />
            <col className="w-[48px]" />
          </colgroup>
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50">
              <th className="px-3 py-2.5 text-left text-xs font-medium text-neutral-500">종목</th>
              <th className="px-2 py-2.5 text-left text-xs font-medium text-neutral-500">티커</th>
              <th className="px-2 py-2.5 text-right text-xs font-medium text-neutral-500">수량</th>
              <th className="px-2 py-2.5 text-right text-xs font-medium text-neutral-500">
                평단가
                <span className="ml-1 text-amber-500">*</span>
              </th>
              <th className="px-2 py-2.5 text-right text-xs font-medium text-neutral-500">현재가</th>
              <th className="px-2 py-2.5 text-right text-xs font-medium text-neutral-500">평가금액</th>
              <th className="px-2 py-2.5 text-right text-xs font-medium text-neutral-500">손익</th>
              <th className="px-2 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {holdings.map((h, i) => {
              const isCash = h.raw_name.includes("예수금");
              const isUsd = h.currency === "USD";
              const avgMissing = !isCash && h.avg_price == null;
              const isSwapped = !isCash && h.avg_price != null && h.market_price != null && h.avg_price > h.market_price;
              return (
                <tr key={i} className={`${h._delete ? "opacity-30 line-through" : ""} ${isCash ? "bg-neutral-50/60" : isSwapped ? "bg-amber-50/40" : "hover:bg-neutral-50/40"} transition-colors`}>
                  {/* 종목명 */}
                  <td className="px-3 py-2">
                    <input
                      value={h.raw_name}
                      onChange={(e) => update(i, { raw_name: e.target.value })}
                      title={h.raw_name}
                      className="w-full rounded border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                  </td>

                  {isCash ? (
                    <>
                      {/* 예수금: 통화 선택, 잔액만 */}
                      <td className="px-2 py-2">
                        <select
                          value={h.currency}
                          onChange={(e) => update(i, { currency: e.target.value as "KRW" | "USD" })}
                          className="w-full rounded border border-neutral-200 bg-white px-2 py-1.5 text-xs"
                        >
                          <option value="KRW">KRW</option>
                          <option value="USD">USD</option>
                        </select>
                      </td>
                      <td className="px-2 py-2 text-right text-xs text-neutral-400">잔액</td>
                      <td className="px-2 py-2" colSpan={4}>
                        <NumericInput
                          value={h.avg_price}
                          onChange={(v) => update(i, { avg_price: v, eval_amount: v })}
                          decimals={0}
                        />
                      </td>
                    </>
                  ) : (
                    <>
                      {/* 티커 */}
                      <td className="px-2 py-2">
                        <input
                          value={h.ticker ?? ""}
                          onChange={(e) => update(i, { ticker: e.target.value.toUpperCase() })}
                          placeholder="QQQ"
                          className="w-full rounded border border-neutral-200 bg-white px-2 py-1.5 font-mono text-xs uppercase focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      </td>
                      {/* 수량 */}
                      <td className="px-2 py-2">
                        <NumericInput
                          value={h.quantity}
                          onChange={(v) => update(i, { quantity: v ?? 0 })}
                          decimals={6}
                          placeholder="0"
                        />
                      </td>
                      {/* 평단가 — null이면 amber 강조, avg>market이면 suspect */}
                      <td className="px-2 py-2">
                        <div className="relative">
                          <NumericInput
                            value={h.avg_price}
                            onChange={(v) => update(i, { avg_price: v })}
                            suspect={avgMissing || isSwapped}
                            placeholder={avgMissing ? "입력 필요" : "—"}
                            decimals={4}
                          />
                          {isUsd && h.avg_price != null && (
                            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-neutral-400">$</span>
                          )}
                        </div>
                      </td>
                      {/* 현재가 */}
                      <td className="px-2 py-2">
                        <div className="relative">
                          <NumericInput
                            value={h.market_price}
                            onChange={(v) => update(i, { market_price: v })}
                            suspect={isSwapped}
                            decimals={4}
                          />
                          {isUsd && h.market_price != null && (
                            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-neutral-400">$</span>
                          )}
                        </div>
                      </td>
                      {/* 평가금액 */}
                      <td className="px-2 py-2">
                        <NumericInput
                          value={h.eval_amount}
                          onChange={(v) => update(i, { eval_amount: v })}
                          suspect={h.eval_amount === 0 || h.eval_amount == null}
                          decimals={2}
                        />
                      </td>
                      {/* 손익 */}
                      <td className="px-2 py-2">
                        <NumericInput
                          value={h.profit_loss}
                          onChange={(v) => update(i, { profit_loss: v })}
                          decimals={2}
                          signColor
                        />
                      </td>
                    </>
                  )}

                  {/* 스왑 + 삭제 */}
                  <td className="px-2 py-2 text-center">
                    <div className="flex flex-col items-center gap-1">
                      {!isCash && h.avg_price != null && h.market_price != null && (
                        <button
                          type="button"
                          title="평단가 ↔ 현재가 교체"
                          onClick={() => update(i, {
                            avg_price: h.market_price,
                            market_price: h.avg_price,
                            ...(h.profit_loss == null && h.eval_amount != null
                              ? { profit_loss: h.eval_amount, eval_amount: null }
                              : {}),
                          })}
                          className={`text-sm leading-none ${isSwapped ? "text-amber-600 hover:text-amber-800" : "text-neutral-400 hover:text-neutral-600"}`}
                        >
                          ⇄
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => update(i, { _delete: !h._delete })}
                        className="text-xs text-red-500 hover:text-red-700"
                        title={h._delete ? "복원" : "삭제"}
                      >
                        {h._delete ? "↩" : "×"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-neutral-200 bg-neutral-50">
            <tr>
              <td colSpan={5} className="px-3 py-2.5 text-right text-xs text-neutral-400">
                합계 <span className="text-neutral-300">(OCR 원본값)</span>
              </td>
              <td className="px-2 py-2.5 text-right text-sm font-semibold tabular-nums text-neutral-800">
                {krwTotal > 0 && <div>₩{krwTotal.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}</div>}
                {usdTotal > 0 && <div className="text-neutral-600">${usdTotal.toLocaleString("en-US", { maximumFractionDigits: 2 })}</div>}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* 평단가 주석 */}
      <p className="text-xs text-amber-600">
        <span className="font-medium">* 평단가</span>가 비어 있으면 수익률 계산이 불가합니다. 직접 입력해주세요.
      </p>

      <button type="button" onClick={add} className="self-start text-sm text-blue-700 underline">
        + 종목 추가
      </button>

      <div className="flex gap-2">
        <button onClick={handleTempSave} disabled={saving}
          className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50">
          임시 저장
        </button>
        <button onClick={handleConfirm} disabled={saving}
          className="rounded-md bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
          {saving ? "저장 중…" : "확인 완료"}
        </button>
      </div>

      {errorMsg && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{errorMsg}</p>
      )}
    </div>
  );
}
