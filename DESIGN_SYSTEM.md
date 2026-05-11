# yellowdog 타이포그래피 디자인 시스템

> **타깃 사용자**: 40세 이상, 노안 배려 최소 가독성 확보  
> **기준 폰트**: Tailwind CSS 기본 스케일 (1rem = 16px)

---

## 타이포그래피 토큰

| 역할 | Tailwind 클래스 | px 환산 | 사용 위치 |
|---|---|---|---|
| **Page Title** | `text-3xl font-bold tracking-tight` | 30px | 모든 페이지 `<h1>` |
| **Page Description** | `text-base text-neutral-500` | 16px | h1 바로 아래 한 줄 설명 |
| **Section Label** | `text-sm font-semibold uppercase tracking-wider text-neutral-400` | 14px | 카드 내 섹션 구분 레이블 |
| **Card Title** | `text-lg font-semibold` | 18px | 카드/패널 헤더 `<h2>` |
| **Card Body** | `text-base text-neutral-700` | 16px | 카드 내 본문 텍스트 |
| **Card Meta** | `text-sm text-neutral-400` | 14px | 날짜, 단위, 부가 정보 |
| **Big Stat** | `text-3xl font-bold tabular-nums` | 30px | 금액 등 핵심 숫자 강조 |
| **Badge / Chip** | `text-xs font-semibold` | 12px | 태그, 상태 뱃지 |

---

## 사용 예시

```tsx
{/* ✅ 올바른 패턴 */}
<h1 className="text-3xl font-bold tracking-tight">내 자산</h1>
<p className="mt-0.5 text-base text-neutral-500">총 1.2억 · USD/KRW 1,380</p>

<section className="rounded-2xl border border-neutral-200 bg-white p-4">
  <h2 className="text-lg font-semibold">계좌별 현황</h2>
  <p className="text-sm text-neutral-400">2026.05.11 기준</p>
  <p className="text-base text-neutral-700">본문 내용...</p>
</section>

<p className="text-sm font-semibold uppercase tracking-wider text-neutral-400">
  인출 전략
</p>
```

---

## 금지 패턴

| ❌ 사용 금지 | ✅ 대체 |
|---|---|
| `text-xs` (본문/레이블) | `text-sm` |
| `text-2xl font-semibold` (h1) | `text-3xl font-bold` |
| `text-lg font-semibold` (h1) | `text-3xl font-bold` |
| `font-semibold` (h1) | `font-bold` |
| `text-[9px]`, `text-[10px]`, `text-[11px]` | `text-xs` 이상 |

---

## 적용 범위

- `app/**/*.tsx` — 페이지 컴포넌트
- `components/**/*.tsx` — 공통 컴포넌트
- MDX 컴포넌트 (`components/wiki/MdxComponents.tsx`)

---

## 예외 (디자인 토큰 적용 안 함)

- `text-2xl`, `text-3xl` 등 **금액·숫자 강조 표시** (Big Stat 토큰 별도 적용)
- 이모지 크기 (`text-2xl`, `text-3xl` 앞에 이모지만 있는 경우)
- OTP/인증번호 입력 (`text-xl tracking-widest` 유지)

---

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-05-11 | 초안 작성, 전체 43개 파일 일괄 적용 |
