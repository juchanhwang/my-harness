# SEO

> 핵심 메시지: **"Metadata API 기본은 `vercel:nextjs`가 담당한다. 이 문서는 FE 팀 판단 기준과 Next.js 16 특화 함정만 다룬다."**

Metadata API 사용법(`export const metadata`, `generateMetadata`, 상속/병합 규칙), sitemap/robots 파일 컨벤션, 동적 OG 이미지 기본 사용법은 `vercel:nextjs` 자동 주입 스킬이 담당한다. 이 문서는 **그 위에서의 판단과 함정**에만 집중한다.

***

## 1. FE SEO 체크리스트

### 1.1 `metadataBase` — 상대 경로 있으면 필수

`openGraph.images`, `alternates.canonical`, `alternates.languages` 중 **상대 경로를 하나라도** 사용하면 `metadataBase` 설정은 필수다. 누락 시 **빌드 에러**가 발생한다(warning 아님).

```tsx
// app/layout.tsx
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://example.com'
  ),
  // 이하 openGraph.images 등에 상대 경로 사용 가능
}
```

### 1.2 필수 항목

- **title template**: 루트 layout에 `title: { default, template: '%s | 서비스명' }` — 모든 페이지가 자동으로 브랜드 접미사 + 라우트 공지([accessibility.md](accessibility.md))도 이걸로 동작
- **description 길이**: 120-155자. 검색 결과에서 잘리지 않도록
- **openGraph.locale**: `ko_KR` 명시. 다국어 사이트면 §1.3 hreflang 병행
- **openGraph.images**: `1200×630` 고정, 각 페이지마다 고유 이미지
- **twitter.card**: `summary_large_image` — 이미지 미설정 시 공유 시 빈 미리보기
- **robots (staging/production 분기)**: `VERCEL_ENV`로 staging은 `disallow: '/'`, production만 공개

```tsx
// app/robots.ts
export default function robots(): MetadataRoute.Robots {
  const isProd = process.env.VERCEL_ENV === 'production'
  return isProd
    ? { rules: { userAgent: '*', allow: '/' }, sitemap: 'https://example.com/sitemap.xml' }
    : { rules: { userAgent: '*', disallow: '/' } }
}
```

### 1.3 hreflang (`alternates.languages`)

Google hreflang 가이드의 세 가지 필수 원칙:

1. **Bidirectional 필수** — A가 B를 가리키면 B도 A를 가리켜야 한다. 누락 시 annotation 무시
2. **언어-지역 조합** — `en-GB`처럼 ISO 639-1 언어 + ISO 3166-1 Alpha-2 지역. `EU`/`UK` 같은 region-only는 Google이 인식 못 함
3. **`x-default` fallback** — 언어 매칭이 안 될 때 대체 URL 지정

```tsx
export const metadata: Metadata = {
  alternates: {
    canonical: 'https://example.com',
    languages: {
      'en-US': 'https://example.com/en-US',
      'ko-KR': 'https://example.com/ko-KR',
      'x-default': 'https://example.com',
    },
  },
}
```

**next-intl은 hreflang을 자동 주입하지 않는다.** `[locale]` 세그먼트로 라우팅만 처리한다. `generateMetadata` 내에서 routing config의 locale 리스트를 `alternates.languages`로 직접 변환해야 한다.

