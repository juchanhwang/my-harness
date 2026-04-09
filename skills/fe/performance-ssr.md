# Performance — SSR Runtime (Next.js App Router)

> 핵심 메시지: **"static shell은 즉시, dynamic은 stream으로 push down한다."**

이 문서는 **Next.js App Router 런타임 SSR 성능 최적화**에 집중한다. 다른 성능 영역은 짝꿍 문서를 본다:

- **React 렌더링 성능 최적화** (Compiler, memo, useMemo, useCallback) → [performance-react-rendering.md](performance-react-rendering.md)
- **번들 크기 / Tree Shaking / 코드 스플리팅** → [build-optimization.md](build-optimization.md)
- **CI/CD 병렬 빌드 + Turborepo Remote Cache** → [ci-cd.md](ci-cd.md)
- **Core Web Vitals 측정 + Speed Insights + RUM** → [monitoring.md](monitoring.md)
- **Image/Font 최적화** (`next/image`, `next/font`) → [next-assets.md](next-assets.md)
- **Cache Components** (`'use cache'`, `cacheLife`, PPR) → vercel:next-cache-components 스킬 (자동 로드)

***

## 1. `'use client'`는 경계 — 번들 파급 효과

성능 관점에서 `'use client'`를 다루는 이유는 하나다: **경계 위치가 client bundle 크기를 직접 결정**한다.

> "`'use client'` is used to declare a **boundary** between the Server and Client module graphs. Once a file is marked with `'use client'`, **all its imports and child components are considered part of the client bundle**."
>
> — [Next.js Docs · Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)

### 핵심 패턴 — Provider/Wrapper는 가능한 한 깊게 둔다

공식 권고: "`ThemeProvider`가 `<html>` 전체가 아니라 `{children}`만 감싸도록 해서 Next.js가 Server Components의 static 부분을 최적화하기 쉽게 만들어라."

→ 최상위 layout이 `'use client'`가 되면 **하위 트리 전체가 client bundle**에 들어간다. Provider는 필요한 가장 깊은 지점에 둔다.

### 성능 관점 요약

| 경계를 깊게 둘 때 얻는 것 |
|---|
| **JS 번들 감소** — Server 전용 코드가 client에 딸려오지 않음 |
| **FCP 개선** — 정적 렌더 가능 영역이 넓어짐 |
| **Streaming 활용도 증가** — §3의 static shell이 커짐 |

> 📎 RSC 기본 사용법 (async 컴포넌트, data fetching 예시), `'use client'` 안에 async 금지 / non-serializable props (Date/Map/Function) 금지 등 **경계 위반 detection**은 vercel:nextjs 스킬의 `rsc-boundaries.md` 참조. 이 문서에서는 성능 관점만 다룬다.

***

## 2. Caching — vercel 플러그인 스킬로 위임

Next.js 16의 Cache Components (`'use cache'`, `cacheLife`, `cacheTag`, PPR, `updateTag` vs `revalidateTag`)는 **vercel 플러그인의 `next-cache-components` 스킬이 전담**한다. 해당 스킬은 `app/**` 경로 + `next/cache` import + 관련 프롬프트 시그널에서 **자동 로드**되므로 이 문서에서는 중복 작성하지 않는다. `unstable_cache` 사용 시 자동 migration 권고도 해당 스킬이 제공한다.

**이 문서에서 기억해야 할 SSR 관점 핵심 3가지만 정리한다:**

1. **옵트인이다** — `next.config.ts`에 `cacheComponents: true`가 없으면 아무 동작도 하지 않는다. 켜는 순간 "명시적으로 캐시된 것 외에는 prerender에서 제외"라는 PPR 모델로 전환된다. Next.js 16에서 `experimental.ppr`은 제거되고 `cacheComponents`로 통합되었다.
2. **Request-time API는 cache scope 밖에서 읽는다** — `'use cache'` 안에서 `cookies()`/`headers()`/`searchParams`를 직접 호출할 수 없다. 바깥에서 읽어 **인자로 넘겨** cache key에 자동 포함시킨다. `'use cache: private'`는 컴플라이언스 예외 상황에서만 사용.
3. **무효화는 두 종류** — `updateTag`는 Server Actions 전용으로 **같은 요청 안에서 즉시 만료** (read-your-own-writes), `revalidateTag`는 **stale-while-revalidate** (백그라운드 갱신). 용도가 다르다.

> 📎 상세 가이드 (`'use cache'` 3가지 위치, `cacheLife` 6 프리셋, `cacheTag` 키 생성 규칙, `unstable_cache` 마이그레이션 등)는 vercel:next-cache-components 스킬을 참조. 이 파일에서 재작성하면 outdated 리스크만 생긴다.

***

## 3. Streaming + Suspense

