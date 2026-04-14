# Styling

> 핵심 메시지: **"Tailwind v4는 CSS-first다. `tailwind.config.js`로 생각하지 말고 `@theme`으로 생각하라."**

이 문서는 Claude의 학습 데이터가 v3 기준이라 v4에서 틀리기 쉬운 지점에 집중한다. 일반 Tailwind 사용법이나 반응형 디자인 같은 기본 지식은 설명하지 않는다. 컴포넌트 합성·변형 관리(`cva`)는 [design-system.md](design-system.md)를 참조한다.

***

## 1. Tailwind v4 — v3와 달라진 것

### 1.1 설정은 CSS에서

v4는 `tailwind.config.js`를 **자동 감지하지 않는다.** 모든 설정이 CSS에서 이루어진다.

```css
/* ❌ v3 — v4에서는 적용 안 됨 */
// tailwind.config.ts
theme: { extend: { colors: { brand: '#3b82f6' } } }

/* ✅ v4 */
@import "tailwindcss";

@theme {
  --color-brand: oklch(0.63 0.24 264);
}
```

기존 JS config를 호환 목적으로 쓰려면 `@config "./tailwind.config.js";`를 명시적으로 선언해야 한다 — 마이그레이션 중에만 사용한다.

### 1.2 엔트리 · PostCSS

```css
/* ❌ v3 */
@tailwind base; @tailwind components; @tailwind utilities;

/* ✅ v4 */
@import "tailwindcss";
```

PostCSS 체인: `tailwindcss` → **`@tailwindcss/postcss`** (별도 패키지), `autoprefixer`/`postcss-import` 제거(v4 내장). Vite는 `@tailwindcss/vite` 전용 플러그인.

### 1.3 이름·기본값 변경 — 디자인 regression 유발

v3와 같은 클래스명인데 의미가 달라진 것들. v3 감각으로 쓰면 시각적으로 틀어진다.

| v3 | v4 | 비고 |
|---|---|---|
| `shadow-sm` | `shadow-xs` | |
| `shadow` | `shadow-sm` | |
| `rounded-sm` | `rounded-xs` | |
| `ring` (3px) | `ring-3` | `ring`은 이제 1px |
| `outline-none` | `outline-hidden` | |
| `bg-opacity-50` | `bg-black/50` | |
| `flex-shrink-0` → `shrink-0`, `flex-grow` → `grow` | | |
| `bg-[--var]` | `bg-(--var)` | |
| `border` 기본색 `gray-200` | **`currentColor`** | **regression 1순위** |

`border` 기본색이 `currentColor`로 바뀌어서 `<div className="border">`는 부모 색을 따라간다. 명시적으로 `border-border`(shadcn 시맨틱) 또는 `border-gray-200`을 지정한다.

### 1.4 커스텀 유틸리티 — `@utility`

```css
/* ❌ v3 — v4에서는 variant(hover:, lg: 등) 미적용 */
@layer utilities { .tab-4 { tab-size: 4; } }

/* ✅ v4 */
@utility tab-4 { tab-size: 4; }
```

### 1.5 다크 모드

`darkMode: 'class'`는 v4에 없다. 기본은 `prefers-color-scheme`이며, 클래스 기반은 `@custom-variant dark (&:where(.dark, .dark *));`로 선언한다.

### 1.6 기타 제약

- **Sass/Less/Stylus 사용 불가** — v4 자체가 전처리기 역할
- **브라우저 요구사항**: Safari 16.4+, Chrome 111+, Firefox 128+

