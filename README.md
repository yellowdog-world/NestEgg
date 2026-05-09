# 🐕 yellowdog

> 은퇴 자산 관리 웹앱. **세금은 낮추고, 현금 흐름은 끝까지.**

정보 위키 + 시뮬레이터 + OCR 기반 자산 트래킹의 빌드업 구조.

## 구조

```
yellowdog/
├── app/                    # Next.js 라우트
│   ├── wiki/[...slug]      # MDX 동적 렌더 (12개 문서)
│   ├── sim/{name}          # 9개 시뮬레이터 페이지
│   ├── assets/             # 업로드/확인/대시보드/히스토리
│   └── api/                # /ocr, /snapshots, /accounts
├── content/wiki/           # MDX 문서 (basics/strategy/tax/lifestyle)
├── components/             # UI 컴포넌트
├── lib/
│   ├── supabase/           # 클라이언트(browser/server/middleware)
│   └── ocr/                # Claude Vision schema + claude.ts
├── simulators/             # 순수 함수 계산 (vitest 28개)
│   ├── tax/                # pensionIncomeTax, comprehensiveTax
│   ├── depletion/          # 결정론 자산 고갈
│   └── constants/2026.ts   # 세법 상수
└── supabase/migrations/    # 0001_init.sql (RLS 포함)
```

## 시뮬레이터 (9개)

- **세금**: 연금 인출 세금 / 1500만원 한도 / 해외 ETF 세금 비교 / 지역가입자 건보료
- **포트폴리오**: FIRE 계산기 / 자산 고갈 시점 / 은퇴 후 월급 플랜
- **법인·배당**: 법인 연봉 최적화(3구간) / 자가배당 vs 배당주

각 시뮬레이터는 `simulators/*.ts` 순수 함수 + `app/sim/{name}/page.tsx` 얇은 UI. vitest로 골든 케이스 테스트.

## 위키 (12개)

- **기초**: 연저펀 / ISA / IRP
- **전략**: 투자 우선순위 / 인출 순서와 세금
- **세금**: 1500만원 한도 / 종합과세 vs 분리 / 건보료 / 해외 ETF
- **라이프스타일**: 생활비 통계 / 달러↔원화 인출 / 퇴사날짜

위키 MDX에서 `<SimEmbed simulator="..." />`로 시뮬레이터 카드 임베드.

## 셋업

### 1. Supabase 프로젝트 생성

1. [supabase.com](https://supabase.com) → **New project** (region은 Northeast Asia — Seoul 권장)
2. **SQL Editor**에서 `supabase/migrations/0001_init.sql` 전체를 붙여넣고 Run
3. **Storage** → **New bucket**:
   - Name: `snapshots-raw`
   - Public bucket: ❌ 끔 (Private)
   - File size limit: `10 MB` 권장
4. **SQL Editor**에서 `supabase/migrations/0002_storage_policies.sql` 실행 (⚠️ 빠뜨리면 OCR 업로드 막힘)
5. **Authentication → Providers** → **Email** 활성화, **Confirm email** 끄거나 켜는 건 취향 (개발 중엔 끄는 게 편함)
6. **Authentication → URL Configuration** → **Site URL**에 `http://localhost:3000` 추가

### 2. 환경 변수

```bash
cp .env.local.example .env.local
```

`.env.local`을 열어 채우기:

```bash
# Supabase 대시보드 → Project Settings → API에서 복사
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...           # 서버 전용 (절대 클라이언트 노출 금지)

# https://console.anthropic.com/settings/keys 에서 발급
ANTHROPIC_API_KEY=sk-ant-...               # /api/ocr 전용
```

### 3. 실행

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm test         # 시뮬레이터 단위 테스트 28개
pnpm typecheck    # tsc --noEmit
pnpm build        # 프로덕션 빌드
```

### 4. 핸드폰에서 사용

같은 이메일로 로그인 후 `/assets/upload` → 카메라로 증권사 앱 화면 캡처 → AI가 자동 추출 → `/assets/confirm/{id}`에서 확인.

PWA 매니페스트가 포함되어 있어 모바일 브라우저에서 [홈 화면에 추가]로 앱처럼 사용 가능.

## 개발 노트

- **시뮬레이터 추가**: `simulators/foo.ts`에 `Simulator<I, O>` 작성 + `simulators/__tests__/foo.test.ts` 테스트 + `app/sim/foo/page.tsx` UI + `simulators/catalog.ts`에 메타 추가.
- **세법 상수 갱신**: 매년 `simulators/constants/{year}.ts` 새 파일 만들고 import 경로 교체.
- **위키 추가**: `content/wiki/{category}/{slug}.mdx` — frontmatter `title`, `description`, `order` 필수.
- **OCR 정확도 개선**: `lib/ocr/prompts.ts` 시스템 프롬프트와 `lib/ocr/schema.ts`의 description 강화. Anthropic SDK는 prompt caching이 적용되어 반복 호출 비용 절감.

## 핵심 결정

| 영역 | 선택 | 근거 |
|---|---|---|
| 프레임워크 | Next.js 16 + App Router | SSG(위키) + Dynamic(자산) 조합 |
| DB/Auth | Supabase | 매직 링크 + Storage + RLS 한 번에 |
| OCR | Claude Vision (tool_use) | JSON 직접 추출, raw text 후처리 불필요 |
| 차트 | Recharts | 자유도 높은 시뮬 결과 표시 |
| MDX | next-mdx-remote/rsc | 동적 슬러그 + frontmatter 색인 |
| 인증 | Magic Link | 1인 디바이스 동기화에 비밀번호 불필요 |