> "Each `<Suspense>` boundary is an independent streaming point. Components inside different boundaries resolve and stream in independently."
>
> — [Next.js Docs · Streaming](https://nextjs.org/docs/app/guides/streaming)

> 📎 `useSearchParams`/`usePathname` 사용 시 Suspense 누락으로 페이지 전체가 CSR로 bailout되는 문제는 vercel:nextjs 스킬의 `suspense-boundaries.md`가 자동 검출·가이드한다. 이 문서는 streaming 개념과 Web Vitals 영향에 집중.

### "Push dynamic access down" — 핵심 패턴

> "If you `await` any of these [`params`, `searchParams`, `cookies()`, `headers()`, data fetches] at the top of a layout or page, **everything below that point becomes dynamic and cannot be prerendered as part of the static shell**."

→ dynamic API는 **실제로 사용하는 컴포넌트 안**에서 호출하고, `<Suspense>`로 감싼다.

```tsx
// ❌ layout 상단에서 await — 전체 트리가 dynamic
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

### `loading.tsx` vs `<Suspense>`

|  | `loading.js` | `<Suspense>` |
|---|---|---|
| **Scope** | 전체 페이지 | 컴포넌트 단위 |
| **Setup** | 파일 드롭 | 명시적 wrap |
| **Best for** | 데이터 없이는 아무것도 못 그리는 페이지 | 그 외 대부분 (granular 제어) |

### Streaming이 Web Vitals에 미치는 영향

| 지표 | 영향 |
|---|---|
| **TTFB / FCP** | static shell이 즉시 전송 → 데이터 fetch와 분리 |
| **LCP** | LCP 요소가 `<Suspense>` 안에 있으면 boundary 해결 전 paint 안 됨 → **LCP 요소는 Suspense 밖(static shell)에 둔다** |
| **CLS** | skeleton fallback의 dimension을 실제 콘텐츠와 일치시킨다 |
| **INP** | 각 boundary가 hydration 단위 → selective hydration으로 main thread 부담 감소 |

### HTTP 계약 주의

> "Once streaming begins, the HTTP response headers (including the status code) have already been sent. **You cannot change the status code or headers after streaming starts.**"

→ `notFound()`/`redirect()`는 dynamic API await **이전에** 실행되어야 한다. streaming 시작 후엔 client-side redirect로 degrade된다.

***

## 4. Image / Font 최적화 — 별도 문서

`next/image`, `next/font` 세부 가이드는 [next-assets.md](next-assets.md)로 분리되어 있다. 분리 이유:
- **Next.js 16 `preload` prop** (구 `priority` deprecated) 등 버전 민감 정보의 별도 관리
- **CLS/LCP 방어 메커니즘** (`adjustFontFallback`, `width`/`height` 강제)이 자체 컨셉을 이룬다
- vercel 플러그인의 `nextjs` 스킬은 `app/**`에서 자동 로드되며 remote config / Tailwind 통합 / local font 세부를 보완한다

**이 문서에서 기억할 SSR 런타임 관점 3가지**:

1. **LCP 이미지는 lazy-load 금지** — "Never lazy-load your LCP image" ([web.dev · Optimize LCP](https://web.dev/articles/optimize-lcp)). `<Suspense>` 안에 두는 것도 같은 효과이므로 LCP 요소는 static shell에 둔다.
2. **Image는 `width`/`height` 또는 `fill + sizes`** — 둘 중 하나 없이는 CLS를 막지 못한다.
3. **Font는 `next/font`로 자동 self-hosting** — `adjustFontFallback` (기본 `true`)이 CLS를 방지하므로 끄지 않는다. Google Fonts를 `<link>`로 가져오지 않는다.

> 📎 상세: [next-assets.md](next-assets.md) · `priority` prop deprecation, `preload` / `fetchPriority` 분기, `adjustFontFallback` 원리, preload 범위, CLS 방어 체크리스트

***

## ❌ 안티패턴

- **`'use client'`를 root layout에 추가** — 전체 트리가 client bundle에 들어간다. boundary는 가능한 한 깊게.
- **dynamic API를 layout 상단에서 `await`** — static shell이 사라지고 전체 트리가 dynamic. `<Suspense>` 안으로 push down한다.
- **LCP 이미지에 lazy loading** — `loading='lazy'`나 `<Suspense>` 안에 두면 LCP가 망가진다. LCP 요소는 static shell에 둔다.
- **`priority` prop 사용** (Next.js 16+) — deprecated. `preload` 또는 `fetchPriority='high'`로 마이그레이션한다. 상세는 [next-assets.md](next-assets.md).
- **`'use cache'` 안에서 `cookies()`/`headers()` 호출** — request-time API는 cache scope 밖에서 읽고 인자로 전달해 cache key에 포함시킨다. 상세는 vercel:next-cache-components 스킬.

***

> 📎 관련: [performance-react-rendering.md](performance-react-rendering.md) (React 렌더링 성능 최적화) · [next-assets.md](next-assets.md) (Image/Font) · [build-optimization.md](build-optimization.md) (번들 크기) · [monitoring.md](monitoring.md) (Core Web Vitals 측정) · vercel:next-cache-components 스킬 (Cache Components 전담)
