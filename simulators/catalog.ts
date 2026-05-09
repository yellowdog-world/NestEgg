import type { SimulatorMeta } from "./types";

/**
 * 시뮬레이터 정적 카탈로그. URL과 표시 메타데이터만 담음.
 * 실제 compute 함수는 각 페이지에서 동적 import (코드 스플리팅).
 */
export const simulatorCatalog: SimulatorMeta[] = [
  // ── 세금 ──────────────────────────────────────
  {
    path: "pension-tax",
    title: "연금 인출 세금",
    group: "세금",
    description: "나이/연 인출액에 따른 연금소득세 (3.3~5.5%) vs 일시금 (16.5%) 비교",
  },
  {
    path: "limit-1500",
    title: "1500만원 한도",
    group: "세금",
    description: "연 1500만원 초과 시 분리과세 16.5% vs 종합과세 자동 비교",
  },
  {
    path: "etf-tax",
    title: "해외 ETF 세금 비교",
    group: "세금",
    description: "동일 평가차익을 연저펀/ISA/일반계좌에 담을 때 실효세 비교",
  },
  {
    path: "health-insurance",
    title: "지역가입자 건보료",
    group: "세금",
    description: "은퇴 후 직장→지역 전환 시 보험료 추정 (소득·재산 기반)",
  },

  // ── 포트폴리오/은퇴 설계 ─────────────────────────
  {
    path: "fire",
    title: "FIRE 계산기",
    group: "포트폴리오",
    description: "연 지출과 안전인출률(SWR) 기반의 은퇴 목표 자산",
  },
  {
    path: "depletion",
    title: "자산 고갈 시점",
    group: "포트폴리오",
    description: "수익률·인플레·인출액 시나리오로 몇 살에 자산이 0이 되는지 추정",
  },
  {
    path: "retire-cashflow",
    title: "은퇴 후 월급 플랜",
    group: "포트폴리오",
    description: "연저펀/IRP/배당/연금을 합쳐 월 현금 흐름 시뮬레이션",
  },

  // ── 법인/배당 전략 ──────────────────────────────
  {
    path: "corp-salary",
    title: "법인 연봉 최적화",
    group: "법인·배당",
    description: "4대보험 최소화 / 종합소득세 최저 / 배당 결합 — 3구간 비교",
  },
  {
    path: "self-dividend",
    title: "자가배당 vs 배당주",
    group: "법인·배당",
    description: "법인 자가배당과 배당주 직접 보유의 실수익 비교",
  },
];
