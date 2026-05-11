-- ============================================================================
-- 투자 목표(버킷) 추적 스키마
-- 예: "SCHD 3억 모으기", "QQQ 3억 모으기", "S&P500 2억 모으기"
--
-- 핵심 아이디어:
--   ① investment_goals    — 목표 정의 (이름, 목표금액, 색상)
--   ② goal_ticker_map     — 목표 ↔ 티커 매핑 (어떤 종목이 이 버킷에 속하는지)
--   ③ goal_daily_snapshots — cron이 매일 계산해 저장하는 목표별 평가금액
--
-- P&L 차트 계산 방식:
--   daily_pnl          = today.total_krw - yesterday.total_krw
--   monthly_cumulative = SUM(daily_pnl) WHERE month = this_month
--   annual_cumulative  = SUM(daily_pnl) WHERE year  = this_year
-- ============================================================================

-- ── ① 투자 목표 정의 ──────────────────────────────────────────────────────────
CREATE TABLE public.investment_goals (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text        NOT NULL,             -- "SCHD 3억 모으기"
  target_krw  bigint,                           -- 300000000 (3억원, NULL = 목표 없음)
  color       text        NOT NULL DEFAULT '#6366f1',
  sort_order  int         NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX investment_goals_user_id_idx ON public.investment_goals(user_id);

-- ── ② 목표 ↔ 티커 매핑 ───────────────────────────────────────────────────────
-- 하나의 티커는 여러 목표에 중복 등록 가능 (예: QQQ → 나스닥 목표 + 전체 목표)
-- account_type_filter: NULL이면 모든 계좌 포함, 값이 있으면 해당 계좌 유형만 집계
--   예) Tiger미국배당 -> pension_fund 계좌만 포함할 때 'pension_fund' 지정
CREATE TABLE public.goal_ticker_map (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id             uuid NOT NULL REFERENCES public.investment_goals(id) ON DELETE CASCADE,
  ticker              text NOT NULL,   -- "SCHD", "069500", "1655"
  market              text NOT NULL,   -- "NYSE", "KRX", "TSE"
  account_type_filter text,            -- NULL = 전체 / 'pension_fund' | 'isa' | 'irp' | 'regular' | 'corp' | 'bank' | 'overseas'
  display_label       text,            -- 커스텀 표시명 (NULL이면 raw_name 사용)
  UNIQUE(goal_id, ticker, market)
);

CREATE INDEX goal_ticker_map_goal_id_idx  ON public.goal_ticker_map(goal_id);
CREATE INDEX goal_ticker_map_ticker_idx   ON public.goal_ticker_map(ticker, market);

-- ── ③ 목표별 일별 스냅샷 (cron 저장) ─────────────────────────────────────────
-- cron이 portfolio_daily_snapshots와 동시에 계산해 저장
-- breakdown JSONB 구조:
-- {
--   "by_account_type": { "pension_fund": 123456789, "regular": 98765432 },
--   "holdings": [
--     {
--       "ticker":    "SCHD",
--       "name":      "Schwab US Dividend Equity",
--       "qty":       100.5,
--       "currency":  "USD",
--       "eval_krw":  13456789,
--       "cost_krw":  12345678,   -- avg_price × qty × 환율 (null이면 eval_krw로 대체)
--       "account_type": "regular"
--     }
--   ]
-- }
CREATE TABLE public.goal_daily_snapshots (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id        uuid        NOT NULL REFERENCES public.investment_goals(id) ON DELETE CASCADE,
  snapshot_date  date        NOT NULL,
  total_krw      bigint      NOT NULL,              -- 당일 목표 합산 평가금액
  cost_basis_krw bigint,                            -- 투입 원금 추정 (avg_price × qty 합산)
  unrealized_pnl_krw bigint GENERATED ALWAYS AS    -- 미실현 손익 (자동 계산)
    (CASE WHEN cost_basis_krw IS NOT NULL
          THEN total_krw - cost_basis_krw
          ELSE NULL END) STORED,
  usd_krw_rate   numeric(10,2),
  breakdown      jsonb,
  UNIQUE(user_id, goal_id, snapshot_date)
);

CREATE INDEX goal_daily_snapshots_user_goal_date_idx
  ON public.goal_daily_snapshots(user_id, goal_id, snapshot_date DESC);

-- ── 트리거 ────────────────────────────────────────────────────────────────────
CREATE TRIGGER trg_investment_goals_touch
  BEFORE UPDATE ON public.investment_goals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.investment_goals      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_ticker_map       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_daily_snapshots  ENABLE ROW LEVEL SECURITY;

-- investment_goals: 본인 행만
CREATE POLICY "investment_goals: own rows" ON public.investment_goals
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- goal_ticker_map: 부모 goal이 본인 것일 때만
CREATE POLICY "goal_ticker_map: via goal" ON public.goal_ticker_map
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.investment_goals g
      WHERE g.id = goal_ticker_map.goal_id AND g.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.investment_goals g
      WHERE g.id = goal_ticker_map.goal_id AND g.user_id = auth.uid()
    )
  );

-- goal_daily_snapshots: 본인 행만
CREATE POLICY "goal_daily_snapshots: own rows" ON public.goal_daily_snapshots
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── 뷰: 월간 P&L 집계 (차트용 편의 뷰) ───────────────────────────────────────
-- 윈도우 함수는 CTE에서 먼저 계산, 바깥에서 GROUP BY 집계
CREATE OR REPLACE VIEW public.goal_monthly_pnl AS
WITH daily AS (
  SELECT
    user_id,
    goal_id,
    snapshot_date,
    total_krw,
    total_krw - LAG(total_krw, 1, total_krw)
      OVER (PARTITION BY user_id, goal_id ORDER BY snapshot_date) AS daily_pnl
  FROM public.goal_daily_snapshots
)
SELECT
  user_id,
  goal_id,
  DATE_TRUNC('month', snapshot_date)::date AS month,
  SUM(daily_pnl)   AS monthly_pnl_krw,
  MAX(total_krw)   AS peak_krw,
  MIN(total_krw)   AS trough_krw
FROM daily
GROUP BY user_id, goal_id, DATE_TRUNC('month', snapshot_date);

-- ── 뷰: 연간 P&L 집계 ─────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.goal_annual_pnl AS
WITH daily AS (
  SELECT
    user_id,
    goal_id,
    snapshot_date,
    total_krw,
    total_krw - LAG(total_krw, 1, total_krw)
      OVER (PARTITION BY user_id, goal_id ORDER BY snapshot_date) AS daily_pnl
  FROM public.goal_daily_snapshots
)
SELECT
  user_id,
  goal_id,
  DATE_PART('year', snapshot_date)::int AS year,
  SUM(daily_pnl)   AS annual_pnl_krw,
  MAX(total_krw)   AS peak_krw,
  MIN(total_krw)   AS trough_krw
FROM daily
GROUP BY user_id, goal_id, DATE_PART('year', snapshot_date);
