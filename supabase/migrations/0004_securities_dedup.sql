-- 0004_securities_dedup.sql
-- 1. securities 중복 정리 (동일 ticker, 다른 market으로 중복 삽입된 행 제거)
-- 2. holdings.security_id (uuid FK) → security_ticker + security_market (복합 FK) 전환
-- 3. securities PK: uuid id → (ticker, market) 복합 PK
-- 4. securities id 컬럼 제거
-- ※ 모든 DROP은 IF EXISTS 처리 — 부분 실행 후 재시도해도 안전

begin;

-- ── Step 1. 중복 정리 ────────────────────────────────────────────────────────
-- security_id 컬럼이 아직 있는 경우에만 실행 (이미 전환된 경우 건너뜀)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'holdings' and column_name = 'security_id'
  ) then

    create temp table if not exists _sec_keep as
    with agg as (
      select s.id, s.ticker, s.market, s.created_at, count(h.id) as ref_count
      from securities s
      left join holdings h on h.security_id = s.id
      group by s.id
    ),
    ranked as (
      select id, ticker, market,
        row_number() over (
          partition by ticker
          order by ref_count desc, created_at asc
        ) as rn
      from agg
    )
    select id as keep_id, ticker, market
    from ranked where rn = 1;

    -- 삭제될 행을 참조하는 holdings → 유지 행으로 재연결
    update holdings h
    set security_id = k.keep_id
    from _sec_keep k
    join securities dup on dup.ticker = k.ticker and dup.id <> k.keep_id
    where h.security_id = dup.id;

    -- 중복 행 삭제
    delete from securities
    where id not in (select keep_id from _sec_keep);

  end if;
end $$;

-- ── Step 2. holdings에 ticker/market 컬럼 추가 및 데이터 채우기 ───────────────

alter table holdings
  add column if not exists security_ticker text,
  add column if not exists security_market text;

-- security_id 가 있으면 조인해서 채우기
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'holdings' and column_name = 'security_id'
  ) then
    update holdings h
    set
      security_ticker = s.ticker,
      security_market = s.market
    from securities s
    where h.security_id = s.id
      and h.security_ticker is null;
  end if;
end $$;

-- ── Step 3. securities PK 전환: uuid id → (ticker, market) ──────────────────

-- holdings.security_id FK 제거 (이름이 다를 수 있으므로 동적 처리)
do $$
declare
  v_constraint text;
begin
  select conname into v_constraint
  from pg_constraint
  where conrelid = 'holdings'::regclass
    and contype = 'f'
    and conname like '%security_id%';
  if v_constraint is not null then
    execute 'alter table holdings drop constraint ' || quote_ident(v_constraint);
  end if;
end $$;

-- securities 기존 PK(uuid) 및 unique 제약 제거 (동적 처리)
do $$
declare
  v_constraint text;
begin
  -- uuid PK 제거
  select conname into v_constraint
  from pg_constraint
  where conrelid = 'securities'::regclass
    and contype = 'p';
  if v_constraint is not null then
    execute 'alter table securities drop constraint ' || quote_ident(v_constraint);
  end if;

  -- unique(ticker, market) 제거
  for v_constraint in
    select conname from pg_constraint
    where conrelid = 'securities'::regclass
      and contype = 'u'
  loop
    execute 'alter table securities drop constraint ' || quote_ident(v_constraint);
  end loop;
end $$;

-- id 컬럼 제거
alter table securities drop column if exists id;

-- (ticker, market) 복합 PK 추가 (이미 있으면 건너뜀)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'securities'::regclass and contype = 'p'
  ) then
    alter table securities
      add constraint securities_pkey primary key (ticker, market);
  end if;
end $$;

-- ── Step 4. holdings FK 전환 ─────────────────────────────────────────────────

-- security_id 컬럼 제거
alter table holdings drop column if exists security_id;

-- 복합 FK 추가 (이미 있으면 건너뜀)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'holdings'::regclass
      and conname = 'holdings_security_fkey'
  ) then
    alter table holdings
      add constraint holdings_security_fkey
      foreign key (security_ticker, security_market)
      references securities (ticker, market)
      on delete set null;
  end if;
end $$;

commit;
