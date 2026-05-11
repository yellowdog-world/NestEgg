-- ────────────────────────────────────────────────────────────────────────────
-- 시장 데이터 공유 캐시 테이블
-- 사용자별 데이터가 아닌 전체 공유 캐시 — 누가 먼저 조회하면 다음 사람도 사용 가능
-- ────────────────────────────────────────────────────────────────────────────

-- 종목 시세 캐시 (Naver Finance / Stooq)
CREATE TABLE IF NOT EXISTS public.market_price_cache (
  ticker          TEXT        NOT NULL,
  market          TEXT        NOT NULL,
  price           NUMERIC     NOT NULL,
  prev_close      NUMERIC,
  change_val      NUMERIC,        -- "change"는 예약어 충돌 방지
  change_percent  NUMERIC,
  currency        TEXT        NOT NULL DEFAULT 'KRW',
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ticker, market)
);

-- 배당 이력 캐시 (Yahoo Finance)
CREATE TABLE IF NOT EXISTS public.market_dividend_cache (
  ticker      TEXT        NOT NULL PRIMARY KEY,
  events      JSONB       NOT NULL DEFAULT '[]',  -- DividendEvent[] 직렬화
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: 인증 사용자 누구나 읽기/쓰기 (개인정보 없음, 공유 데이터)
ALTER TABLE public.market_price_cache    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_dividend_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "market_price_cache_select"
  ON public.market_price_cache FOR SELECT TO authenticated USING (true);
CREATE POLICY "market_price_cache_all"
  ON public.market_price_cache FOR ALL    TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "market_dividend_cache_select"
  ON public.market_dividend_cache FOR SELECT TO authenticated USING (true);
CREATE POLICY "market_dividend_cache_all"
  ON public.market_dividend_cache FOR ALL TO authenticated USING (true) WITH CHECK (true);
