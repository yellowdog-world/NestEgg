-- 0006_holdings_account_id.sql
-- holdings 테이블에 account_id 직접 참조 추가
-- 목적: 스냅샷 종속 없이 계좌별 현재 보유 종목을 직접 관리
-- 변경: account_id 추가(NOT NULL), snapshot_id → nullable
-- RLS: snapshot 경유 → account_id 직접 확인으로 전환

begin;

-- 1. account_id 컬럼 추가 (초기 nullable — 데이터 채운 뒤 NOT NULL로 변경)
alter table public.holdings
  add column if not exists account_id uuid references public.accounts(id) on delete cascade;

-- 2. 기존 행: snapshot → account 경유로 account_id 채우기
update public.holdings h
set account_id = s.account_id
from public.snapshots s
where s.id = h.snapshot_id
  and h.account_id is null;

-- 3. account_id NOT NULL 제약 추가
--    (위 UPDATE 후 여전히 null인 행이 있으면 실패하므로 데이터 무결성 보장)
alter table public.holdings
  alter column account_id set not null;

-- 4. snapshot_id nullable로 변경 (OCR 연결 정보는 유지하되 필수 아님)
alter table public.holdings
  alter column snapshot_id drop not null;

-- 5. account_id 인덱스 추가 (계좌별 holdings 조회 최적화)
create index if not exists holdings_account_id_idx
  on public.holdings(account_id);

-- 6. RLS 정책 교체: snapshot 경유 → account_id 직접 확인
drop policy if exists "holdings: via snapshot" on public.holdings;

create policy "holdings: via account" on public.holdings
  for all
  using (
    exists (
      select 1 from public.accounts a
      where a.id = holdings.account_id
        and a.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.accounts a
      where a.id = holdings.account_id
        and a.user_id = auth.uid()
    )
  );

commit;
