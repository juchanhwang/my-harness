# Next.js 16 App Router에서 Dynamic Import: next/dynamic vs React.lazy

## 결론 요약

| 항목 | `next/dynamic` | `React.lazy` |
|---|---|---|
| SSR 지원 | 기본 지원 (옵션으로 비활성화 가능) | **Next.js 15+에서 지원됨** (이전엔 미지원) |
| App Router 지원 | Client Component에서만 사용 가능 | Client Component에서만 사용 가능 |
| Server Component에서 호출 | 불가 | 불가 |
| loading 슬롯 | `loading` prop으로 인라인 지정 가능 | `<Suspense fallback>` 사용 |
| `ssr: false` 옵션 | 있음 | 없음 (Suspense로 대체) |

---

## 1. "React.lazy는 SSR이 안 된다"는 주장, 사실인가?

**예전엔 사실이었지만, 현재는 다르다.**

- React 18 이전: `React.lazy`는 서버 사이드 렌더링을 지원하지 않았다. 서버에서 호출 시 에러가 발생했다.
- **React 18 이후**: `React.lazy` + `<Suspense>`가 서버 스트리밍(`renderToPipeableStream`, `renderToReadableStream`)과 함께 사용 가능해졌다.
- **Next.js 13+ App Router** 환경에서는 `React.lazy`가 Client Component 내에서 SSR과 함께 정상적으로 동작한다.

즉, "React.lazy는 SSR이 안 된다"는 주장은 **React 17 이전 기준의 구식 정보**다.

---

## 2. `next/dynamic`과 `React.lazy`의 현재 차이

### next/dynamic

```tsx
// app/components/ChartWrapper.tsx
'use client'

import dynamic from 'next/dynamic'

const RechartsChart = dynamic(() => import('./RechartsChart'), {
  loading: () => <p>차트 로딩 중...</p>,
  ssr: false, // 필요한 경우에만
})
```

- Next.js 공식 추천 방식
- `loading` prop으로 fallback을 인라인으로 지정할 수 있다
- `ssr: false` 옵션 사용 가능
- 내부적으로 `React.lazy` + `<Suspense>`를 래핑한 Next.js 전용 유틸리티

### React.lazy

```tsx
// app/components/ChartWrapper.tsx
'use client'

import { lazy, Suspense } from 'react'

const RechartsChart = lazy(() => import('./RechartsChart'))

export function ChartWrapper() {
  return (
    <Suspense fallback={<p>차트 로딩 중...</p>}>
      <RechartsChart />
    </Suspense>
  )
}
```

- React 표준 API, 프레임워크 종속성 없음
- `ssr: false`에 해당하는 기능이 없다 (CSR 전용으로 만들려면 별도 처리 필요)

---

## 3. `ssr: false`가 필요한 경우

`ssr: false`는 **컴포넌트를 서버에서 렌더링하지 않고 클라이언트에서만 렌더링**하게 한다.

### 필요한 경우

1. **`window`, `document`, `navigator` 등 브라우저 전용 API를 직접 사용하는 라이브러리**
   - 예: `react-quill`, 일부 마크다운 에디터, canvas 기반 라이브러리
2. **서버에서 import 시 에러가 나는 패키지** (CommonJS-only, DOM 접근 등)
3. **SSR 결과와 CSR 결과가 달라서 hydration mismatch가 발생하는 컴포넌트**

### 필요 없는 경우

- recharts: 서버에서 렌더링해도 문제없다. HTML을 생성하므로 `ssr: false` 없이 사용 가능.
- 단순히 "초기 번들에 포함하고 싶지 않아서" dynamic import를 쓰는 경우 → `ssr: false` 불필요

---

## 4. Server Component에서 호출해도 되는가?

**안 된다.** `next/dynamic`과 `React.lazy` 모두 **Client Component에서만 사용해야 한다.**

이유:
- Server Component는 서버에서 한 번만 실행되며, lazy loading 개념 자체가 적용되지 않는다.
- Server Component에서 `dynamic()`이나 `lazy()`를 호출하면 에러가 발생한다.
- Server Component에서 클라이언트 전용 컴포넌트를 분리하려면, 파일 최상단에 `'use client'`를 선언한 별도 파일로 wrapping해야 한다.

```tsx
// app/page.tsx (Server Component)
import { ChartSection } from './ChartSection' // 'use client' 포함된 파일

export default function Page() {
  return <ChartSection />
}

// app/ChartSection.tsx
'use client'
import dynamic from 'next/dynamic'

const RechartsChart = dynamic(() => import('./RechartsChart'))
const MarkdownEditor = dynamic(() => import('./MarkdownEditor'), { ssr: false })
```

---

## 5. 이번 케이스에 대한 권장 구현

### recharts (무거운 차트 라이브러리)

```tsx
'use client'
import dynamic from 'next/dynamic'

const RechartsChart = dynamic(() => import('recharts').then(m => ({ default: m.LineChart })), {
  loading: () => <div>차트 로딩 중...</div>,
  // ssr: false 불필요 — recharts는 서버 렌더링 지원
})
```

### 마크다운 에디터 (클릭 후에만 필요)

```tsx
'use client'
import { useState } from 'react'
import dynamic from 'next/dynamic'

const MarkdownEditor = dynamic(() => import('./MarkdownEditor'), {
  loading: () => <div>에디터 로딩 중...</div>,
  ssr: false, // 대부분의 마크다운 에디터는 window에 의존하므로 필요
})

export function EditorSection() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button onClick={() => setOpen(true)}>에디터 열기</button>
      {open && <MarkdownEditor />}
    </>
  )
}
```

클릭 후에만 필요한 컴포넌트는 조건부 렌더링(`{open && <Component />}`)과 dynamic import를 함께 써야 **실제로 지연 로딩**된다. dynamic import만 하고 항상 렌더링하면 번들은 분리되지만 초기 페이지 로드 시 fetch가 발생한다.

---

## 6. 어떤 걸 써야 하나?

- **Next.js 프로젝트**: `next/dynamic` 권장. `ssr: false`, `loading` prop 등 Next.js 특화 기능을 사용할 수 있고, 공식 문서에서 명시적으로 권장한다.
- **프레임워크 독립적인 컴포넌트 라이브러리**: `React.lazy` + `<Suspense>` 사용 가능.
- 두 방법은 현재(React 18 + Next.js 15+) 기준으로 SSR 지원 여부에서 **실질적인 차이가 없다**. 단, `ssr: false`가 필요한 상황은 `next/dynamic`만 처리할 수 있다.

---

## 참고

- Next.js 공식 문서 — Lazy Loading: https://nextjs.org/docs/app/building-your-application/optimizing/lazy-loading
- React 공식 문서 — lazy: https://react.dev/reference/react/lazy
- React 공식 문서 — Suspense: https://react.dev/reference/react/Suspense
