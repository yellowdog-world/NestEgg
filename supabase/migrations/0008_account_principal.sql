-- accounts 테이블에 사용자가 직접 입력하는 실제 투자금(납입원금) 컬럼 추가
-- 단위: 원(KRW). NULL = 미입력 (취득원가 기준 표시)
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS principal_krw bigint DEFAULT NULL;
