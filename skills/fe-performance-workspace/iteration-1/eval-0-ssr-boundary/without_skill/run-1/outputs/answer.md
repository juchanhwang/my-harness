# PR 리뷰: LCP 4초 초과 — `layout.tsx` `'use client'` 경계 문제

## TL;DR

동료의 제안(ThemeProvider를 `next/dynamic`으로 lazy load)은 **부분적으로만 맞고, 근본 원인 진단을 빠뜨렸습니다.** `next/dynamic` 단독으로는 LCP를 유의미하게 개선하지 못하며, 오히려 상황에 따라 더 나빠질 수 있습니다. 올바른 접근은 **`'use client'` 경계를 root layout에서 제거하고, ThemeProvider 자체를 격리된 Client Component로 분리**하는 것입니다.

---

## 1. 현재 코드의 문제

```tsx
// app/layout.tsx (현재 — 잘못된 패턴)
'use client'  // ← 이 한 줄이 모든 문제의 원인

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
```

### 문제점 1: 전체 트리가 Client Component로 강등

`'use client'`를 `layout.tsx` 최상단에 선언하면, **이 파일 아래에 import된 모든 모듈**이 클라이언트 번들에 포함됩니다. Next.js App Router의 핵심 가치인 "서버에서 렌더링해 HTML을 즉시 전송"하는 능력을 레이아웃 전체에서 포기하는 셈입니다.

