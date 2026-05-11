"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
// ── 타입 ─────────────────────────────────────────────────────────────────────

// OCR이 읽어드린 5개 필드 중 어느 것을 컬럼에 매핑할지
type OcrField = "qty" | "avg" | "market" | "eval" | "pl";

const OCR_FIELD_OPTIONS: { value: OcrField; label: string }[] = [
  { value: "qty",    label: "수량"   },
  { value: "avg",    label: "평단가" },
  { value: "market", label: "시세"   },
  { value: "eval",   label: "평가액" },
  { value: "pl",     label: "손익"   },
];

function getOcrValue(h: Holding, field: OcrField): number | null {
  switch (field) {
    case "qty":    return h._ocr_qty    ?? null;
    case "avg":    return h._ocr_avg    ?? null;
    case "market": return h._ocr_market ?? null;
    case "eval":   return h._ocr_eval   ?? null;
    case "pl":     return h._ocr_pl     ?? null;
  }
}

type Holding = {
  raw_name: string;
  ticker?: string;
  quantity: number;
  avg_price: number | null;
  // DB에 저장되나 UI에서는 숨김
  market_price: number | null;
  eval_amount: number | null;
  profit_loss: number | null;
  currency: "KRW" | "USD";
  // OCR이 읽은 원본값 — select 후보로 사용
  _ocr_qty?: number | null;
  _ocr_avg?: number | null;
  _ocr_market?: number | null;
  _ocr_eval?: number | null;
  _ocr_pl?: number | null;
  _delete?: boolean;
  _isExisting?: boolean;  // 이번 OCR이 아닌 기존 등록 종목
};


type Props = {
  snapshotId: string;
  accountId: string;
  initial: Holding[];
};

// ── 유틸 ─────────────────────────────────────────────────────────────────────

// ── 숫자 포맷 인풋 ────────────────────────────────────────────────────────────

