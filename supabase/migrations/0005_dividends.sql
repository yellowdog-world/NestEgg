-- yellowdog: 배당 수령 내역 테이블
-- received_at: 실제 수령일(date)
-- amount_original: 원본 통화 금액(USD면 달러, KRW면 원화)
-- amount_krw: 원화 환산액(입력 시점 환율 기준)

create table public.dividends (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  account_id      uuid references public.accounts(id) on delete set null,
  received_at     date not null,
  ticker          text,
  name            text not null,
  quantity        numeric(18,6),
  per_share       numeric(18,6),
  currency        text not null default 'KRW',
  amount_original numeric(18,4) not null,
  amount_krw      numeric(18,2) not null,
  usd_krw_rate    numeric(10,2),
  dividend_type   text not null default 'monthly'
                  check (dividend_type in ('regular', 'monthly', 'special')),
  notes           text,
  created_at      timestamptz not null default now()
);

create index dividends_user_id_received_at_idx
  on public.dividends(user_id, received_at desc);

alter table public.dividends enable row level security;

create policy "dividends: own rows" on public.dividends
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
