-- 매일 배치(한국 07:00)로 포트폴리오 총액을 기록하는 테이블
-- cron: /api/cron/daily-snapshot (Vercel Cron 22:00 UTC = KST 07:00)

create table public.portfolio_daily_snapshots (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  snapshot_date date not null,
  total_krw     numeric(18,2) not null,
  usd_krw_rate  numeric(10,4),
  breakdown     jsonb,          -- 계좌별 상세 { accounts: [{account_id, broker, type, total_krw, holdings:[...]}] }
  created_at    timestamptz not null default now(),
  unique (user_id, snapshot_date)
);

create index portfolio_daily_snapshots_user_date_idx
  on public.portfolio_daily_snapshots(user_id, snapshot_date desc);

alter table public.portfolio_daily_snapshots enable row level security;

create policy "portfolio_daily_snapshots: own rows"
  on public.portfolio_daily_snapshots
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
