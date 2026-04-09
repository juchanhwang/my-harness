# Analytics

> 핵심 메시지: **"추적하지 않으면 개선할 수 없다. 하지만 모든 걸 추적하면 아무것도 보이지 않는다."**

***

## 1. 이벤트 네이밍

`[object]_[action]` 형식으로 통일한다.

```tsx
// ✅ 일관된 네이밍
'page_view'
'button_click'
'form_submit'
'signup_complete'
'payment_success'

// ❌ 비일관적 네이밍
'clickButton'
'UserSignedUp'
'payment-failed'
```

***

## 2. 이벤트 계층

| 계층 | 설명 | 예시 |
|------|------|------|
| **Essential** | 비즈니스 핵심 이벤트 | 회원가입, 결제, 페이지뷰 |
| **Important** | 핵심 기능 사용 | 검색, 필터, 주요 버튼 클릭 |
| **Analytical** | 상세 인터랙션 | 탭 전환, 스크롤 깊이, 호버 |

***

## 3. 추상화 레이어

```tsx
// lib/analytics.ts
class Analytics {
  private providers: AnalyticsProvider[] = [];

  register(provider: AnalyticsProvider) {
    this.providers.push(provider);
  }

  track(event: string, properties?: Record<string, unknown>) {
    this.providers.forEach(provider => {
      provider.track(event, properties);
    });
  }

  page(properties?: Record<string, unknown>) {
    this.providers.forEach(provider => {
      provider.page(properties);
    });
  }
}

export const analytics = new Analytics();
```

***

## 4. React 통합

```tsx
// hooks/useTrack.ts
import { analytics } from '@/lib/analytics';

export function useTrack() {
  return {
    track: (event: string, properties?: Record<string, unknown>) => {
      analytics.track(event, properties);
    },
  };
}

// 자동 페이지뷰 추적
'use client';
import { usePathname, useSearchParams } from 'next/navigation';

export function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    analytics.page({
      path: pathname,
      query: searchParams.toString(),
    });
  }, [pathname, searchParams]);

  return null;
}
```

***

## 5. 퍼널 분석

```tsx
// 퍼널 단계 정의
const SIGNUP_FUNNEL = [
  'landing_view',        // 1. 랜딩 페이지 방문
  'signup_start',        // 2. 회원가입 시작
  'email_verified',      // 3. 이메일 인증
  'onboarding_complete', // 4. 온보딩 완료
  'first_action',        // 5. 첫 액션
] as const;

// 퍼널 추적
function trackFunnelStep(step: typeof SIGNUP_FUNNEL[number], index: number) {
  analytics.track('funnel_step', {
    funnel: 'signup',
    step,
    stepIndex: index,
  });
}
```

***

## ❌ 안티패턴

* **분석 라이브러리 직접 import**: 추상화 레이어를 통해 사용
* **사소한 클릭 모두 추적**: 의미 있는 액션만 추적
* **이벤트에 PII 포함**: 이메일, 전화번호 등 개인정보 전송 금지
* **이벤트 네이밍 불일치**: `[object]_[action]` 형식 준수

***

> 📎 관련: [monitoring.md](monitoring.md) · [seo.md](seo.md)
