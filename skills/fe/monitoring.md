# Monitoring

> 핵심 메시지: **"프로덕션 에러는 사용자가 알려주기 전에 내가 먼저 알아야 한다."**

이 문서는 **에러 추적 + Core Web Vitals 측정 + 알림/로깅**을 다룬다. 사용자 행동 추적과 분석은 [analytics.md](analytics.md), 번들 크기 측정은 [build-optimization.md](build-optimization.md), Next.js SSR 런타임 성능은 [performance-ssr.md](performance-ssr.md), React 렌더링 성능은 [performance-react-rendering.md](performance-react-rendering.md) 참조.

***

## 1. Sentry 에러 추적

### 1.1 설치 및 초기화

```bash
pnpm add @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

```ts
// sentry.client.config.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  environment: process.env.NEXT_PUBLIC_ENV,
});
```

### 1.2 사용자 컨텍스트 추가

```ts
// 로그인 시 사용자 ID 설정 (PII 주의)
Sentry.setUser({ id: user.id });

// 추가 컨텍스트
Sentry.setContext('subscription', { plan: user.plan });

// 로그아웃 시
Sentry.setUser(null);
```

### 1.3 의도적 에러 캡처

```ts
try {
  await riskyOperation();
} catch (error) {
  Sentry.captureException(error, {
    tags: { feature: 'checkout' },
    extra: { orderId },
  });
  throw error; // UI에서도 처리할 수 있도록
}
```

***

## 2. Core Web Vitals 측정

최적화 전에 **반드시 측정**한다. 인용은 web.dev (Google Chrome 팀) 공식 문서를 1차 출처로 한다.

### 2.1 Core Web Vitals 임계값 (2026년 기준)

현재 안정 Core Web Vitals는 **3개**다 — LCP, INP, CLS. 2025–2026에 추가된 신규 메트릭은 없다.

> "Largest Contentful Paint (LCP), Interaction to Next Paint (INP), and Cumulative Layout Shift (CLS)"
>
> "To ensure you're hitting the recommended target for these metrics for most of your users, a good threshold to measure is the **75th percentile** of page loads, segmented across mobile and desktop devices."
>
> — [web.dev · Web Vitals](https://web.dev/articles/vitals)

| 지표 | Good | Needs Improvement | Poor |
|---|---|---|---|
| **LCP** (Largest Contentful Paint) | ≤ **2.5 s** | 2.5 s ~ 4.0 s | > **4.0 s** |
| **INP** (Interaction to Next Paint) | ≤ **200 ms** | 200 ms ~ 500 ms | > **500 ms** |
| **CLS** (Cumulative Layout Shift) | ≤ **0.1** | 0.1 ~ 0.25 | > **0.25** |

출처: [LCP](https://web.dev/articles/lcp) · [INP](https://web.dev/articles/inp) · [CLS](https://web.dev/articles/cls)

`web-vitals` npm 라이브러리(v5.2.0) 소스에서도 동일하게 정의된다:

```ts
// node_modules/web-vitals/src/onLCP.ts
export const LCPThresholds: MetricRatingThresholds = [2500, 4000];
// node_modules/web-vitals/src/onINP.ts
export const INPThresholds: MetricRatingThresholds = [200, 500];
// node_modules/web-vitals/src/onCLS.ts
export const CLSThresholds: MetricRatingThresholds = [0.1, 0.25];
```

#### INP가 FID를 대체했다 (2024-03-12)

> "INP will officially become a Core Web Vital and replace FID on March 12"
>
> "FID will be removed from Google Search Console as soon as INP becomes a Core Web Vital on March 12. ... developers will have until **September 9, 2024** to transition over to INP."
>
> — [web.dev Blog · INP launch](https://web.dev/blog/inp-cwv-launch)

→ FID를 추적하는 대시보드/알람은 **모두 INP로 교체**해야 한다. `web-vitals` v5에서 `onFID`는 export되지 않는다 (`Metric['name']` 유니온은 `'CLS' | 'FCP' | 'INP' | 'LCP' | 'TTFB'`).

### 2.2 Lab Data vs Field Data — 둘 다 필요하다

> "**Lab data** is determined by loading a web page in a controlled environment with a predefined set of network and device conditions."
>
> "**Field data** is determined by monitoring all users who visit a page and measuring a given set of performance metrics for each one of those users' individual experiences."
>
> — [web.dev · Lab vs Field](https://web.dev/articles/lab-and-field-data-differences)

| | Lab (실험실) | Field (현장 / RUM) |
|---|---|---|
| **수집 방식** | 통제된 환경에서 합성 측정 | 실제 사용자 디바이스에서 수집 |
| **재현성** | 동일 조건 → 동일 결과 | 변동 큼 (디바이스/네트워크/입력 다양) |
| **장점** | 디버깅, 회귀 감지, CI 게이트 | 실제 사용자 경험 반영 |
| **단점** | 실제 사용자 분포 미반영 | 디버깅 어려움, 데이터 수집 시간 필요 |
| **대표 도구** | Lighthouse, WebPageTest, PSI Lab | CrUX, Search Console, RUM 솔루션 |

→ **CI 게이트는 Lab**, **제품 결정은 Field**로 한다. INP/CLS는 사용자 상호작용 후에야 측정되므로 Lab 단독으로는 정확도가 낮다.

### 2.3 Next.js — `useReportWebVitals`로 직접 RUM 구축

Next.js는 `next/web-vitals`에서 `useReportWebVitals` 훅을 제공한다.

> "Since the `useReportWebVitals` hook requires the `'use client'` directive, the most performant approach is to create a separate component that the root layout imports. This confines the client boundary exclusively to the `WebVitals` component."
>
> — [Next.js Docs · useReportWebVitals](https://nextjs.org/docs/app/api-reference/functions/use-report-web-vitals)

```tsx
// app/_components/web-vitals.tsx
'use client'

