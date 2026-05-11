/**
 * 시장 데이터 캐시 설정
 *
 * 서비스 운영자가 코드로 직접 관리 — 수정 후 배포 시 반영됩니다.
 * DB/환경변수가 아닌 코드로 관리하므로 변경 이력이 git에 남습니다.
 */
export const MARKET_CACHE = {
  /**
   * 종목 시세 캐시 TTL (초)
   * Naver/Stooq 자체가 15분 지연 시세를 제공하므로 5분이면 충분합니다.
   */
  PRICE_TTL_SECONDS: 5 * 60,

  /**
   * 배당 이력 캐시 TTL (초)
   * 배당은 분기·월 단위로 바뀌므로 6시간으로 설정합니다.
   */
  DIVIDEND_TTL_SECONDS: 6 * 60 * 60,
} as const;