> 📎 출처: [Tailwind v4 Upgrade Guide](https://tailwindcss.com/docs/upgrade-guide)

***

## 2. 디자인 토큰 — `@theme inline` 패턴

`@theme`에 선언한 CSS 변수는 **namespace prefix에 따라 자동으로 유틸리티 클래스가 생성된다.** `--color-*` → `bg-*`/`text-*`/`border-*`, `--font-*` → `font-*`, `--radius-*` → `rounded-*` 등. namespace가 없는 변수는 유틸리티가 생성되지 않으므로 `:root`에 둔다.

### `@theme inline` — shadcn/ui 필수 패턴

shadcn/ui는 light/dark 토글이 필요하므로 **값은 `:root`와 `.dark`에 두고, `@theme inline`으로 Tailwind 유틸리티에 연결**한다.

```css
@import "tailwindcss";

/* 1. 값은 :root/.dark에 (런타임 토글 대상) */
:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --radius: 0.625rem;
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);
}

/* 2. @theme inline으로 Tailwind 유틸리티에 연결 */
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  --radius-lg: var(--radius);
  --radius-md: calc(var(--radius) - 2px);
}
```

**`inline`이 필수인 이유:** 없으면 Tailwind가 토큰을 번들 시점에 고정 해석해서 `.dark`의 런타임 override가 반영되지 않는다. `inline`은 "런타임에 해석하라"는 뜻이다.

**주의:** `:root`와 `.dark`는 `@layer base` **밖에** 둔다(shadcn v4 공식 — cascade 충돌 방지).

신규 프로젝트는 **OKLCH** 기반을 쓴다. shadcn v4와 Tailwind v4 기본 팔레트 모두 OKLCH로 재정의되었다.

> 📎 출처: [shadcn/ui Theming](https://ui.shadcn.com/docs/theming)

***

## 3. 색상 — 시맨틱 토큰만

**Arbitrary hex 색상(`bg-[#3b82f6]`)과 Tailwind 기본 색상(`bg-blue-500`)은 금지한다.** 다크 모드 미대응이고, 디자인 시스템 이탈이다. shadcn semantic token만 사용한다: `background`/`foreground`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring` 등.

```tsx
// ❌
<div className="bg-[#3b82f6]">
<div className="bg-blue-500">

// ✅
<div className="bg-primary text-primary-foreground">
```

**예외:** 디자이너 스펙의 한 번만 쓰는 픽셀 값(`top-[117px]`)은 허용. 2번 이상 쓰면 `@theme` 토큰으로 정의한다.

***

## 4. `cn()` — 클래스 병합

```ts
// lib/utils.ts (shadcn 공식)
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))
```

**`tailwind-merge`는 반드시 v3.5+를 쓴다.** v2.x는 Tailwind v3 전용이라 v4 프로젝트에서 클래스 병합이 잘못 동작한다.

`@theme`에 커스텀 색상을 추가했다면 `extendTailwindMerge`로 classGroups를 알려줘야 병합이 정상 동작한다. 증상: `cn("bg-brand-500", "bg-brand-700")`에서 둘 다 살아있으면 extend 누락.

**동적 클래스 금지:** Tailwind JIT는 `bg-${color}-500`을 감지 못한다. 전체 클래스 문자열 맵을 쓴다.

```tsx
const variants = {
  primary: "bg-primary text-primary-foreground",
  destructive: "bg-destructive text-destructive-foreground",
} as const
```

***

## 5. 애니메이션

### 선택 기준

| 요구사항 | 권장 |
|---|---|
| 단순 hover/focus transition | Tailwind `transition-*` |
| shadcn 기본 애니메이션(accordion, dialog) | **`tw-animate-css`** |
| Layout, gesture, spring, scroll-driven | **Motion for React** |
| 페이지 전환 | View Transitions API |

### 패키지명 주의 (Claude가 자주 틀림)

| 구 이름 | 현재 이름 | 비고 |
|---|---|---|
| `framer-motion` | **`motion`** | 2025년 리브랜드. `import { motion } from "motion/react"` |
| `tailwindcss-animate` | **`tw-animate-css`** | v4 CSS-first 철학에 맞춰 교체. shadcn v4 기본. 최소 1.4.0 |

### `prefers-reduced-motion`

모든 애니메이션은 이 사용자를 존중해야 한다 ([accessibility.md](accessibility.md) 체크리스트 항목).

```tsx
// Tailwind
<div className="transition hover:scale-105 motion-reduce:transition-none motion-reduce:hover:scale-100" />

// Motion for React
const reduced = useReducedMotion()
```

**Motion은 단순 효과에 쓰기엔 무겁다.** hover scale 같은 건 CSS로 충분하다. Layout animation, gesture, spring이 필요할 때만 Motion을 쓴다.

***

## 6. 안티패턴

```tsx
// ❌ v3 config에 토큰 추가 — v4에서 감지 안 됨
// tailwind.config.ts
theme: { extend: { colors: { brand: '#3b82f6' } } }

// ❌ @theme에 var() 직접 — 다크 모드 미작동
@theme { --color-background: var(--background); }
// ✅ @theme inline { --color-background: var(--background); }

// ❌ @layer utilities에 커스텀 유틸 — variant 미적용
@layer utilities { .tab-4 { tab-size: 4; } }
// ✅ @utility tab-4 { tab-size: 4; }

// ❌ 구 패키지명
framer-motion, tailwindcss-animate, tailwind-merge@2.x

// ❌ .btn 컴포넌트 클래스 — shadcn 철학 위반
.btn { @apply px-4 py-2 bg-primary; }
// ✅ cva 사용 (design-system.md)

// ❌ !important / 인라인 style 남용
<div style={{ padding: '20px' }}>  <div className="!p-5">
// ✅ <div className="p-5">
```

***

> 📎 관련: [design-system.md](design-system.md) · [accessibility.md](accessibility.md)
