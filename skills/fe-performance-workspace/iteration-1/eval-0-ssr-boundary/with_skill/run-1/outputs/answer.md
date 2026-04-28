# PR 리뷰 코멘트 — `layout.tsx` `'use client'` 경계 이슈 및 LCP 4초 문제

## 요약

**동료의 제안(`next/dynamic` lazy load)은 잘못된 방향입니다.** 근본 원인을 해결하지 못하고 오히려 LCP를 악화시킬 수 있습니다. 올바른 해결책은 **`'use client'` 경계를 최상위 layout에서 제거하고 ThemeProvider를 별도 Client Component로 분리해 push down**하는 것입니다.

---

## 1. 진단 — 무엇이 문제인가

### 현재 코드의 구조적 문제

```tsx
// ❌ 현재 — app/layout.tsx
'use client'

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
```

이 구조가 LCP 4초를 만드는 직접적 원인입니다.

**Next.js 공식 문서 인용:**

> "`'use client'` is used to declare a **boundary** between the Server and Client module graphs. Once a file is marked with `'use client'`, **all its imports and child components are considered part of the client bundle**."
>
> — [Next.js Docs · Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)

`layout.tsx`에 `'use client'`를 선언하는 순간 **앱 전체 트리가 Client Bundle에 포함**됩니다. 구체적으로 발생하는 문제는 다음과 같습니다.

| 증상 | 원인 |
|---|---|
| JS 번들 크기 폭증 | Server 전용 코드(DB 호출, 서버 라이브러리)가 client에 포함됨 |
| FCP 지연 | 서버가 정적으로 렌더할 수 있는 영역이 없어짐 |
| LCP 지연 | Streaming이 불가능해 모든 데이터 fetch가 완료될 때까지 첫 paint가 차단됨 |
| Streaming 무력화 | static shell이 없으므로 `<Suspense>` 경계의 효과가 사라짐 |

**팀 내부 knowledge base (performance-ssr.md) 안티패턴 섹션에도 명시:**

> ❌ **`'use client'`를 root layout에 추가** — 전체 트리가 client bundle에 들어간다. boundary는 가능한 한 깊게.

---

## 2. 동료의 제안이 틀린 이유 — `next/dynamic` lazy load

```tsx
// ❌ 동료 제안 — 잘못된 접근
'use client'

const ThemeProvider = dynamic(() => import('./theme-provider'), { ssr: false })

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
```

이 방법은 다음 이유로 올바르지 않습니다.

**① 근본 원인 미해결**: `layout.tsx`에 `'use client'`가 그대로 있으므로 **전체 트리가 Client Bundle에 포함되는 문제는 동일**합니다. ThemeProvider만 lazy load된다고 해서 경계 문제가 해결되지 않습니다.

**② `ssr: false`는 LCP를 악화시킵니다**: `ssr: false` 옵션은 해당 컴포넌트를 CSR 전용으로 만듭니다. ThemeProvider가 `children` 전체를 감싸고 있으므로, ThemeProvider가 hydrate되기 전까지 **자식 트리 전체가 렌더되지 않습니다.** LCP 요소가 ThemeProvider 안에 있다면 LCP는 오히려 더 늦어집니다.

**③ 올바른 `next/dynamic` 용도**: `next/dynamic`은 특정 컴포넌트의 코드 스플리팅을 위한 도구입니다. `'use client'` 경계 문제를 해결하는 도구가 아닙니다.

---

## 3. 올바른 해결책 — ThemeProvider를 별도 Client Component로 분리

**공식 권고 패턴:**

> "ThemeProvider가 `<html>` 전체가 아니라 `{children}`만 감싸도록 해서 Next.js가 Server Components의 static 부분을 최적화하기 쉽게 만들어라."
>
> → 최상위 layout이 `'use client'`가 되면 **하위 트리 전체가 client bundle**에 들어간다. Provider는 필요한 가장 깊은 지점에 둔다.
>
> — [Next.js Docs · Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)

### 수정 방법

**Step 1: ThemeProvider를 별도 파일로 분리**

```tsx
// app/_components/theme-provider.tsx
'use client'  // 'use client'는 이 파일에만

import { ThemeProvider as NextThemeProvider } from 'next-themes'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
    </NextThemeProvider>
  )
}
```

**Step 2: layout.tsx에서 `'use client'` 제거**

```tsx
// ✅ 수정 후 — app/layout.tsx (Server Component)
// 'use client' 없음!

import { ThemeProvider } from './_components/theme-provider'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
```

이렇게 하면:
- `layout.tsx`는 Server Component로 유지됩니다.
- `ThemeProvider` 파일만 Client Bundle에 포함됩니다.
- `children`(자식 컴포넌트들)은 여전히 Server Component로 렌더됩니다.

> **RSC children 합성 패턴 원리**: Server Component가 Client Component에 `children`을 prop으로 넘기는 방식은 유효합니다. `children`은 Server에서 미리 렌더되어 직렬화된 형태로 전달되기 때문에 Client Component가 감싸더라도 `children` 내부의 Server Component 특성이 유지됩니다.