> **근거**: Next.js 공식 문서 — [Server and Client Components](https://nextjs.org/docs/app/building-your-application/rendering/server-components)
> > "Moving Client Components down the tree" 섹션에서, `'use client'` 경계를 트리 상단에 두면 하위 모든 컴포넌트가 클라이언트 번들에 들어간다고 명시합니다.

### 문제점 2: RSC 스트리밍 비활성화

App Router는 서버에서 HTML을 스트리밍하여 LCP를 단축합니다. `layout.tsx`가 Client Component가 되면 이 레이아웃 아래의 콘텐츠는 **JavaScript 번들이 로드·파싱·실행된 후에야** 화면에 나타납니다. LCP 4초의 직접 원인입니다.

### 문제점 3: `children`이 Server Component여야 하는 페이지들을 클라이언트 컨텍스트에 가둠

`children`으로 전달되는 각 `page.tsx`가 서버 컴포넌트로 선언되어 있어도, `'use client'` 레이아웃이 그것들을 감싸면 번들링 경계가 이상하게 형성됩니다. Hydration 비용이 전체 트리로 확산됩니다.

---

## 2. 동료 제안 분석: `next/dynamic`으로 ThemeProvider lazy load

```tsx
// 동료가 제안한 방향
const ThemeProvider = dynamic(() => import('./ThemeProvider'), { ssr: false })
```

### 왜 이 접근이 틀렸는가

| 항목 | 설명 |
|------|------|
| **근본 원인 미해결** | `'use client'`가 `layout.tsx`에 남아 있으면 전체 트리의 서버 렌더링 불가 문제가 그대로입니다. |
| **`ssr: false`의 부작용** | ThemeProvider가 클라이언트에서만 마운트되므로, children 전체가 hydration 전까지 theme이 적용되지 않아 **FOUC(Flash of Unstyled Content)**가 발생합니다. |
| **LCP 개선 없음** | `next/dynamic`은 코드 스플리팅으로 번들 크기를 줄이는 도구입니다. SSR 렌더링 경계 자체를 바꾸지 않습니다. LCP는 첫 HTML 응답 속도에 의존하는데, 이 접근은 그 경로를 건드리지 않습니다. |
| **오히려 LCP 악화 가능** | `ssr: false`로 ThemeProvider를 defer하면 children 렌더링도 지연될 수 있어, 레이아웃 시프트 + LCP 악화로 이어질 위험이 있습니다. |

> **근거**: Next.js 공식 문서 — [Lazy Loading](https://nextjs.org/docs/app/building-your-application/optimizing/lazy-loading)
> > "`next/dynamic`은 컴포넌트가 처음 렌더링될 때까지 로딩을 지연"합니다. SSR 경계 최적화 도구가 아닙니다.

---

## 3. 올바른 해결책

### Step 1: `layout.tsx`에서 `'use client'` 제거

```tsx
// app/layout.tsx (수정 후)
// 'use client' 제거 — layout은 Server Component로 유지

import { Providers } from './providers'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
```

### Step 2: Client Component를 별도 파일로 분리

```tsx
// app/providers.tsx
'use client'  // ← 여기에만 선언

import { ThemeProvider } from 'next-themes' // 또는 사용 중인 라이브러리

export function Providers({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>
}
```

### 왜 이 패턴이 올바른가

- `layout.tsx`는 Server Component로 유지 → 서버에서 HTML을 즉시 생성·스트리밍
- `'use client'` 경계가 `Providers`라는 작은 컴포넌트에만 국한
- `children`(각 page의 서버 컴포넌트 콘텐츠)은 **서버에서 렌더링된 후** Providers에 주입되므로, Hydration 대상이 최소화됨

> **근거**: Next.js 공식 문서 — [Rendering: Composition Patterns](https://nextjs.org/docs/app/building-your-application/rendering/composition-patterns)
> > "Supported Pattern: Passing Server Components to Client Components as Props" — `children`을 서버 컴포넌트로 유지한 채 Client Component에 주입하는 패턴을 권장합니다.

---

## 4. 추가 진단: LCP 4초의 다른 원인 가능성

`'use client'` 제거 외에도 다음을 함께 확인해야 합니다.

### 4-1. LCP 대상 이미지 최적화

```tsx
// 나쁜 패턴
<img src="/hero.jpg" />

// 올바른 패턴
import Image from 'next/image'
<Image src="/hero.jpg" priority alt="..." fill />
```

LCP 요소가 이미지라면 `priority` prop을 반드시 추가하세요. 이 prop이 없으면 Next.js가 해당 이미지를 preload하지 않습니다.

> **근거**: Next.js 공식 문서 — [Image Optimization: priority](https://nextjs.org/docs/app/api-reference/components/image#priority)

### 4-2. 폰트 렌더링 블로킹

```tsx
// 올바른 패턴 — next/font 사용
import { Inter } from 'next/font/google'
const inter = Inter({ subsets: ['latin'] })
```

외부 `@import`나 `<link>` 태그로 Google Fonts를 불러오면 렌더링이 차단됩니다. `next/font`를 사용하면 빌드 타임에 폰트를 최적화하고 FOUT를 방지합니다.

### 4-3. 불필요한 서드파티 스크립트

ThemeProvider 외에 `layout.tsx`에 analytics, 광고, 챗 위젯 등의 스크립트가 포함되어 있다면 `next/script`의 `strategy="lazyOnload"` 또는 `afterInteractive`로 지연 로딩해야 합니다.

---

## 5. 진단 방법

```bash
# 번들 분석
ANALYZE=true next build

# Lighthouse CI로 LCP 측정
npx lhci autorun

# React DevTools Profiler
# Chrome DevTools → Performance 탭에서 "Server-side rendered" 항목 확인
```

또한 Chrome DevTools Network 탭에서 첫 HTML 응답 크기와 TTFB를 확인하세요. TTFB가 200ms 이내라면 렌더링 경계 문제, 그 이상이라면 서버/DB 성능 문제입니다.

---

## 6. 변경 요약

| | 변경 전 | 변경 후 |
|--|---------|---------|
| `layout.tsx` | `'use client'` 선언, ThemeProvider 직접 포함 | Server Component, `<Providers>` import만 |
| `providers.tsx` | 없음 | `'use client'` + ThemeProvider 캡슐화 |
| SSR 적용 범위 | 레이아웃 전체 클라이언트 렌더링 | 페이지 콘텐츠 전체 서버 렌더링 |
| 예상 LCP 개선 | — | 2초 이내 (TTFB + 스트리밍 기준) |

---

## 결론

**동료의 `next/dynamic` 제안은 채택하지 마세요.** 해결책은 `'use client'`를 root layout에서 제거하고 ThemeProvider를 격리된 `providers.tsx`로 분리하는 것입니다. 이 패턴은 Next.js 공식 문서에서 권장하는 "Composition Pattern"이며, LCP를 포함한 Core Web Vitals 전반을 개선합니다.