import { useReportWebVitals } from 'next/web-vitals'
import type { NextWebVitalsMetric } from 'next/app'

// ⚠️ 모듈 레벨 상수로 선언 — 콜백 참조가 매 렌더마다 바뀌면 중복 보고 발생
const logWebVitals = (metric: NextWebVitalsMetric) => {
  const body = JSON.stringify(metric)
  navigator.sendBeacon('/api/vitals', body) ||
    fetch('/api/vitals', { body, method: 'POST', keepalive: true })
}

export function WebVitals() {
  useReportWebVitals(logWebVitals)
  return null
}
```

```tsx
// app/layout.tsx (Server Component)
import { WebVitals } from './_components/web-vitals'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <WebVitals />
        {children}
      </body>
    </html>
  )
}
```

#### 핵심 함정 — 콜백 참조 안정화

> "New functions passed to `useReportWebVitals` are called with the available metrics up to that point. To prevent reporting duplicated data, ensure that the callback function reference does not change."
>
> — [Next.js Docs · useReportWebVitals](https://nextjs.org/docs/app/api-reference/functions/use-report-web-vitals)

→ **인라인 화살표 함수 금지.** 모듈 레벨 상수 또는 `useCallback`(의존성 배열 비움)을 사용한다.

### 2.4 Vercel Speed Insights — Managed 옵션

직접 RUM을 구축하지 않으려면 `@vercel/speed-insights`를 추가한다.

> "Vercel Speed Insights provides you with a detailed view of your website's performance metrics, based on Core Web Vitals, enabling you to make data-driven decisions for optimizing your site."
>
> — [Vercel Docs · Speed Insights](https://vercel.com/docs/speed-insights)

> 📎 **용어 주의**: Vercel은 이 제품을 **"Speed Insights"**로 부르며 "RUM"이라는 약어를 쓰지 않는다. 자체 메트릭은 **"Real Experience Score (RES)"**다. 외부 문서/슬라이드 작성 시 Vercel 제품을 "RUM"으로 표기하지 말고 "Speed Insights"로 표기한다.

```bash
pnpm add @vercel/speed-insights
```

```tsx
// app/layout.tsx — 'use client' 추가 불필요
import { SpeedInsights } from '@vercel/speed-insights/next'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        {children}
        <SpeedInsights />
      </body>
    </html>
  )
}
```

> 📎 `@vercel/speed-insights/next` 엔트리 자체가 내부적으로 `'use client'` + `<Suspense>`로 감싸져 있어, Server Component인 `layout.tsx`에서 직접 import해도 client boundary가 패키지 내부에서 처리된다.
>
> 출처: [vercel/speed-insights · packages/web/src/nextjs/index.tsx](https://github.com/vercel/speed-insights/blob/main/packages/web/src/nextjs/index.tsx)

> "This package does **not** track data in development mode."
>
> — [vercel/speed-insights README](https://github.com/vercel/speed-insights/blob/main/packages/web/README.md)

#### Speed Insights vs Web Analytics

| | Speed Insights | Web Analytics |
|---|---|---|
| **목적** | Core Web Vitals 추적 | 방문자/페이지뷰 추적 |
| **패키지** | `@vercel/speed-insights` | `@vercel/analytics` |
| **데이터** | LCP/INP/CLS + RES | 방문자 수, 경로별 트래픽 |

→ 두 제품은 **상호 배타가 아니다**. 둘 다 같이 쓴다. 사용자 이벤트 추적은 [analytics.md](analytics.md) 참조.

### 2.5 Lab 도구 — 디버깅/CI

| 도구 | 측정 종류 | 용도 |
|---|---|---|
| **Lighthouse** (DevTools / CLI) | Lab only | 로컬 디버깅, CI 게이트 |
| **PageSpeed Insights** | Lab + Field (CrUX) | 배포 후 실 사용자 데이터 확인 |
| **Chrome DevTools · Performance** | Lab | 프로파일링, INP 디버깅 |
| **CrUX (Chrome UX Report)** | Field only | 28일 이동 평균, 도메인 단위 |
| **React DevTools Profiler** | Lab | 컴포넌트 리렌더 디버깅 |

> Lighthouse는 합성 측정이라 INP를 정확히 잡지 못한다. INP/CLS의 진짜 값은 **반드시 Field 데이터** (Speed Insights, CrUX, 직접 RUM)로 확인한다.

***

## 3. 알림 설정

### 3.1 Sentry 알림 규칙

| 트리거 | 채널 | 우선순위 |
|---|---|---|
| 새로운 에러 발생 | Slack #alerts-prod | 즉시 |
| 에러 빈도 급증 (5분간 10건+) | Slack + 이메일 | 즉시 |
| 성능 저하 (P95 > 3초) | Slack #alerts-perf | 일간 요약 |
| Crash-free rate < 99% | PagerDuty | 즉시 (호출) |

### 3.2 임계값 설정 원칙

- 너무 낮은 임계값 → 알림 피로 → 무시 → 진짜 문제 놓침
- 너무 높은 임계값 → 사용자가 먼저 발견 → 신뢰 손실
- **첫 주는 보수적으로**, 데이터 쌓이면 조정한다.

***

## 4. 로깅 전략

### 4.1 클라이언트 vs 서버

```ts
// 클라이언트 — Sentry로
console.error는 production에서는 노이즈만 추가한다. Sentry로 보낸다.