function NumericInput({
  value,
  onChange,
  placeholder = "—",
  suspect = false,
  decimals = 4,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  suspect?: boolean;
  decimals?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const formatted =
    value != null
      ? value.toLocaleString("ko-KR", { maximumFractionDigits: decimals })
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
      className={`w-full rounded border px-2 py-1.5 text-right text-base tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-400
        ${suspect ? "border-amber-400 bg-amber-50 font-medium placeholder:text-amber-400" : "border-neutral-200 bg-white"}
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
  const [resolving, setResolving] = useState<Record<number, boolean>>({});

  // 실제 값이 하나라도 있는 필드만 선택지로 노출 — useState 초기화보다 먼저 계산
  const availableOcrFields = OCR_FIELD_OPTIONS.filter((o) =>
    initial.some((h) => !h.raw_name.includes("예수금") && getOcrValue(h, o.value) != null),
  );
  const hasOcr = availableOcrFields.length > 0;

  // 헤더 OCR 필드 매핑 — 선택 시 해당 컬럼 전체 행 일괄 업데이트
  const pickDefault = (f: OcrField): OcrField =>
    availableOcrFields.some((o) => o.value === f) ? f : (availableOcrFields[0]?.value ?? f);
  const [qtyField, setQtyField] = useState<OcrField>(() => pickDefault("qty"));
  const [avgField, setAvgField] = useState<OcrField>(() => pickDefault("avg"));

  function applyOcrField(col: "quantity" | "avg_price", field: OcrField) {
    setHoldings((prev) =>
      prev.map((h) => {
        if (h._delete || h.raw_name.includes("예수금")) return h;
        const v = getOcrValue(h, field);
        if (v == null) return h;
        return { ...h, [col]: v };
      }),
    );
  }

  function update(idx: number, patch: Partial<Holding>) {
    setHoldings((prev) => prev.map((h, i) => (i === idx ? { ...h, ...patch } : h)));
  }
  function add() {
    setHoldings((prev) => [
      ...prev,
      { raw_name: "", ticker: "", quantity: 0, avg_price: null, market_price: null, eval_amount: null, profit_loss: null, currency: "KRW" },
    ]);
  }

  /** 티커 blur 시 종목명 자동 조회 */
  async function resolveTickerName(idx: number, ticker: string) {
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    setResolving((prev) => ({ ...prev, [idx]: true }));
    try {
      const res = await fetch(`/api/market/resolve?ticker=${encodeURIComponent(t)}`);
      const d = await res.json() as { name?: string | null; market?: string | null; currency?: string | null };
      if (d.name) {
        update(idx, {
          raw_name: d.name,
          currency: (d.currency as "KRW" | "USD") ?? holdings[idx].currency,
        });
      }
    } catch { /* 조회 실패 시 무시 */ } finally {
      setResolving((prev) => ({ ...prev, [idx]: false }));
    }
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
    await callSaveApi(newList, true);
  }

  const [showOcrRaw, setShowOcrRaw] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      {/* OCR 원본 값 토글 */}
      {hasOcr && (
        <div>
          <button
            type="button"
            onClick={() => setShowOcrRaw((v) => !v)}
            className="text-sm text-neutral-400 underline underline-offset-2 hover:text-neutral-600"
          >
            {showOcrRaw ? "▲ OCR 원본 값 숨기기" : "▼ OCR 원본 값 보기"}
          </button>
          {showOcrRaw && (
            <div className="mt-2 overflow-x-auto rounded-lg border border-neutral-200 bg-neutral-50">
              <table className="w-full border-collapse text-sm tabular-nums">
                <thead>
                  <tr className="border-b border-neutral-200">
                    <th className="px-3 py-2 text-left font-medium text-neutral-500">종목명</th>
                    <th className="px-2 py-2 text-right font-medium text-neutral-500">수량</th>
                    <th className="px-2 py-2 text-right font-medium text-neutral-500">평단가</th>
                    <th className="px-2 py-2 text-right font-medium text-neutral-500">시세</th>
                    <th className="px-2 py-2 text-right font-medium text-neutral-500">평가액</th>
                    <th className="px-2 py-2 text-right font-medium text-neutral-500">손익</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {initial.filter((h) => !h.raw_name.includes("예수금")).map((h, i) => {
                    const fmt = (v: number | null | undefined) =>
                      v != null ? v.toLocaleString("ko-KR", { maximumFractionDigits: 4 }) : "—";
                    return (
                      <tr key={i} className="hover:bg-neutral-100/60">
                        <td className="px-3 py-1.5 text-neutral-700">{h.raw_name}</td>
                        <td className="px-2 py-1.5 text-right">{fmt(h._ocr_qty)}</td>
                        <td className="px-2 py-1.5 text-right">{fmt(h._ocr_avg)}</td>
                        <td className="px-2 py-1.5 text-right">{fmt(h._ocr_market)}</td>
                        <td className="px-2 py-1.5 text-right">{fmt(h._ocr_eval)}</td>
                        <td className="px-2 py-1.5 text-right">{fmt(h._ocr_pl)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 테이블 — DB 저장 항목만 표시 */}
      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full min-w-[480px] border-collapse text-base">
          <colgroup>
            <col className="w-[200px]" />
            <col className="w-[100px]" />
            <col className="w-[80px]" />
            <col className="w-[130px]" />
            <col className="w-[70px]" />
            <col className="w-[44px]" />
          </colgroup>
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50">
              <th className="px-3 py-2.5 text-left text-sm font-medium text-neutral-500">종목명</th>
              <th className="px-2 py-2.5 text-left text-sm font-medium text-neutral-500">티커</th>
              <th className="px-2 py-2.5 text-right text-sm font-medium text-neutral-500">
                <div className="flex flex-col items-end gap-0.5">
                  수량
                  {hasOcr && (
                    <select
                      value={qtyField}
                      onChange={(e) => {
                        const f = e.target.value as OcrField;
                        setQtyField(f);
                        applyOcrField("quantity", f);
                      }}
                      className="cursor-pointer rounded border border-neutral-200 bg-white py-0.5 pl-1.5 pr-5 text-sm font-medium text-neutral-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    >
                      {availableOcrFields.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  )}
                </div>
              </th>
              <th className="px-2 py-2.5 text-right text-sm font-medium text-neutral-500">
                <div className="flex flex-col items-end gap-0.5">
                  평단가<span className="text-amber-500">*</span>
                  {hasOcr && (
                    <select
                      value={avgField}
                      onChange={(e) => {
                        const f = e.target.value as OcrField;
                        setAvgField(f);
                        applyOcrField("avg_price", f);
                      }}
                      className="cursor-pointer rounded border border-neutral-200 bg-white py-0.5 pl-1.5 pr-5 text-sm font-medium text-neutral-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    >
                      {availableOcrFields.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  )}
                </div>
              </th>
              <th className="px-2 py-2.5 text-center text-sm font-medium text-neutral-500">통화</th>
              <th className="px-2 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {holdings.map((h, i) => {
              const isCash = h.raw_name.includes("예수금");
              const avgMissing = !isCash && h.avg_price == null;
              const isResolving = resolving[i];

              return (
                <tr
                  key={i}
                  className={`${h._delete ? "opacity-30 line-through" : ""} ${
                    isCash ? "bg-neutral-50/60" : h._isExisting ? "bg-blue-50/30" : "hover:bg-neutral-50/40"
                  } transition-colors`}
                >
                  {/* 종목명 */}
                  <td className="px-3 py-2">
                    <div className="relative">
                      <input
                        value={h.raw_name}
                        onChange={(e) => update(i, { raw_name: e.target.value })}
                        title={h.raw_name}
                        className="w-full rounded border border-neutral-200 bg-white px-2 py-1.5 text-base focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                      {isResolving && (
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-neutral-400 animate-pulse">
                          조회 중…
                        </span>
                      )}
                      {h._isExisting && !isResolving && (
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-blue-100 px-1 py-0.5 text-xs font-medium text-blue-500">
                          기존
                        </span>
                      )}
                    </div>
                  </td>

                  {isCash ? (
                    <>
                      {/* 예수금: 통화·잔액만 */}
                      <td className="px-2 py-2 text-sm text-neutral-400 italic">예수금</td>
                      <td className="px-2 py-2 text-right text-sm text-neutral-400">잔액</td>
                      <td className="px-2 py-2">
                        <NumericInput
                          value={h.avg_price}
                          onChange={(v) => update(i, { avg_price: v, eval_amount: v })}
                          decimals={0}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <select
                          value={h.currency}
                          onChange={(e) => update(i, { currency: e.target.value as "KRW" | "USD" })}
                          className="w-full rounded border border-neutral-200 bg-white px-1.5 py-1.5 text-sm"
                        >
                          <option value="KRW">KRW</option>
                          <option value="USD">USD</option>
                        </select>
                      </td>
                    </>
                  ) : (
                    <>
                      {/* 티커 — blur 시 이름 자동 조회 */}
                      <td className="px-2 py-2">
                        <input
                          value={h.ticker ?? ""}
                          onChange={(e) => update(i, { ticker: e.target.value.toUpperCase() })}
                          onBlur={(e) => resolveTickerName(i, e.target.value)}
                          placeholder="QQQ"
                          className="w-full rounded border border-neutral-200 bg-white px-2 py-1.5 font-mono text-sm uppercase focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      </td>
                      {/* 수량 */}
                      <td className="px-2 py-2">
                        <NumericInput
                          value={h.quantity}
                          onChange={(v) => update(i, { quantity: v ?? 0 })}
                          decimals={0}
                          placeholder="0"
                        />
                      </td>
                      {/* 평단가 */}
                      <td className="px-2 py-2">
                        <NumericInput
                          value={h.avg_price}
                          onChange={(v) => update(i, { avg_price: v })}
                          suspect={avgMissing}
                          placeholder={avgMissing ? "입력 필요" : "—"}
                          decimals={4}
                        />
                      </td>
                      {/* 통화 */}
                      <td className="px-2 py-2">
                        <select
                          value={h.currency}
                          onChange={(e) => update(i, { currency: e.target.value as "KRW" | "USD" })}
                          className="w-full rounded border border-neutral-200 bg-white px-1.5 py-1.5 text-sm"
                        >
                          <option value="KRW">KRW</option>
                          <option value="USD">USD</option>
                        </select>
                      </td>
                    </>
                  )}

                  {/* 삭제 */}
                  <td className="px-2 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => update(i, { _delete: !h._delete })}
                      className="text-sm text-red-400 hover:text-red-600"
                      title={h._delete ? "복원" : "삭제"}
                    >
                      {h._delete ? "↩" : "×"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-amber-600">
        <span className="font-medium">* 평단가</span>가 비어 있으면 수익률 계산이 불가합니다. 직접 입력해주세요.
      </p>

      <button type="button" onClick={add} className="self-start text-base text-blue-700 underline">
        + 종목 추가
      </button>

      <div className="flex gap-2">
        <button
          onClick={handleTempSave}
          disabled={saving}
          className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-base font-medium hover:bg-neutral-50 disabled:opacity-50"
        >
          임시 저장
        </button>
        <button
          onClick={handleConfirm}
          disabled={saving}
          className="rounded-md bg-emerald-600 px-5 py-2 text-base font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? "저장 중…" : "확인 완료"}
        </button>
      </div>

      {errorMsg && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-base text-red-800">{errorMsg}</p>
      )}
    </div>
  );
}
