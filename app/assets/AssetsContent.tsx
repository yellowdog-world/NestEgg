"use client";

import useSWR from "swr";
import Link from "next/link";
import { fmtKRWShort } from "@/lib/utils/format";
import { AssetsViewSwitcher } from "@/components/assets/AssetsViewSwitcher";
import { AssetsAnalytics } from "@/components/assets/AssetsAnalytics";
import { type HoldingWithLive } from "@/components/assets/AccountCard";

// ── 타입 ──────────────────────────────────────────────────────────────────────

type EnrichedAccount = {
  account: { id: string; type: string; broker: string; nickname: string | null };
  capturedAt: string | null;
  holdings: HoldingWithLive[];
  totalEvalKrw: number;
  totalCostKrw: number;
};

type AssetsData = {
  totalLiveKrw: number;
  usdKrw: number;
  enrichedAccounts: EnrichedAccount[];
  timelinePoints: { date: string; total: number; cost: number }[];
  autoDividends: {
    id: string; received_at: string; ticker: string; name: string;
    quantity: number; per_share: number; currency: string;
    amount_original: number; amount_krw: number;
    usd_krw_rate: number | null; dividend_type: string; account_id: null;
  }[];
  yearlyDivKrw: number;
  isFirstTime: boolean;
};

const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error("fetch failed");
  return r.json() as Promise<AssetsData>;
});

// ── 스켈레톤 (SWR 로딩 중 표시) ───────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-neutral-100 ${className ?? ""}`} />;
}

function AssetsContentSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-48" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-24 rounded-xl" />
          <Skeleton className="h-9 w-24 rounded-xl" />
        </div>
      </header>
      <div className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4">
        <div className="flex gap-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8 flex-1 rounded-lg" />)}
        </div>
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
      {[...Array(3)].map((_, i) => (
        <div key={i} className="rounded-2xl border border-neutral-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <Skeleton className="h-5 w-28" /><Skeleton className="h-5 w-16" />
          </div>
          <div className="flex flex-col gap-2">
            {[...Array(3)].map((_, j) => (
              <div key={j} className="flex items-center justify-between">
                <Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export function AssetsContent() {
  const { data, isLoading, error } = useSWR<AssetsData>("/api/assets/data", fetcher, {
    revalidateOnMount: true,           // 마운트 시 항상 재검증 (종목 추가 후 복귀 시 최신 데이터 반영)
    revalidateOnFocus: false,          // 탭 전환 시 재조회 안 함
    dedupingInterval: 60 * 1000,       // 1분 내 중복 요청 방지
    keepPreviousData: true,            // 재검증 중에도 이전 데이터 즉시 표시 (깜빡임 없음)
  });

  if (isLoading || (!data && !error)) return <AssetsContentSkeleton />;
  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">
        데이터를 불러오지 못했습니다. 새로고침해 주세요.
      </div>
    );
  }

  const { totalLiveKrw, usdKrw, enrichedAccounts, timelinePoints, autoDividends, yearlyDivKrw, isFirstTime } = data;

  // ── 신규 사용자 ──────────────────────────────────────────────────────────────
  if (isFirstTime) {
    return (
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">내 자산</h1>
        </header>
        <div className="rounded-2xl border border-amber-200 bg-gradient-to-b from-amber-50 to-white p-6">
          <div className="mb-6 text-center">
            <span className="text-5xl">🐕</span>
            <h2 className="mt-3 text-lg font-semibold text-neutral-800">어서오세요! 자산을 등록해 볼까요?</h2>
            <p className="mt-1.5 text-sm text-neutral-500">
              증권사 앱 화면을 캡처하면 AI가 종목·수량·평단가를 자동으로 읽어드려요.
            </p>
          </div>
          <div className="mb-6 flex items-start gap-0">
            {[
              { icon: "🏦", title: "계좌 등록", desc: "증권사·계좌 유형 입력" },
              { icon: "📷", title: "화면 캡처", desc: "보유 종목 화면 촬영" },
              { icon: "✨", title: "AI 자동 추출", desc: "종목·수량·평단가 완성" },
            ].map((s) => (
              <div key={s.title} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500 text-white">
                  <span className="text-lg">{s.icon}</span>
                </div>
                <p className="text-xs font-semibold text-neutral-800">{s.title}</p>
                <p className="text-center text-[11px] text-neutral-500">{s.desc}</p>
              </div>
            ))}
          </div>
          <div className="relative -mt-16 mb-8 flex items-center justify-around px-10">
            <span className="text-neutral-300 text-lg">→</span>
            <span className="text-neutral-300 text-lg">→</span>
          </div>
          <Link
            href="/assets/upload"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white shadow hover:bg-amber-600 active:scale-95 transition-transform"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            지금 바로 시작하기
          </Link>
        </div>
      </div>
    );
  }

  // ── 자산 대시보드 ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">내 자산</h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            총{" "}
            <span className="text-lg font-semibold text-neutral-900">
              {fmtKRWShort(totalLiveKrw > 0 ? totalLiveKrw : 0)}
            </span>
          </p>
          <p className="mt-0.5 text-[11px] text-neutral-400">
            Naver/Stooq 최대 15분 지연 · USD/KRW{" "}
            {usdKrw.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          <Link
            href="/assets/history"
            className="flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 active:scale-95 transition-transform"
          >
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            히스토리
          </Link>
          <Link
            href="/assets/upload"
            className="flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-amber-500 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-600 active:scale-95 transition-transform"
          >
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
            </svg>
            캡처 등록
          </Link>
        </div>
      </header>

      <AssetsAnalytics
        accounts={enrichedAccounts}
        usdKrw={usdKrw}
        timelinePoints={timelinePoints}
        dividends={autoDividends}
      />

      <AssetsViewSwitcher accounts={enrichedAccounts} usdKrw={usdKrw} />

      {totalLiveKrw > 0 && (
        <section className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
          <p className="mb-2.5 text-xs font-medium uppercase tracking-wide text-neutral-500">
            내 자산으로 시뮬레이터 실행
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href={`/sim/fire?currentAssets=${totalLiveKrw}`} className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 active:scale-95 transition-transform">
              🎯 FIRE 계산기
            </Link>
            <Link href={`/sim/depletion?startAssets=${totalLiveKrw}`} className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 active:scale-95 transition-transform">
              📉 자산 고갈 시뮬
            </Link>
            {yearlyDivKrw > 0 && (
              <Link href={`/sim/retire-cashflow?dividendYearly=${yearlyDivKrw}`} className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 active:scale-95 transition-transform">
                💰 은퇴 현금흐름
              </Link>
            )}
          </div>
          <p className="mt-2 text-[11px] text-neutral-400">
            현재 자산 {fmtKRWShort(totalLiveKrw)}
            {yearlyDivKrw > 0 && ` · 최근 1년 배당 ${fmtKRWShort(yearlyDivKrw)}`}
            을(를) 시뮬 기본값으로 채워줍니다.
          </p>
        </section>
      )}
    </div>
  );
}
