"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { lookupTicker, lookupByTicker } from "@/lib/market/ticker-map";

type Row = {
  raw_name: string;
  ticker: string;
  quantity: number;
  avg_price: number | null;
  currency: "KRW" | "USD";
  _delete?: boolean;
};

type Props = {
  accountId: string;
  initial: Row[];
};

export function HoldingsDirectEditor({ accountId, initial }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(initial);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resolving, setResolving] = useState<Set<number>>(new Set());

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  async function onTickerBlur(i: number, rawValue: string) {
    const ticker = rawValue.trim().toUpperCase();
    if (!ticker) return;

    // 1. 클라이언트 역방향 맵 (즉시) — 항상 이름 덮어쓰기
    const found = lookupByTicker(ticker);
    if (found) {
      update(i, {
        ticker: found.info.ticker,
        currency: found.info.currency,
        raw_name: found.name,
      });
      return;
    }

    // 2. 서버에서 조회 (DB → Naver → Yahoo) — 항상 이름 덮어쓰기
    setResolving((prev) => new Set(prev).add(i));
    try {
      const res = await fetch(`/api/market/resolve?ticker=${encodeURIComponent(ticker)}`);
      if (res.ok) {
        const d = await res.json() as { name: string | null; market: string | null; currency: string | null };
        const patch: Partial<Row> = {};
        if (d.name) patch.raw_name = d.name;
        if (d.currency === "KRW" || d.currency === "USD") patch.currency = d.currency;
        if (Object.keys(patch).length) update(i, patch);
      }
    } finally {
      setResolving((prev) => { const s = new Set(prev); s.delete(i); return s; });
    }
  }

  function add() {
    setRows((prev) => [
      ...prev,
      { raw_name: "", ticker: "", quantity: 0, avg_price: null, currency: "KRW" },
    ]);
  }

  function addCash(currency: "KRW" | "USD") {
    setRows((prev) => [
      ...prev,
      {
        raw_name: currency === "USD" ? "USD 예수금" : "예수금",
        ticker: "",
        quantity: 1,
        avg_price: null,
        currency,
      },
    ]);
  }

  async function save() {
    setSaving(true);
    setErrorMsg(null);
    try {
      // 빈 티커 자동 조회 후 상태 반영
      const resolved = rows.map((r) => {
        if (r._delete || r.ticker) return r;
        const info = lookupTicker(r.raw_name);
        return info ? { ...r, ticker: info.ticker } : r;
      });
      setRows(resolved);

      const res = await fetch(`/api/accounts/${accountId}/holdings`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          holdings: resolved
            .filter((r) => !r._delete)
            .map((r) => ({
              raw_name: r.raw_name,
              ticker: r.ticker || undefined,
              quantity: r.quantity,
              avg_price: r.avg_price,
              market_price: null,
              eval_amount: null,
              profit_loss: null,
              currency: r.currency,
            })),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "저장 실패");
      router.push("/assets");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "오류");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[600px] text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-500">
            <tr>
              <th className="px-3 py-2 text-left">종목명</th>
              <th className="px-2 py-2 text-left">티커</th>
              <th className="px-2 py-2 text-left">통화</th>
              <th className="px-2 py-2 text-right">수량</th>
              <th className="px-2 py-2 text-right">평단가</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const isCash = r.raw_name.includes("예수금");
              return (
              <tr
                key={i}
                className={`border-t border-neutral-100 ${r._delete ? "opacity-30" : ""} ${isCash ? "bg-neutral-50/60" : ""}`}
              >
                <td className="px-3 py-2">
                  <input
                    value={r.raw_name}
                    onChange={(e) => update(i, { raw_name: e.target.value })}
                    placeholder={resolving.has(i) ? "조회 중…" : "종목명"}
                    className={`w-full rounded border px-2 py-1 text-sm transition-colors ${
                      resolving.has(i)
                        ? "border-blue-200 bg-blue-50 text-neutral-400"
                        : "border-neutral-200 bg-white"
                    }`}
                  />
                </td>
                {isCash ? (
                  <>
                    <td className="px-2 py-2 text-center text-xs text-neutral-300">—</td>
                    <td className="px-2 py-2">
                      <select
                        value={r.currency}
                        onChange={(e) => update(i, { currency: e.target.value as "KRW" | "USD" })}
                        className="rounded border border-neutral-200 bg-white px-2 py-1 text-xs"
                      >
                        <option value="KRW">KRW</option>
                        <option value="USD">USD</option>
                      </select>
                    </td>
                    <td className="px-2 py-2 text-right text-xs text-neutral-400">잔액</td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        value={r.avg_price ?? ""}
                        onChange={(e) =>
                          update(i, { avg_price: e.target.value === "" ? null : Number(e.target.value) })
                        }
                        placeholder="금액 입력"
                        className="w-36 rounded border border-neutral-200 bg-white px-2 py-1 text-right text-sm"
                      />
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-2 py-2">
                      <div className="relative">
                        <input
                          value={r.ticker}
                          onChange={(e) => update(i, { ticker: e.target.value.toUpperCase() })}
                          onBlur={(e) => onTickerBlur(i, e.target.value)}
                          placeholder="QQQ"
                          className="w-20 rounded border border-neutral-200 bg-white px-2 py-1 font-mono text-xs"
                        />
                        {resolving.has(i) && (
                          <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-neutral-400">…</span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <select
                        value={r.currency}
                        onChange={(e) => update(i, { currency: e.target.value as "KRW" | "USD" })}
                        className="rounded border border-neutral-200 bg-white px-2 py-1 text-xs"
                      >
                        <option value="KRW">KRW</option>
                        <option value="USD">USD</option>
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        value={r.quantity}
                        step="0.000001"
                        onChange={(e) => update(i, { quantity: Number(e.target.value) })}
                        className="w-24 rounded border border-neutral-200 bg-white px-2 py-1 text-right text-sm"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        value={r.avg_price ?? ""}
                        onChange={(e) =>
                          update(i, { avg_price: e.target.value === "" ? null : Number(e.target.value) })
                        }
                        placeholder="—"
                        className="w-28 rounded border border-neutral-200 bg-white px-2 py-1 text-right text-sm"
                      />
                    </td>
                  </>
                )}
                <td className="px-2 py-2">
                  <button
                    onClick={() => update(i, { _delete: !r._delete })}
                    className="text-xs text-red-500 hover:underline"
                  >
                    {r._delete ? "복원" : "삭제"}
                  </button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={add}
          className="text-sm text-blue-700 underline"
        >
          + 종목 추가
        </button>
        <button
          type="button"
          onClick={() => addCash("KRW")}
          className="text-sm text-neutral-500 underline"
        >
          + 예수금(원화)
        </button>
        <button
          type="button"
          onClick={() => addCash("USD")}
          className="text-sm text-neutral-500 underline"
        >
          + 예수금(달러)
        </button>
      </div>

      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-md bg-neutral-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
        <button
          onClick={() => router.back()}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm"
        >
          취소
        </button>
      </div>

      {errorMsg && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{errorMsg}</p>
      )}
    </div>
  );
}
