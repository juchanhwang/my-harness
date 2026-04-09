# Build Optimization

> 핵심 메시지: **"번들 크기를 모르면 성능 최적화를 말하지 마라."**

이 문서는 **빌드 산출물의 크기와 구조 최적화**에 집중한다. Next.js SSR 런타임 성능은 [performance-ssr.md](performance-ssr.md), React 렌더링 성능은 [performance-react-rendering.md](performance-react-rendering.md), 측정/모니터링은 [monitoring.md](monitoring.md) 참조.

## 목차

1. [코드 스플리팅](#1-코드-스플리팅) — Route-level 자동 분할, dynamic import, `next/dynamic`, Suspense 경계
2. [Tree Shaking — ESM이 전제 조건](#2-tree-shaking--esm이-전제-조건) — `sideEffects`, `optimizePackageImports`
3. [번들 분석 — Turbopack 시대](#3-번들-분석--turbopack-시대) — `@next/bundle-analyzer` 실행·해석
4. [번들 크기 기준 (실무 가이드)](#4-번들-크기-기준-실무-가이드) — First Load JS 예산
5. [서드파티 라이브러리 관리](#5-서드파티-라이브러리-관리) — 도입·교체·제거 판단
6. [안티패턴](#-안티패턴)

***

## 1. 코드 스플리팅

> 이 절의 모든 권장은 **Next.js 16 공식 문서 인용**에 기반한다. 공식 문서가 명시하지 않는 카테고리는 "경험칙" 라벨로 분리 표기한다.

### 1.1 Route-level 자동 분할 — 기본으로 얻는 것

Next.js App Router는 Server Components를 **route segment 단위로 자동 스플리팅**한다. 개발자가 별도 설정할 필요 없다.

> "Server Components enable automatic code-splitting by route segments. You may also consider lazy loading Client Components and third-party libraries, where appropriate."
>
> — [Next.js · Production Checklist](https://nextjs.org/docs/app/guides/production-checklist)

> "Next.js automatically splits your application into smaller JavaScript chunks based on routes. ... only the code needed for the current route is loaded."
>
> — [Next.js · Prefetching](https://nextjs.org/docs/app/guides/prefetching)

→ 아래 수동 분할은 "route 자동 분할이 부족한 구체 케이스"에서만 쓴다.

***

### 1.2 수동 분할 — `next/dynamic` vs `React.lazy` + Suspense

공식 문서는 lazy loading 구현 방법을 **2가지로** 제시한다:

> "There are two ways you can implement lazy loading in Next.js:
> 1. Using Dynamic Imports with `next/dynamic`
> 2. Using `React.lazy()` with Suspense"

그리고 `next/dynamic`의 정체를 다음과 같이 정의한다:

> "**`next/dynamic` is a composite of `React.lazy()` and Suspense.** It behaves the same way in the `app` and `pages` directories to allow for incremental migration."
>
> — [Next.js · Lazy Loading](https://nextjs.org/docs/app/guides/lazy-loading)

→ `next/dynamic`은 `React.lazy + <Suspense>`를 하나로 합친 composite API다. `loading` 옵션이 내부 Suspense fallback 역할이다.

#### ⚠️ Outdated 통념 — "`React.lazy`는 SSR을 못 한다"

공식 문서는 정반대를 명시한다:

> "When using `React.lazy()` and Suspense, **Client Components will be prerendered (SSR) by default**."
>
> — [Next.js · Lazy Loading](https://nextjs.org/docs/app/guides/lazy-loading)

React 18의 streaming SSR 이후 `React.lazy + Suspense`는 서버에서 정상 prerender된다. **차이는 SSR 지원 여부가 아니라** 다음 3가지다 (각각 공식 문서 직접 인용 기반):

- `next/dynamic`만 `ssr: false` opt-out 옵션을 제공 (§1.4)
- `next/dynamic`의 `loading` 옵션이 Suspense fallback을 호출에 묶어준다 → 별도 `<Suspense>` 래핑 불필요
- `next/dynamic`은 app/pages 양쪽에서 동일 동작 → incremental migration에 적합

→ 기본은 `next/dynamic`. `ssr: false`가 필요하거나 `loading`을 한 호출에 묶고 싶을 때 선택 이유가 명확하다. SSR이 필요 없거나 하나의 `<Suspense>`로 여러 lazy 컴포넌트를 묶고 싶으면 `React.lazy`가 더 자연스럽다.

> **공식 문서가 직접 비교하지 않는 것**: "`loading` 옵션 vs `<Suspense fallback>` 선택 기준"은 Next.js/React 공식 문서 어디에도 비교 진술이 없다. 위의 선택 지침은 인용된 사실 3가지에서 **추론**한 것이다.

***

### 1.3 공식이 명시한 split 대상 3가지

Next.js Lazy Loading 가이드가 **구체 예시로 언급하는 패턴은 정확히 3가지**다.

#### ① 모달 — 사용자 클릭까지 defer

> "It allows you to defer loading of Client Components and imported libraries, and only include them in the client bundle when they're needed. **For example, you might want to defer loading a modal until a user clicks to open it.**"
>
> — [Next.js · Lazy Loading](https://nextjs.org/docs/app/guides/lazy-loading)

#### ② 조건부 렌더 컴포넌트

```tsx
{/* Load immediately, but in a separate client bundle */}
<ComponentA />
{/* Load on demand, only when/if the condition is met */}
{showMore && <ComponentB />}
{/* Load only on the client side */}
<ComponentC />
```
— [Next.js · Lazy Loading](https://nextjs.org/docs/app/guides/lazy-loading) (원문 코드 주석 그대로)

#### ③ 사용자 입력 후 필요한 외부 라이브러리

> "External libraries can be loaded on demand using the `import()` function. This example uses the external library `fuse.js` for fuzzy search. **The module is only loaded on the client after the user types in the search input.**"
>
> — [Next.js · Lazy Loading](https://nextjs.org/docs/app/guides/lazy-loading)

```tsx
const handleSearch = async (query: string) => {
  const { default: Fuse } = await import('fuse.js')
  const fuse = new Fuse(items, { keys: ['name'] })
  setResults(fuse.search(query))
}
```

#### ⚠️ 공식이 다루지 않는 카테고리 (경험칙)

무거운 **차트 라이브러리** (Chart.js/Recharts), **에디터** (Monaco/TipTap), **admin panel**, **대시보드** 등은 실무에서 흔히 split 대상이지만 Next.js/React 공식 문서 어디에도 "이것들을 split하라"는 직접 진술이 **없다**. 팀 내부 가이드로 결정하고, 리뷰 코멘트에서 "공식 권장"이라고 표기하지 않는다.

***

### 1.4 `ssr: false` — Client Component 전용

Next.js 16 App Router의 주요 제약이다. 공식 문서가 에러 조건까지 명시한다:

> "`ssr: false` option is not supported in Server Components. You will see an error if you try to use it in Server Components. **`ssr: false` is not allowed with `next/dynamic` in Server Components. Please move it into a Client Component.**"
>
> — [Next.js · Lazy Loading](https://nextjs.org/docs/app/guides/lazy-loading)

```tsx
// ❌ Server Component에서 호출 — 빌드/런타임 에러
// app/page.tsx
import dynamic from 'next/dynamic'
const Map = dynamic(() => import('./map'), { ssr: false }) // Error!

// ✅ Client Component 안에서 호출
// components/map-wrapper.tsx
'use client'
import dynamic from 'next/dynamic'

export const Map = dynamic(() => import('./map'), {
  ssr: false,
  loading: () => <div className="h-64 w-full bg-gray-100" />, // fallback dimension → 실제 컴포넌트와 일치
})
```

> 📎 fallback dimension과 CLS의 관계는 [performance-ssr.md §3 Streaming + Suspense](performance-ssr.md)에서 streaming Web Vitals 맥락으로 다룬다. Next.js Streaming 가이드가 해당 주제에 대해 공식 섹션을 보유한다.

***

### 1.5 Named export 동적 import

공식 권장 패턴 (디폴트 export가 아닌 경우):

```tsx
// components/hello.tsx
'use client'
export function Hello() {
  return <p>Hello!</p>
}

// app/page.tsx
import dynamic from 'next/dynamic'

const ClientComponent = dynamic(() =>
  import('../components/hello').then((mod) => mod.Hello)
)
```
— [Next.js · Lazy Loading](https://nextjs.org/docs/app/guides/lazy-loading) (원문 예시)

공식 문서는 `loadableGenerated` 같은 별도 옵션을 노출하지 않으며 `.then((mod) => mod.Named)` 방식만 제시한다.

***

## 2. Tree Shaking — ESM이 전제 조건

> "Tree shaking ... relies on the **static structure of ES2015 module syntax**, i.e. `import` and `export`."
>
> — [Webpack · Tree Shaking](https://webpack.js.org/guides/tree-shaking/)

Next.js 16의 기본 번들러 Turbopack도 production build에서 미사용 export 제거를 자동 활성화한다 (`turbopackRemoveUnusedExports` 기본 `true`). 출처: [Next.js Docs · Turbopack config](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack)

### 2.1 lodash vs lodash-es vs es-toolkit — 정확한 차이

흔한 오해: "lodash는 tree-shaking이 안 되니 다른 걸 써라". 정확하게는 **CJS인 메인 `lodash`만 tree-shakable이 아닐 뿐, `lodash-es`는 ESM이라 tree-shakable**이다.

| 패키지 | 모듈 형식 | `sideEffects` | Tree shaking |
|---|---|---|---|
| `lodash` | CJS | 없음 | 어려움 |
| `lodash-es` | ESM (`"type": "module"`) | `false` | 가능 |
| `es-toolkit` | ESM + CJS dual | `false` | 가능 |

es-toolkit의 강점은 "tree shaking 가능 여부"가 아니라 **함수당 구현이 더 작다**는 것:

> "es-toolkit significantly reduces its bundle size, cutting it down by up to 97% compared to other libraries like lodash."
>
> — [es-toolkit · Bundle Size](https://es-toolkit.dev/bundle-size.html) (`lodash-es@4.17.21` 기준 비교)

```ts
// ❌ CJS lodash — tree-shaking 어려움
import _ from 'lodash';
_.debounce(fn, 300);

// ✅ lodash-es (ESM) — tree-shakable + Next.js 자동 최적화
import { debounce } from 'lodash-es';

// ✅ es-toolkit — tree-shakable + 함수 구현이 더 작음
import { debounce } from 'es-toolkit';
```

### 2.2 Next.js `optimizePackageImports`

큰 라이브러리에 대해 named import를 자동으로 cherry-pick한다.

```js
// next.config.js
module.exports = {
  experimental: {
    optimizePackageImports: ['my-package'],
  },
};
```

> "This feature is currently experimental ... **it is not recommended for production**."
>
> — [Next.js Docs · optimizePackageImports](https://nextjs.org/docs/app/api-reference/config/next-config-js/optimizePackageImports)

다음 라이브러리는 **자동 최적화 목록에 이미 포함**되어 별도 설정 불필요:

- `lodash-es`, `date-fns`, `lucide-react`, `ramda`, `rxjs`
- `@mui/material`, `@mui/icons-material`, `@headlessui/react`, `@heroicons/react/*`
- `react-icons/*`, `recharts`, `react-use`, `effect`, `@effect/*` 외 25+ 패키지

→ **`lodash-es`는 별도 설정 없이 자동 최적화된다.** CJS `lodash`는 자동 목록에 없으므로 cherry-pick(`lodash/debounce`) 또는 `lodash-es`로 마이그레이션해야 한다.

***

## 3. 번들 분석 — Turbopack 시대

Next.js 16부터 **Turbopack이 기본 번들러**다. 분석 도구는 빌드 도구에 따라 다르다.

### 3.1 Turbopack 빌드 (기본) — `next experimental-analyze`

Next.js 16.1+에서 사용 가능한 experimental 도구다.

```bash
# 인터랙티브 분석
npx next experimental-analyze

# 디스크에 저장 (.next/diagnostics/analyze)
npx next experimental-analyze --output
```

> "The Next.js Bundle Analyzer is **integrated with Turbopack's module graph**. You can inspect server and client modules with precise import tracing."
>
> — [Next.js Docs · Package Bundling](https://nextjs.org/docs/app/guides/package-bundling)

### 3.2 Webpack 빌드 — `@next/bundle-analyzer`

`next build --webpack`을 의도적으로 사용하는 경우에만 적용된다.

```js
// next.config.js
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});
module.exports = withBundleAnalyzer(nextConfig);
```

```bash
ANALYZE=true next build --webpack
```

***

## 4. 번들 크기 기준 (실무 가이드)

| 페이지 유형 | First Load JS 목표 | 이유 |
|---|---|---|
| 랜딩 페이지 | < 100KB | 첫 인상, Core Web Vitals |
| 일반 콘텐츠 페이지 | < 200KB | LCP 2.5초 내 |
| 대시보드 / 어드민 | < 300KB | 복잡한 UI 허용 |

→ 측정 도구는 [3.1](#31-turbopack-빌드-기본--next-experimental-analyze) 참조. 측정 없이 "괜찮을 것 같다"로 넘기지 않는다.

***

## 5. 서드파티 라이브러리 관리

```bash
# 패키지 도입 전 크기 확인
npx bundlephobia <package-name>
# 또는 https://bundlephobia.com
```

| 라이브러리 | gzipped 크기 | 권장 대안 |
|---|---|---|
| `lodash` (CJS) | ~24KB | `lodash-es` (tree-shakable) 또는 `es-toolkit` (~5KB) |
| `moment` | ~16KB | `dayjs` (~2KB), `date-fns` (~6KB, tree-shakable) |
| `chart.js` | ~60KB | `recharts` (필요한 차트만 named import) |

***

## ❌ 안티패턴

### Tree Shaking / 번들 분석
- **번들 분석 안 하기** — 무엇이 큰지 모르면 최적화 못 한다. PR마다 First Load JS 변화를 본다.
- **CJS 전체 import** — `import _ from 'lodash'`. tree shaking이 동작하지 않는다.
- **`optimizePackageImports`를 lodash-es에 추가** — 이미 자동 목록에 있다. 중복 설정 불필요.
- **개발 모드에서 번들 크기 측정** — 반드시 `next build` 후 측정한다.
- **bundlephobia 확인 없이 의존성 추가** — 60KB짜리 라이브러리를 한 줄 유틸 때문에 추가하지 않는다.

### Code Splitting
- **Server Component에서 `dynamic(..., { ssr: false })` 호출** — Next.js 공식 에러 조건. `'use client'` 모듈 안에서만 호출한다.
- **"`React.lazy`는 SSR을 못 한다"는 이유로 `next/dynamic`만 쓰기** — Next.js 16 App Router 기준 outdated. `React.lazy + Suspense`도 Client Component를 기본 SSR한다. 선택 기준은 "`ssr: false` 필요 여부 / `loading` 옵션을 한 호출에 묶고 싶은지"다.
- **차트/에디터/admin을 "공식 권장"이라며 split 이유로 대기** — Next.js/React 공식 문서는 이 카테고리에 대해 직접 진술하지 않는다. 경험칙으로 분리하되 "공식 권장"이라고 표기하지 않는다.

***

> 📎 관련: [performance-ssr.md](performance-ssr.md) (Next.js SSR 런타임 성능) · [performance-react-rendering.md](performance-react-rendering.md) (React 렌더링 성능) · [libraries.md](libraries.md) · [monitoring.md](monitoring.md) (Core Web Vitals 측정)