// 서버 — 구조화된 로그
import pino from 'pino';
const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
});

logger.info({ userId, action: 'login' }, 'User logged in');
logger.error({ err, orderId }, 'Order processing failed');
```

### 4.2 로그 레벨

- **error**: 사용자에게 영향 있는 실패 (반드시 Sentry로도)
- **warn**: 잠재적 문제 (재시도, fallback 사용)
- **info**: 비즈니스 이벤트 (주문 생성, 결제 완료)
- **debug**: 개발 환경에서만

***

## ❌ 안티패턴

- **에러 무시하기** — `catch (e) {}` 또는 `console.error`만 하고 끝.
- **PII 노출** — 이메일, 전화번호를 에러 메시지나 태그에 직접 넣기.
- **모든 환경에서 100% 샘플링** — 비용 폭발. production은 10~20%로.
- **알림만 받고 아무도 안 봄** — 담당자/로테이션을 정하라.
- **`useReportWebVitals` 콜백을 인라인 함수로 전달** — 매 렌더마다 새 참조 → 중복 보고 발생.
- **FID 추적 유지** — 2024-03-12에 INP로 대체됨. 대시보드/알람을 INP로 교체.
- **Lighthouse 점수만 보고 INP가 좋다고 판단** — Lab은 사용자 상호작용을 시뮬레이션하지 않는다. Field 데이터로 확인.
- **개발 모드에서 Speed Insights 검증** — `@vercel/speed-insights`는 dev 모드에서 데이터를 전송하지 않는다.

***

> 📎 관련: [analytics.md](analytics.md) (사용자 행동 추적) · [performance-ssr.md](performance-ssr.md) (Next.js SSR 런타임 성능) · [performance-react-rendering.md](performance-react-rendering.md) (React 렌더링 성능) · [build-optimization.md](build-optimization.md) (번들 크기 측정) · [error-handling.md](error-handling.md)