> 📎 출처: [Google hreflang](https://developers.google.com/search/docs/specialty/international/localized-versions)

***

## 2. LCP 이미지 — `priority`는 deprecated (Next.js 16)

**`<Image priority />`는 Next.js 16에서 `@deprecated`다.** Claude의 학습 데이터는 아직 `priority`를 권장하지만, 쓰지 마라. Next.js 16은 `priority`를 `preload`로 대체했고, 더 중요하게는 **`preload`/`loading`/`fetchPriority`가 독립적인 개념**임을 명확히 했다.

### 세 prop의 의미 구분

| Prop | 역할 |
|---|---|
| `loading="eager"` | 뷰포트에 들어오기 전에 로드 시작 (lazy의 반대) |
| `fetchPriority="high"` | 브라우저에 요청 우선순위 힌트 |
| `preload={true}` | `<head>`에 `<link rel="preload">` 삽입 |

### 권장 패턴

```tsx
// ✅ Above-the-fold 이미지 (LCP 후보)
<Image
  src="/hero.jpg"
  width={1200}
  height={600}
  alt="..."
  loading="eager"
  fetchPriority="high"
/>

// ✅ below-the-fold 이미지 — 기본값(lazy)
<Image src="/thumb.jpg" width={400} height={300} alt="..." />

// ❌ Next.js 16에서 deprecated
<Image src="/hero.jpg" priority />
```

**`preload`는 특수 케이스만**이다. Next.js 공식 문서는 "대부분의 경우 `loading="eager"` 또는 `fetchPriority="high"`를 쓰라"고 명시한다. `<head>`에 preload 링크가 꼭 필요한 경우에만 `preload={true}`를 쓴다 — `priority`, `loading="lazy"`, `fetchPriority`와 **동시 사용 시 런타임 에러**다.

> 📎 출처: [next/image preload](https://nextjs.org/docs/app/api-reference/components/image#preload), [소스 코드](https://github.com/vercel/next.js/blob/v16.2.3/packages/next/src/shared/lib/get-img-props.ts#L39-L44)

***

## 3. 동적 OG 이미지 — `opengraph-image.tsx`

### 파일 컨벤션 권장

Route Handler(`app/api/og/route.tsx`)로 만들어도 동작하지만, **공식 권장은 파일 컨벤션**이다. `app/[segment]/opengraph-image.tsx`를 만들고 기본 함수를 export하면 Next.js가 자동으로 메타데이터에 연결한다.

```tsx
// app/blog/[slug]/opengraph-image.tsx
import { ImageResponse } from 'next/og'

export const alt = 'Blog post OG image'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OG({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await getPost(slug)
  return new ImageResponse(
    (
      <div style={{ display: 'flex', /* ... */ }}>
        {post.title}
      </div>
    ),
    { ...size }
  )
}
```

### 주요 함정

| 함정 | 사실 |
|---|---|
| **import 경로** | `next/og`에서 import한다. `next/server`는 14.0.0 이전 | 
| **런타임** | **Edge runtime 불필요**. Node.js에서도 동작 (`readFile`로 폰트 로드 가능) |
| **번들 크기 제한** | JSX/CSS/폰트/이미지 합쳐 **500KB** |
| **지원 CSS** | Flexbox만. **`display: grid` 동작 안 함** |
| **폰트** | `ttf`, `otf`, `woff` 지원 |
| **캐싱** | `opengraph-image.tsx`는 **기본 캐싱된다**. 동적 평가하려면 Request-time API 또는 dynamic config 사용 |

> 📎 출처: [opengraph-image 컨벤션](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image), [ImageResponse API](https://nextjs.org/docs/app/api-reference/functions/image-response)

***

## 4. 구조화 데이터 (JSON-LD) — 판단 기준

### 언제 추가할 가치가 있는가

Google이 실제로 rich result로 노출하는 타입만 가치 있다. 나머지는 유지보수 비용이 된다.

| 도메인 | 권장 타입 |
|---|---|
| 블로그/뉴스 | `Article`, `BlogPosting`, `NewsArticle` |
| 이커머스 | `Product`, `Offer`, `AggregateRating` |
| 브랜드/조직 | `Organization`, `WebSite` (sitelinks search box) |
| 전체 공통 | `BreadcrumbList` — 경로가 의미 있으면 거의 모든 페이지 |

### 주의 — deprecated/제한된 타입

- **`HowTo`**: Google이 2023-09에 rich result 전면 deprecated 발표. **2026 현재 search gallery에 없음.** 새로 추가하지 마라
- **`FAQPage`**: 2023-08 이후 authoritative government/health 사이트에만 제한 적용. 일반 사이트에 추가해도 rich result 노출 **거의 없음**. "FAQ 넣으면 리치 리절트 나온다"는 기대 금지

### schema-dts 권장

Google이 **직접 유지관리**하는 schema.org TypeScript 타입 라이브러리가 있다. 다른 대안 없다.

```tsx
import type { Article, WithContext } from 'schema-dts'

const articleLd: WithContext<Article> = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: post.title,
  author: { '@type': 'Person', name: post.author },
  datePublished: post.date,
  image: post.ogImage,
}

// 타입 안전 JSON-LD 주입
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }}
/>
```

### 검증

- [Google Rich Results Test](https://search.google.com/test/rich-results) — 실제 rich result 노출 여부
- [Schema Markup Validator](https://validator.schema.org/) — schema.org 문법 검증

> 📎 출처: [Google Search Gallery](https://developers.google.com/search/docs/appearance/structured-data/search-gallery), [schema-dts](https://github.com/google/schema-dts)

***

## 5. `generateMetadata` + Cache Components 판단

Cache Components가 활성화된 프로젝트(`cacheComponents: true`)에서 `generateMetadata`의 동작이 다르다.

**규칙:**
1. `generateMetadata`가 런타임 API(`cookies()`, `headers()`, `await params`, 캐시되지 않은 fetch)를 쓰면 **request time으로 deferred**
2. 페이지 나머지는 prerender 가능한데 metadata만 deferred면 **빌드 에러** — 명시적 선택을 강요

**해결 A — 데이터가 외부에서 오지만 런타임 정보가 아닌 경우:**

```tsx
export async function generateMetadata() {
  'use cache'
  const { title, description } = await db.query('site-metadata')
  return { title, description }
}
```

**해결 B — 진짜 런타임 데이터가 필요한 경우:** 페이지에 Dynamic marker Suspense 컴포넌트를 추가해 페이지를 dynamic으로 표시한다.

> 📎 출처: [generateMetadata + Cache Components](https://nextjs.org/docs/app/api-reference/functions/generate-metadata)

***

## 6. Sitemap 주의

### Google은 `priority`/`changefreq`를 무시한다

Sitemap의 `<priority>`와 `<changefreq>` 필드는 **Google이 수년간 무시**하고 있다. Next.js 문서 예시에는 여전히 포함되어 있지만, 실용적으로는 **`lastModified`만 의미 있다**. Bing 등 다른 엔진은 참조할 수 있으므로 필수 제거는 아니지만, 유지보수 비용을 만드는 건 피한다.

### Next.js 16 `generateSitemaps` breaking change

분할 sitemap의 `id` 파라미터가 **`Promise<string>`**이 되었다. 기존 Next.js 15 코드는 깨진다.

```tsx
// ❌ Next.js 15
export default async function sitemap({ id }: { id: number }) { /* ... */ }

// ✅ Next.js 16
export default async function sitemap(props: {
  id: Promise<string>
}): Promise<MetadataRoute.Sitemap> {
  const id = await props.id
  // ...
}
```

> 📎 출처: [sitemap.ts 변경](https://github.com/vercel/next.js/blob/v16.2.3/docs/01-app/03-api-reference/03-file-conventions/01-metadata/sitemap.mdx#L352-L426)

***

## 7. 안티패턴

```tsx
// ❌ Next.js 16 deprecated
<Image src="/hero.jpg" priority />

// ❌ 잘못된 import 경로 (14.0.0 이전)
import { ImageResponse } from 'next/server'
// ✅
import { ImageResponse } from 'next/og'

// ❌ Edge runtime 강제 — 불필요
export const runtime = 'edge'

// ❌ HowTo rich result 기대
{ '@type': 'HowTo', step: [...] }

// ❌ region-only hreflang
alternates: { languages: { 'UK': '...' } }
// ✅ 언어-지역
alternates: { languages: { 'en-GB': '...', 'x-default': '...' } }

// ❌ metadataBase 없이 상대 경로 — 빌드 에러
openGraph: { images: ['/og.png'] }

// ❌ CSR 전용 페이지에서 SEO 기대
'use client'
export default function Page() { /* metadata 안 먹음 */ }

// ❌ 페이지마다 동일한 title/description
```

***

> 📎 관련: [accessibility.md](accessibility.md) (라우트 공지와 title의 관계) · [i18n.md](i18n.md) · [monitoring.md](monitoring.md) (Core Web Vitals) · `vercel:nextjs` (Metadata API 기본 사용법·동적 OG·sitemap API)
