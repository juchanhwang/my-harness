# Next.js 16 App Router — 코드 스플리팅 결정 가이드

> 기준 문서: [Next.js · Lazy Loading](https://nextjs.org/docs/app/guides/lazy-loading)

---

## 1. `next/dynamic` vs `React.lazy` — 공식 정의

Next.js 공식 문서는 lazy loading 구현 방법을 **2가지**로 제시한다.

> "There are two ways you can implement lazy loading in Next.js:
> 1. Using Dynamic Imports with `next/dynamic`
> 2. Using `React.lazy()` with Suspense"
>
> — [Next.js · Lazy Loading](https://nextjs.org/docs/app/guides/lazy-loading)

그리고 `next/dynamic`의 정체를 명확히 정의한다.

> "**`next/dynamic` is a composite of `React.lazy()` and Suspense.** It behaves the same way in the `app` and `pages` directories to allow for incremental migration."
>
> — [Next.js · Lazy Loading](https://nextjs.org/docs/app/guides/lazy-loading)

즉, `next/dynamic`은 `React.lazy + <Suspense>`를 하나로 합친 composite API다. 내부 `loading` 옵션이 Suspense fallback 역할을 한다.

---

## 2. "`React.lazy`는 SSR이 안 된다" — Outdated 통념 판정

**결론: 틀린 정보다.** Next.js 16 App Router 기준으로 이미 outdated된 통념이다.

공식 문서가 정반대를 명시한다.

> "When using `React.lazy()` and Suspense, **Client Components will be prerendered (SSR) by default**."
>
> — [Next.js · Lazy Loading](https://nextjs.org/docs/app/guides/lazy-loading)

React 18의 streaming SSR 도입 이후 `React.lazy + Suspense`는 서버에서 정상 prerender된다. **두 API의 차이는 SSR 지원 여부가 아니다.**

---

## 3. 실제 차이 — 선택 기준

공식 문서 인용 사실에서 도출한 3가지 차이점이다.

| 항목 | `next/dynamic` | `React.lazy` |
|---|---|---|
| 내부 구현 | `React.lazy + Suspense` composite | React 내장 API |
| `ssr: false` opt-out | 지원 (Client Component 전용) | 미지원 |
| fallback 지정 방식 | `loading` 옵션으로 호출에 묶어 지정 | 별도 `<Suspense fallback>` 래핑 필요 |
| pages/app 호환 | 양쪽에서 동일 동작 | — |

**선택 지침:**

- **기본값: `next/dynamic`** — `ssr: false`가 필요하거나, fallback을 선언 위치에 묶고 싶을 때 명확한 이유가 생긴다.
- **`React.lazy` 선택 이유**: SSR 비활성화가 필요 없고, 하나의 `<Suspense>`로 여러 lazy 컴포넌트를 묶어 그룹 fallback을 관리하고 싶을 때 더 자연스럽다.

> 주의: "`loading` 옵션 vs `<Suspense fallback>` 선택 기준"은 Next.js/React 공식 문서 어디에도 직접 비교 진술이 없다. 위의 선택 지침은 공식 인용 사실에서 추론한 것이다.

---

## 4. 네 케이스 적용

### 4-1. recharts (차트 라이브러리) — 초기 로드 분리

차트는 페이지 진입 시 즉시 필요할 수도 있으나, **첫 페인트에는 불필요**하다면 lazy loading이 적합하다.

```tsx
// app/dashboard/page.tsx (Server Component)
import dynamic from 'next/dynamic'

const RechartsChart = dynamic(
  () => import('../components/recharts-chart'),
  {
    loading: () => <div className="h-64 w-full animate-pulse bg-gray-100" />,
    // ssr: true (기본값) — 서버에서 prerender, 클라이언트 번들은 분리
  }
)

export default function DashboardPage() {
  return (
    <main>
      <RechartsChart />
    </main>
  )
}
```

> 참고: `recharts`는 Next.js의 `optimizePackageImports` **자동 최적화 목록에 이미 포함**되어 있다. named import만 써도 별도 설정 없이 tree-shaking이 적용된다.
>
> — [Next.js Docs · optimizePackageImports](https://nextjs.org/docs/app/api-reference/config/next-config-js/optimizePackageImports)

### 4-2. 마크다운 에디터 — 사용자 클릭 후에만 필요

공식 문서가 직접 언급하는 케이스다.

> "For example, you might want to defer loading a modal until a user clicks to open it."
>
> — [Next.js · Lazy Loading](https://nextjs.org/docs/app/guides/lazy-loading)

에디터처럼 클라이언트 전용 API(window, document)에 의존하는 무거운 컴포넌트는 `ssr: false`가 필요할 수 있다.

```tsx
// components/editor-wrapper.tsx
'use client'  // ← ssr: false는 Client Component에서만 사용 가능

import dynamic from 'next/dynamic'
import { useState } from 'react'

const MarkdownEditor = dynamic(
  () => import('./markdown-editor'),
  {
    ssr: false,  // 에디터가 window/document에 의존하는 경우
    loading: () => <div className="h-64 w-full animate-pulse bg-gray-100" />,
  }
)

export function EditorSection() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div>
      <button onClick={() => setIsOpen(true)}>에디터 열기</button>
      {isOpen && <MarkdownEditor />}
    </div>
  )
}
```

---

## 5. `ssr: false`가 필요한 경우

공식 문서는 `ssr: false`의 에러 조건까지 명시한다.

> "`ssr: false` option is not supported in Server Components. You will see an error if you try to use it in Server Components. **`ssr: false` is not allowed with `next/dynamic` in Server Components. Please move it into a Client Component.**"
>
> — [Next.js · Lazy Loading](https://nextjs.org/docs/app/guides/lazy-loading)

### `ssr: false`를 사용하는 경우:
- 컴포넌트가 `window`, `document`, `navigator` 같은 브라우저 전용 API에 의존
- `localStorage`, `sessionStorage`를 mount 시점에 바로 접근
- SSR 시 hydration mismatch가 불가피한 서드파티 라이브러리

### `ssr: false` 사용 규칙:

```tsx
// ❌ Server Component에서 호출 — 빌드/런타임 에러 발생
// app/page.tsx
import dynamic from 'next/dynamic'
const Editor = dynamic(() => import('./editor'), { ssr: false }) // Error!

// ✅ Client Component 안에서만 호출
// components/editor-wrapper.tsx
'use client'
import dynamic from 'next/dynamic'

export const Editor = dynamic(() => import('./editor'), {
  ssr: false,
  loading: () => <div className="h-64 w-full bg-gray-100" />,
})
```

---

## 6. Named Export 동적 import 패턴

공식 문서가 제시하는 방법이다.

```tsx
// components/charts/bar-chart.tsx
'use client'
export function BarChart({ data }: { data: ChartData[] }) {
  return <BarChartImpl data={data} />
}

// app/dashboard/page.tsx
import dynamic from 'next/dynamic'

// .then((mod) => mod.Named) 패턴만 공식 문서가 제시한다
const BarChart = dynamic(() =>
  import('../components/charts/bar-chart').then((mod) => mod.BarChart)
)
```

> — [Next.js · Lazy Loading](https://nextjs.org/docs/app/guides/lazy-loading) (원문 예시)

---

## 7. Route 자동 분할 — 먼저 확인할 것

수동 분할 전에 이미 얻는 것을 확인한다.

> "Server Components enable automatic code-splitting by route segments."
>
> — [Next.js · Production Checklist](https://nextjs.org/docs/app/guides/production-checklist)

App Router에서 Server Component로 유지되는 컴포넌트는 이미 route segment 단위로 분리된다. 수동 `dynamic()`은 "route 자동 분할이 부족한 구체 케이스"에서만 추가한다.

---

## 8. 주의: 차트/에디터 split은 "공식 권장"이 아님

> 중요: Next.js/React 공식 문서 어디에도 "recharts나 마크다운 에디터를 split하라"는 직접 진술이 없다.

공식이 명시한 split 대상은 모달, 조건부 렌더 컴포넌트, 사용자 입력 후 필요한 외부 라이브러리 3가지다. recharts/에디터 분리는 실무 경험칙이며, 리뷰나 PR 코멘트에서 "공식 권장"이라고 표기하지 않는다.

---

## 요약

| 질문 | 답 |
|---|---|
| `next/dynamic` vs `React.lazy` 선택 | 기본은 `next/dynamic`. `ssr: false` 불필요 + 그룹 fallback이 필요하면 `React.lazy` |
| "`React.lazy`는 SSR 안 된다" | Outdated. Next.js 16에서 `React.lazy + Suspense`도 기본 SSR(prerender)된다 |
| `ssr: false` 필요한 경우 | 브라우저 전용 API 의존, hydration mismatch 불가피 케이스 |
| Server Component에서 `ssr: false` | 불가. `'use client'` 모듈 안에서만 호출해야 한다 |
| Named export dynamic import | `.then((mod) => mod.Named)` 패턴 사용 |