---

## 4. Streaming으로 LCP를 추가 최적화

`'use client'` 경계 수정 후에도 layout이나 page 상단에서 `await`가 있다면 Streaming이 막혀 LCP가 지연될 수 있습니다.

**공식 문서 경고:**

> "If you `await` any of these [`params`, `searchParams`, `cookies()`, `headers()`, data fetches] at the top of a layout or page, **everything below that point becomes dynamic and cannot be prerendered as part of the static shell**."
>
> — [Next.js Docs · Streaming](https://nextjs.org/docs/app/guides/streaming)

**Web Vitals에 미치는 영향:**

| 지표 | Streaming 적용 시 효과 |
|---|---|
| **TTFB / FCP** | static shell이 즉시 전송 → 데이터 fetch와 분리됨 |
| **LCP** | LCP 요소가 `<Suspense>` 안에 있으면 boundary 해결 전 paint 안 됨 → **LCP 요소는 Suspense 밖(static shell)에 둔다** |
| **CLS** | skeleton fallback의 dimension을 실제 콘텐츠와 일치시킨다 |

```tsx
// ❌ layout 상단에서 await — 전체 트리가 dynamic, Streaming 불가
export default async function Layout({ children }) {
  const cookieStore = await cookies()
  return <div>{children}</div>
}

// ✅ Suspense 안에서 호출 — static shell + 점진적 stream
export default function Layout({ children }) {
  return (
    <div>
      <Suspense fallback={<UserSkeleton />}>
        <UserMenu /> {/* 내부에서 cookies() 호출 */}
      </Suspense>
      {children}
    </div>
  )
}
```

---

## 5. 측정 — 변경 전후 LCP를 반드시 측정하라

**수정 후 반드시 다음 도구로 검증하세요.**

**LCP 기준값 (web.dev 공식):**

| LCP | Good | Needs Improvement | Poor |
|---|---|---|---|
| 임계값 | ≤ 2.5 s | 2.5 s ~ 4.0 s | > 4.0 s |

> "To ensure you're hitting the recommended target for these metrics for most of your users, a good threshold to measure is the **75th percentile** of page loads."
>
> — [web.dev · Web Vitals](https://web.dev/articles/vitals)

현재 LCP 4초는 **"Poor" 구간**입니다.

### 진단 도구

| 도구 | 용도 |
|---|---|
| **Lighthouse** (DevTools) | 로컬에서 before/after 비교 (Lab 데이터) |
| **Vercel Speed Insights** | 실 사용자 기반 Field 데이터 |
| **PageSpeed Insights** | Lab + CrUX Field 데이터 동시 확인 |
| **Chrome DevTools Network** | JS 번들 크기 변화 확인 |

```tsx
// Vercel Speed Insights 추가 (layout.tsx, 'use client' 없어도 됨)
import { SpeedInsights } from '@vercel/speed-insights/next'

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>
        <ThemeProvider>
          {children}
        </ThemeProvider>
        <SpeedInsights />  {/* 내부적으로 'use client' + Suspense 처리됨 */}
      </body>
    </html>
  )
}
```

> `@vercel/speed-insights/next` 엔트리는 내부적으로 `'use client'` + `<Suspense>`로 감싸져 있어, Server Component인 `layout.tsx`에서 직접 import해도 client boundary가 패키지 내부에서 처리됩니다.
>
> 출처: [vercel/speed-insights · packages/web/src/nextjs/index.tsx](https://github.com/vercel/speed-insights/blob/main/packages/web/src/nextjs/index.tsx)

---

## 6. 변경 요약

| 항목 | Before | After |
|---|---|---|
| `layout.tsx` directive | `'use client'` | (없음, Server Component) |
| Client Bundle 범위 | 앱 전체 트리 | ThemeProvider 파일만 |
| Streaming 가능 여부 | 불가 | 가능 |
| LCP 예상 | > 4.0 s (Poor) | ≤ 2.5 s (Good) 목표 |

---

## Action Items

- [ ] `app/layout.tsx`에서 `'use client'` 제거
- [ ] `app/_components/theme-provider.tsx` 파일 신규 생성 (`'use client'` 이동)
- [ ] layout 또는 page 상단의 `await cookies()` / `await headers()` 패턴이 있다면 `<Suspense>` 안으로 push down
- [ ] 수정 후 Lighthouse로 before/after LCP 비교 측정
- [ ] `@vercel/speed-insights` 추가하여 Field 데이터 모니터링 시작

---

**참고 문서**
- [Next.js Docs · Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- [Next.js Docs · Streaming](https://nextjs.org/docs/app/guides/streaming)
- [web.dev · Web Vitals](https://web.dev/articles/vitals)
- [web.dev · LCP](https://web.dev/articles/lcp)
- [Next.js Docs · useReportWebVitals](https://nextjs.org/docs/app/api-reference/functions/use-report-web-vitals)
- [Vercel Docs · Speed Insights](https://vercel.com/docs/speed-insights)
