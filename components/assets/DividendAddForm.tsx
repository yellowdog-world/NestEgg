"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type Account = {
  id: string;
  type: string;
  broker: string | null;
  nickname: string | null;
};

const ACCOUNT_LABEL: Record<string, string> = {
  pension_fund: "연저펀", isa: "ISA", irp: "IRP",
  regular: "일반계좌", corp: "법인", bank: "은행", overseas: "해외증권",
};

const inputCls =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-base outline-none focus:border-neutral-900";
const labelCls = "flex flex-col gap-1 text-base";
const labelTitleCls = "font-medium text-neutral-700";

export function DividendAddForm({
  accounts,
  defaultUsdKrw,
}: {
  accounts: Account[];
  defaultUsdKrw: number;
}) {
  const router = useRouter();

  // ── 폼 상태 ───────────────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const [date,       setDate]       = useState(today);
  const [accountId,  setAccountId]  = useState("");
  const [ticker,     setTicker]     = useState("");
  const [name,       setName]       = useState("");
  const [quantity,   setQuantity]   = useState("");
  const [perShare,   setPerShare]   = useState("");
  const [currency,   setCurrency]   = useState<"KRW" | "USD">("USD");
  const [amountOrig, setAmountOrig] = useState("");
  const [usdKrw,     setUsdKrw]     = useState(String(Math.round(defaultUsdKrw)));
  const [divType,    setDivType]    = useState("monthly");
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");

  // ── 수량 × 주당 → 수령금액 자동계산 ──────────────────────────────────────
  useEffect(() => {
    const q = parseFloat(quantity);
    const p = parseFloat(perShare);
    if (!isNaN(q) && !isNaN(p) && q > 0 && p > 0) {
      setAmountOrig(String(parseFloat((q * p).toFixed(6))));
    }
  }, [quantity, perShare]);

  // ── 원화 환산 미리보기 ────────────────────────────────────────────────────
  const amountKrw = (() => {
    const orig = parseFloat(amountOrig);
    if (isNaN(orig) || orig <= 0) return null;
    if (currency === "KRW") return orig;
    const rate = parseFloat(usdKrw);
    return isNaN(rate) ? null : orig * rate;
  })();

  // ── 제출 ─────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("종목명을 입력해주세요"); return; }
    const origNum = parseFloat(amountOrig);
    if (isNaN(origNum) || origNum <= 0) { setError("수령금액을 입력해주세요"); return; }
    if (currency === "USD" && amountKrw === null) { setError("환율을 입력해주세요"); return; }

    setLoading(true);
    setError("");

    const res = await fetch("/api/dividends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        received_at:     date,
        account_id:      accountId || null,
        ticker:          ticker.trim() || null,
        name:            name.trim(),
        quantity:        parseFloat(quantity) || null,
        per_share:       parseFloat(perShare) || null,
        currency,
        amount_original: origNum,
        amount_krw:      amountKrw,
        usd_krw_rate:    currency === "USD" ? parseFloat(usdKrw) : null,
        dividend_type:   divType,
      }),
    });

    if (res.ok) {
      router.push("/assets");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "저장에 실패했습니다");
      setLoading(false);
    }
  }

  const accountDisplay = (a: Account) =>
    [a.broker, a.nickname].filter(Boolean).join(" · ") || (ACCOUNT_LABEL[a.type] ?? a.type);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">

      {/* 수령일 */}
      <label className={labelCls}>
        <span className={labelTitleCls}>수령일</span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={inputCls}
          required
        />
      </label>

      {/* 계좌 (선택) */}
      {accounts.length > 0 && (
        <label className={labelCls}>
          <span className={labelTitleCls}>
            계좌 <span className="font-normal text-neutral-400">(선택)</span>
          </span>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className={inputCls}
          >
            <option value="">선택 안함</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{accountDisplay(a)}</option>
            ))}
          </select>
        </label>
      )}

      {/* 티커 + 종목명 */}
      <div className="flex gap-3">
        <label className={`${labelCls} w-28`}>
          <span className={labelTitleCls}>티커</span>
          <input
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="JEPQ"
            className={inputCls}
          />
        </label>
        <label className={`${labelCls} flex-1`}>
          <span className={labelTitleCls}>
            종목명 <span className="text-red-500">*</span>
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="JPMorgan Nasdaq ETF"
            className={inputCls}
            required
          />
        </label>
      </div>

      {/* 수량 + 주당배당금 + 통화 */}
      <div className="flex gap-3">
        <label className={`${labelCls} flex-1`}>
          <span className={labelTitleCls}>수량</span>
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="632"
            min="0"
            className={inputCls}
          />
        </label>
        <label className={`${labelCls} flex-1`}>
          <span className={labelTitleCls}>주당배당금</span>
          <input
            type="number"
            value={perShare}
            onChange={(e) => setPerShare(e.target.value)}
            placeholder="0.59"
            min="0"
            step="any"
            className={inputCls}
          />
        </label>
        <label className={`${labelCls} w-20`}>
          <span className={labelTitleCls}>통화</span>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as "KRW" | "USD")}
            className={inputCls}
          >
            <option value="USD">USD</option>
            <option value="KRW">KRW</option>
          </select>
        </label>
      </div>

      {/* 수령금액 */}
      <label className={labelCls}>
        <span className={labelTitleCls}>
          수령금액 ({currency}) <span className="text-red-500">*</span>
        </span>
        <input
          type="number"
          value={amountOrig}
          onChange={(e) => setAmountOrig(e.target.value)}
          placeholder={currency === "USD" ? "317.46" : "468239"}
          min="0"
          step="any"
          className={inputCls}
          required
        />
      </label>

      {/* USD 환율 */}
      {currency === "USD" && (
        <label className={labelCls}>
          <span className={labelTitleCls}>환율 (KRW/USD)</span>
          <input
            type="number"
            value={usdKrw}
            onChange={(e) => setUsdKrw(e.target.value)}
            className={inputCls}
          />
          {amountKrw !== null && (
            <span className="text-sm text-neutral-500">
              ≈ {Math.round(amountKrw).toLocaleString("ko-KR")}원
            </span>
          )}
        </label>
      )}

      {/* 배당 유형 */}
      <label className={labelCls}>
        <span className={labelTitleCls}>배당 유형</span>
        <select
          value={divType}
          onChange={(e) => setDivType(e.target.value)}
          className={inputCls}
        >
          <option value="monthly">월배당</option>
          <option value="regular">일반배당</option>
          <option value="special">특별배당</option>
        </select>
      </label>

      {error && <p className="text-base text-red-500">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-neutral-900 py-3 text-base font-semibold text-white disabled:opacity-50"
      >
        {loading ? "저장 중…" : "배당 저장"}
      </button>
    </form>
  );
}
