# SEO

> 핵심 메시지: **"메타데이터 API 사용. OG 이미지 필수. 구조화 데이터로 차별화."**

***

## 1. Metadata API — FE 체크리스트

> **기본 사용법**(`export const metadata`, `generateMetadata`, `Metadata` 타입, 상속/병합 규칙)은 `vercel:nextjs` 자동 주입 스킬이 담당한다. 이 절은 **SEO 품질을 보장하는 FE 팀 체크리스트**만 다룬다.

필수 항목:

- **title template**: 루트 layout에서 `title: { default, template: '%s | 서비스명' }` — 모든 페이지가 자동으로 브랜드 접미사를 갖는다.
- **description 길이**: 120-155자. 검색 결과에서 잘리지 않도록.
- **openGraph.locale**: `ko_KR` 명시 (다국어 사이트면 i18n.md §5의 `alternates.languages` 병행).
- **openGraph.images**: `1200×630` 고정, 절대 경로, 각 페이지마다 고유 이미지(동적 OG는 `next/og`).
- **twitter.card**: `summary_large_image` — 이미지 미설정 시 공유 시 빈 미리보기.
- **robots**: 스테이징 환경에서는 `{ index: false, follow: false }`로 인덱싱 차단 (환경변수로 분기).

**`generateMetadata`는 `await`를 캐스케이드하지 마라**: 여러 데이터 소스가 필요하면 `Promise.all`로 병렬화. 페이지 렌더와 동일한 waterfall 규칙 적용.

***

## 2. 구조화 데이터 (JSON-LD)

```tsx
function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

// 사용
<JsonLd data={{
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: post.title,
  author: { '@type': 'Person', name: post.author },
  datePublished: post.date,
  image: post.ogImage,
}} />
```

***

## 3. Sitemap & Robots

```tsx
// app/sitemap.ts
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getAllPosts();
  return [
    { url: 'https://example.com', lastModified: new Date(), priority: 1 },
    ...posts.map(post => ({
      url: `https://example.com/blog/${post.slug}`,
      lastModified: post.updatedAt,
      priority: 0.8,
    })),
  ];
}

// app/robots.ts
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: '/api/' },
    sitemap: 'https://example.com/sitemap.xml',
  };
}
```

***

## 4. Core Web Vitals

| 지표  | 목표      | 측정              |
| --- | ------- | --------------- |
| LCP | < 2.5s  | 히어로 이미지/텍스트 로딩  |
| INP | < 200ms | 클릭 후 UI 반응      |
| CLS | < 0.1   | 레이아웃 밀림         |

```tsx
// ✅ LCP 최적화 — priority 속성
<Image src="/hero.jpg" width={1200} height={600} alt="Hero" priority />

// ✅ CLS 방지 — 이미지 크기 명시
<Image src="/hero.jpg" width={1200} height={600} alt="Hero" />
```

***

## ❌ 안티패턴

* **CSR 전용 페이지에서 SEO 기대**: 서버 렌더링 필요
* **제목/설명 중복**: 페이지마다 고유한 메타데이터
* **OG 이미지 미설정**: SNS 공유 시 미리보기 없음
* **이미지 alt 텍스트 빈칸**: 검색엔진과 스크린리더 모두에게 중요

***

> 📎 관련: [i18n.md](i18n.md) · [performance-ssr.md](performance-ssr.md) · `vercel:nextjs` (Metadata API 기본 사용법·동적 OG·sitemap API)
