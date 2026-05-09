-- yellowdog initial schema
-- Tables: accounts, securities, snapshots, holdings, simulation_runs
-- All user-scoped tables enforce RLS via auth.uid()

set check_function_bodies = off;

-- ============================================================================
-- 1) accounts: 연저펀/ISA/IRP/일반계좌/법인/은행
-- ============================================================================
create table public.accounts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null check (type in (
                'pension_fund', -- 연금저축펀드
                'isa',
                'irp',
                'regular',      -- 일반 위탁계좌
                'corp',         -- 법인 계좌
                'bank',
                'overseas'      -- 해외증권 직접투자
              )),
  broker      text,             -- "미래에셋", "키움", "토스증권" 등
  nickname    text,             -- "메인 연저펀"
  currency    text not null default 'KRW',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index accounts_user_id_idx on public.accounts(user_id);

-- ============================================================================
-- 2) securities: 종목 마스터 (raw_name → ticker 매핑 캐시)
-- ============================================================================
create table public.securities (
  id              uuid primary key default gen_random_uuid(),
  ticker          text,                              -- "069500" or "VOO"
  name            text not null,
  market          text,                              -- KRX/NYSE/NASDAQ/etc
  currency        text not null default 'KRW',
  is_overseas_etf boolean not null default false,
  created_at      timestamptz not null default now(),
  unique (ticker, market)
);

-- ============================================================================
-- 3) snapshots: OCR 1회 캡처 단위 (또는 수동 입력 단위)
-- ============================================================================
create table public.snapshots (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  account_id    uuid not null references public.accounts(id) on delete cascade,
  captured_at   timestamptz not null,                -- 화면에 보이는 시각(사용자 보정 가능)
  source        text not null default 'ocr' check (source in ('ocr','manual')),
  image_path    text,                                -- Supabase Storage 경로
  ocr_raw       jsonb,                               -- Claude 응답 원본
  ocr_model     text,                                -- "claude-opus-4-7"
  status        text not null default 'draft' check (status in ('draft','confirmed')),
  total_eval    numeric(18,2),                       -- 총 평가금액(편의용 캐시)
  notes         text,
  created_at    timestamptz not null default now(),
  confirmed_at  timestamptz
);
create index snapshots_user_id_idx on public.snapshots(user_id);
create index snapshots_account_id_captured_at_idx on public.snapshots(account_id, captured_at desc);

-- ============================================================================
-- 4) holdings: snapshot에 속한 종목 라인
-- ============================================================================
create table public.holdings (
  id            uuid primary key default gen_random_uuid(),
  snapshot_id   uuid not null references public.snapshots(id) on delete cascade,
  security_id   uuid references public.securities(id),
  raw_name      text not null,                       -- OCR이 읽은 원문
  quantity      numeric(18,6) not null,
  avg_price     numeric(18,4),
  market_price  numeric(18,4),
  eval_amount   numeric(18,2),                       -- 평가금액
  profit_loss   numeric(18,2),
  currency      text not null default 'KRW',
  created_at    timestamptz not null default now()
);
create index holdings_snapshot_id_idx on public.holdings(snapshot_id);

-- ============================================================================
-- 5) simulation_runs: 시뮬레이터 실행 기록
-- ============================================================================
create table public.simulation_runs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  simulator   text not null,                          -- 'pension-tax' | 'depletion' | ...
  inputs      jsonb not null,
  outputs     jsonb not null,
  note        text,
  created_at  timestamptz not null default now()
);
create index simulation_runs_user_id_simulator_idx on public.simulation_runs(user_id, simulator);

-- ============================================================================
-- updated_at trigger helper
-- ============================================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_accounts_touch
  before update on public.accounts
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.accounts        enable row level security;
alter table public.snapshots       enable row level security;
alter table public.holdings        enable row level security;
alter table public.simulation_runs enable row level security;
alter table public.securities      enable row level security;

-- accounts: 본인 행만
create policy "accounts: own rows" on public.accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- snapshots: 본인 행만
create policy "snapshots: own rows" on public.snapshots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- holdings: 부모 snapshot이 본인 것일 때만
create policy "holdings: via snapshot" on public.holdings
  for all using (
    exists (
      select 1 from public.snapshots s
      where s.id = holdings.snapshot_id and s.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.snapshots s
      where s.id = holdings.snapshot_id and s.user_id = auth.uid()
    )
  );

-- simulation_runs: 본인 행만
create policy "simulation_runs: own rows" on public.simulation_runs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- securities: 마스터 — 인증된 사용자 모두 read, write도 허용 (raw_name 매핑 시 insert 필요)
create policy "securities: authenticated read"  on public.securities
  for select using (auth.role() = 'authenticated');
create policy "securities: authenticated write" on public.securities
  for insert with check (auth.role() = 'authenticated');
create policy "securities: authenticated update" on public.securities
  for update using (auth.role() = 'authenticated');

-- ============================================================================
-- Storage bucket for OCR raw images (executed separately via Supabase dashboard
-- or `supabase storage create snapshots-raw`):
--   bucket: snapshots-raw, private (signed URLs only)
-- ============================================================================
