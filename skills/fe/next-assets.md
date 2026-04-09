# Next.js Assets — Image & Font Optimization

> 핵심 메시지: **"next/image와 next/font는 CLS와 LCP를 자동으로 방어한다. 끄지 마라, 덮어쓰지 마라."**

이 문서는 **Next.js 16 기준** `next/image`와 `next/font` 최적화 가이드다. 런타임 SSR 전략은 [performance-ssr.md](performance-ssr.md), Core Web Vitals 측정은 [monitoring.md](monitoring.md) 참조.

> 📎 **vercel 플러그인의 `nextjs` 스킬**이 `app/**` 경로에서 자동 로드되며 remote image config / Blur placeholder 세부 / Tailwind CSS 통합 / local font 멀티 파일 구성을 **보완**한다. 이 문서는 그 스킬이 빠뜨린 Next.js 16 변경사항 (`preload` prop, `adjustFontFallback` 원리)과 FE 팀 관점의 의사결정 기준에 집중한다.

***

## 1. Image 최적화 — `next/image`

`next/image`는 size optimization (자동 WebP/AVIF 포맷 서빙), visual stability (layout shift 자동 방지), native lazy loading, on-demand resizing을 제공한다.

출처: [Next.js Docs · Image](https://nextjs.org/docs/app/api-reference/components/image) · [web.dev · Optimize LCP](https://web.dev/articles/optimize-lcp)

### 1.1 CLS 방지 — `width`/`height` 또는 static import

> "You **must** set both `width` and `height` properties unless: the image is statically imported, or the image has the `fill` property."
>
> — [Next.js Docs · Image](https://nextjs.org/docs/app/api-reference/components/image)

```tsx
// ✅ Static import — width/height 추론 + blurDataURL 자동 생성
import hero from './hero.jpg'
<Image src={hero} alt="Hero" placeholder="blur" />

// ✅ 명시적 width/height (remote 이미지)
<Image src="https://cdn.example.com/hero.jpg" alt="Hero" width={1200} height={600} />

// ✅ fill — 부모는 반드시 position: relative/fixed/absolute
<div style={{ position: 'relative', width: '100%', height: 400 }}>
  <Image src="/hero.jpg" alt="Hero" fill sizes="100vw" />
</div>
```

### 1.2 `sizes` — `fill` 사용 시 필수

> "If `sizes` is missing, the browser assumes the image will be as wide as the viewport (`100vw`). This can cause unnecessarily large images to be downloaded."
>
> — [Next.js Docs · Image](https://nextjs.org/docs/app/api-reference/components/image)

```tsx
// ✅ 전체 viewport hero
<Image src="/hero.jpg" alt="Hero" fill sizes="100vw" />

// ✅ 반응형 그리드 (모바일 1컬럼, 데스크톱 3컬럼)
<Image src="/card.jpg" alt="Card" fill sizes="(max-width: 768px) 100vw, 33vw" />

// ✅ 고정 너비
<Image src="/avatar.jpg" alt="Avatar" width={200} height={200} sizes="200px" />
```

→ **`fill` + `sizes` 누락** = 최대 크기 다운로드. 항상 `sizes` 명시.

### 1.3 LCP 이미지 — `preload` prop (Next.js 16 신규 API)

> ⚠️ **Next.js 16부터 `priority` prop이 deprecated되고 `preload` prop으로 대체되었다.**
>
> "Starting with Next.js 16, the `priority` property has been deprecated in favor of the `preload` property in order to make the behavior clear."
>
> — [Next.js Docs · Image](https://nextjs.org/docs/app/api-reference/components/image) (v16.0.0)

#### 공식 사용 기준

> "**When to use it:**
> - The image is the **Largest Contentful Paint (LCP)** element.
> - The image is above the fold, typically the hero image.
> - You want to begin loading the image in the `<head>`, before it's discovered later in the `<body>`.
>
> **When not to use it:**
> - When you have multiple images that could be considered the LCP element depending on the viewport.
> - When the `loading` property is used.
> - When the `fetchPriority` property is used.
>
> In most cases, you should use `loading='eager'` or `fetchPriority='high'` instead of `preload`."

#### 분기 규칙

```tsx
// ✅ 단일 LCP hero — preload
<Image src={hero} alt="Hero" preload />

// ✅ viewport별로 LCP가 달라지는 art direction — fetchPriority
<Image src={heroDesktop} alt="Hero" fetchPriority="high" />

// ✅ 즉시 로드가 필요하지만 preload는 과한 경우 — loading='eager'
<Image src="/secondary.jpg" alt="Secondary" loading="eager" />

// ❌ Next.js 16에서 deprecated
<Image src={hero} alt="Hero" priority />
```

#### 핵심 경고

> "**Never lazy-load your LCP image, as that will always lead to unnecessary resource load delay.**"
>
> — [web.dev · Optimize LCP](https://web.dev/articles/optimize-lcp)

→ LCP 이미지를 `<Suspense>` 안에 두지 않는다 (boundary 해결 전까지 paint가 늦어진다). LCP 요소는 반드시 **static shell**에 둔다.

### 1.4 `quality` — 기본값 75 + Next.js 16 `qualities` config

> "Default quality is 75. If you've configured `qualities` in `next.config.js`, the value must match one of the allowed entries."
>
> — [Next.js Docs · Image](https://nextjs.org/docs/app/api-reference/components/image)

Next.js 16부터 `next.config.js`의 `qualities` 기본값이 `[75]`이므로, 75 외의 값을 쓰려면 명시적으로 추가해야 한다:

```js
// next.config.js
module.exports = {
  images: {
    qualities: [50, 75, 90], // 명시하지 않으면 75만 허용
  },
}
```

### 1.5 Image 체크리스트 — PR 리뷰 전 확인

- [ ] **LCP 이미지** → `preload` prop 명시 (단일 LCP인 경우)
- [ ] **LCP 이미지** → `<Suspense>` 밖, static shell에 배치
- [ ] **`fill` 사용** → `sizes` 명시
- [ ] **remote image** → `next.config.js`의 `images.remotePatterns`에 호스트 등록
- [ ] **`placeholder='blur'`** → static import는 자동, remote는 `blurDataURL` 수동 제공
- [ ] **`priority` prop 사용 금지** (Next.js 16에서 deprecated)
- [ ] **LCP 이미지에 `loading='lazy'` 금지**

> 📎 Remote images `remotePatterns` 설정, Blur placeholder 세부(blurDataURL 생성), Static export `unoptimized` 처리 등은 vercel:nextjs 스킬의 `image.md` 참조.

***

## 2. Font 최적화 — `next/font`

> "`next/font` automatically optimizes your fonts (including custom fonts) and removes external network requests for improved privacy and performance. **It includes built-in automatic self-hosting for any font file. This means you can optimally load web fonts with no layout shift.**"
>
> "You can also conveniently use all Google Fonts. CSS and font files are downloaded at build time and self-hosted with the rest of your static assets. **No requests are sent to Google by the browser.**"
>
> — [Next.js Docs · Font](https://nextjs.org/docs/app/api-reference/components/font)

### 2.1 기본 사용 — Root Layout에서 한 번

```tsx
// app/layout.tsx
import { Inter } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'], // preload 시 필수 — 미지정 + preload:true 는 warning
  display: 'swap',     // 기본값
})

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={inter.className}>
      <body>{children}</body>
    </html>
  )
}
```

### 2.2 CLS 방지 메커니즘 — `adjustFontFallback`

핵심은 "로컬 fallback 폰트의 metric을 실제 웹폰트에 맞게 자동 override"한다는 점이다. 웹폰트가 로드되기 전 fallback 폰트로 렌더링되고, 로드 후 swap되어도 layout shift가 발생하지 않는다.

> "For `next/font/google`: A boolean value that sets whether an automatic fallback font should be used to **reduce Cumulative Layout Shift**. The default is `true`."
>
> "For `next/font/local`: A string... The default is `'Arial'`."
>
> — [Next.js Docs · Font](https://nextjs.org/docs/app/api-reference/components/font)

→ **이 옵션을 끄지 않는다.** CLS 방어의 핵심 메커니즘이다. `adjustFontFallback: false`를 보면 리뷰에서 반려.

### 2.3 Variable Fonts 권장

> "**We recommend using variable fonts for the best performance and flexibility.** But if you can't use a variable font, you will need to specify a weight."
>
> — [Next.js Docs · Fonts](https://nextjs.org/docs/app/getting-started/fonts)

```tsx
// ✅ Variable font — weight 지정 불필요, 모든 weight 지원
const inter = Inter({ subsets: ['latin'] })

// ✅ Non-variable font — 필요한 weight만 명시
const roboto = Roboto({ subsets: ['latin'], weight: ['400', '700'] })

// ❌ 모든 weight 로드 (non-variable에서)
const roboto = Roboto({ subsets: ['latin'], weight: ['100', '300', '400', '500', '700', '900'] })
```

### 2.4 Preload 동작 범위 — 사용 위치가 결정한다

next/font는 사용 위치에 따라 자동 preload 범위가 다르다:

| 사용 위치 | Preload 범위 |
|---|---|
| **Root layout (`app/layout.tsx`)** | 모든 라우트에서 preload |
| **중첩 layout** | 그 layout 하위 모든 라우트에서 preload |
| **특정 page** | 그 라우트에서만 preload |

→ 전역 폰트는 root layout에, 특정 페이지 전용 폰트는 그 페이지 파일에 둔다.

### 2.5 Multiple Fonts — 공유 파일 패턴

컴포넌트마다 `import { Inter } from 'next/font/google'`을 반복하면 **매번 새 인스턴스가 생성**되어 최적화가 깨진다. `lib/fonts.ts`에서 한 번만 정의하고 re-export한다.

```ts
// lib/fonts.ts
import { Inter, Playfair_Display } from 'next/font/google'

export const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

export const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
})
```

```tsx
// app/layout.tsx
import { inter, playfair } from '@/lib/fonts'

export default function RootLayout({ children }) {
  return (
    <html lang="ko" className={`${inter.variable} ${playfair.variable}`}>
      <body className={inter.className}>{children}</body>
    </html>
  )
}
```

### 2.6 Font 체크리스트 — PR 리뷰 전 확인

- [ ] **Google Fonts 사용** → `next/font/google`로 import (`<link>` 태그 금지)
- [ ] **subsets 명시** (`['latin']` 등) — 미지정 시 불필요한 글리프 포함
- [ ] **variable font 우선**, 아니면 필요한 weight만 명시
- [ ] **`adjustFontFallback: true`** 유지 (기본값, 끄지 않는다)
- [ ] **Root layout 또는 `lib/fonts.ts`** 에서 한 번만 정의
- [ ] **`display: 'swap'`** 사용 (기본값이지만 명시 권장)

> 📎 Local fonts 멀티 파일 구성, Tailwind CSS `fontFamily` 통합, display 전략별 차이 등은 vercel:nextjs 스킬의 `font.md` 참조.

***

## ❌ 안티패턴

### Image
- **LCP 이미지에 `loading='lazy'`** — LCP가 반드시 망가진다. ([web.dev](https://web.dev/articles/optimize-lcp))
- **LCP 이미지를 `<Suspense>` 안에 배치** — boundary 해결 전까지 paint 안 됨.
- **`priority` prop 사용** (Next.js 16+) — deprecated. `preload` 또는 `fetchPriority='high'`로 마이그레이션.
- **`fill` + `sizes` 누락** — 브라우저가 `100vw`로 가정해 불필요하게 큰 이미지 다운로드.
- **`width`/`height`/`fill` 없는 `<Image>`** — 런타임 에러 또는 CLS 발생.
- **`<img>` 태그 사용** — next/image 최적화를 완전히 포기.

### Font
- **`<link href="https://fonts.googleapis.com/...">`** — rendering blocking + no self-hosting + no CLS 방어.
- **`@import url('https://fonts.googleapis.com/...')` in CSS** — 같은 이유.
- **`adjustFontFallback: false`** — CLS 방어 메커니즘을 의도적으로 끈다.
- **컴포넌트마다 `Inter({ ... })` 재호출** — 매번 새 인스턴스, 최적화 깨짐.
- **non-variable font에서 모든 weight 로드** — 번들 크기 급증.
- **`subsets` 미지정** — 불필요한 글리프 포함.

***

> 📎 관련: [performance-ssr.md](performance-ssr.md) (Next.js SSR 런타임 성능) · [monitoring.md](monitoring.md) (LCP/CLS 측정) · [build-optimization.md](build-optimization.md) (번들 크기) · vercel:nextjs 스킬 (remote config, Tailwind 통합, local font 멀티 파일)
