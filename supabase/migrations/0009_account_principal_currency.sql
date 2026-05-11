-- principal_krw → principal_amount + principal_currency 로 교체
-- principal_currency 기본값 'KRW', USD도 지원
ALTER TABLE accounts DROP COLUMN IF EXISTS principal_krw;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS principal_amount numeric DEFAULT NULL;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS principal_currency text DEFAULT 'KRW';
