# Performance Testing

> 참조: [web.dev — Core Web Vitals](https://web.dev/articles/vitals) (LCP, INP, CLS 정의와 임계값) · [web.dev — Performance Budgets 101](https://web.dev/articles/performance-budgets-101) · [Chrome DevTools — Lighthouse](https://developer.chrome.com/docs/lighthouse) · [Grafana k6 공식 문서](https://grafana.com/docs/k6/latest/) · [Artillery 공식 문서](https://www.artillery.io/docs) · [MDN — Performance API](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API)

## 목차

1. [성능 테스트 유형](#성능-테스트-유형) — Load, Stress, Spike, Soak
2. [k6 — 부하 테스트](#k6--부하-테스트) — 스크립트·메트릭·threshold
3. [Artillery — 시나리오 기반 부하 테스트](#artillery--시나리오-기반-부하-테스트)
4. [프론트엔드 성능 — Lighthouse](#프론트엔드-성능--lighthouse) — CI 통합
5. [Core Web Vitals](#core-web-vitals) — LCP, INP, CLS
6. [성능 프로파일링](#성능-프로파일링) — DevTools flame chart
7. [성능 예산 (Performance Budget)](#성능-예산-performance-budget)
8. [성능 테스트 체크리스트](#성능-테스트-체크리스트)

***

## 성능 테스트 유형

| 유형                    | 목적                | 예시                  |
| --------------------- | ----------------- | ------------------- |
| **부하 테스트 (Load)**     | 예상 트래픽에서 정상 작동 확인 | 동시 사용자 1,000명       |
| **스트레스 테스트 (Stress)** | 한계점 찾기            | 동시 사용자를 점진적으로 증가    |
| **스파이크 테스트 (Spike)**  | 급격한 트래픽 증가 대응     | 평소 100 → 갑자기 10,000 |
| **내구 테스트 (Soak)**     | 장시간 운영 시 메모리 누수 등 | 24시간 지속             |
| **용량 테스트 (Capacity)** | 최대 처리량 측정         | 초당 최대 요청 수          |

## k6 — 부하 테스트

### 기본 스크립트

```javascript
// load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 100 },  // 2분간 100명까지 증가
    { duration: '5m', target: 100 },  // 5분간 100명 유지
    { duration: '2m', target: 0 },    // 2분간 0명까지 감소
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95%ile 응답 500ms 이하
    http_req_failed: ['rate<0.01'],    // 에러율 1% 미만
    http_reqs: ['rate>100'],           // 초당 100 요청 이상
  },
};

export default function () {
  // 사용자 시나리오
  const loginRes = http.post('http://localhost:3000/api/auth/login', JSON.stringify({
    email: 'test@test.com',
    password: 'password123',
  }), { headers: { 'Content-Type': 'application/json' } });

  check(loginRes, {
    'login status 200': (r) => r.status === 200,
    'login response time < 200ms': (r) => r.timings.duration < 200,
  });

  const token = loginRes.json('token');

  // 인증 후 API 호출
  const productsRes = http.get('http://localhost:3000/api/products', {
    headers: { Authorization: `Bearer ${token}` },
  });

  check(productsRes, {
    'products status 200': (r) => r.status === 200,
    'products response time < 300ms': (r) => r.timings.duration < 300,
    'products count > 0': (r) => r.json('data.length') > 0,
  });

  sleep(1); // 사용자 think time
}
```

### 스트레스 테스트

```javascript
export const options = {
  stages: [
    { duration: '2m', target: 100 },
    { duration: '5m', target: 100 },
    { duration: '2m', target: 200 },
    { duration: '5m', target: 200 },
    { duration: '2m', target: 300 },  // 한계 탐색
    { duration: '5m', target: 300 },
    { duration: '10m', target: 0 },   // 복구 확인
  ],
};
```

### 스파이크 테스트

```javascript
export const options = {
  stages: [
    { duration: '10s', target: 100 },
    { duration: '1m', target: 100 },
    { duration: '10s', target: 1400 },  // 급격한 증가!
    { duration: '3m', target: 1400 },
    { duration: '10s', target: 100 },   // 급격한 감소
    { duration: '3m', target: 100 },
    { duration: '10s', target: 0 },
  ],
};
```

### k6 실행

```bash
# 기본 실행
k6 run load-test.js

# HTML 리포트 생성
K6_WEB_DASHBOARD=true k6 run load-test.js

# 환경별 실행
k6 run -e BASE_URL=https://staging.example.com load-test.js
```

## Artillery — 시나리오 기반 부하 테스트

```yaml
# artillery.yml
config:
  target: http://localhost:3000
  phases:
    - duration: 120
      arrivalRate: 10
      name: "Warm up"
    - duration: 300
      arrivalRate: 50
      name: "Peak load"
  defaults:
    headers:
      Content-Type: application/json

scenarios:
  - name: "User Journey"
    flow:
      - post:
          url: "/api/auth/login"
          json:
            email: "test@test.com"
            password: "password123"
          capture:
            - json: "$.token"
              as: "authToken"
      - get:
          url: "/api/products"
          headers:
            Authorization: "Bearer {{ authToken }}"
          expect:
            - statusCode: 200
            - hasProperty: "data"
      - think: 2
      - post:
          url: "/api/cart/add"
          headers:
            Authorization: "Bearer {{ authToken }}"
          json:
            productId: "product-1"
            quantity: 1
```

## 프론트엔드 성능 — Lighthouse

### Lighthouse CI 설정

```javascript
// lighthouserc.js
module.exports = {
  ci: {
    collect: {
      url: [
        'http://localhost:3000/',
        'http://localhost:3000/products',
        'http://localhost:3000/checkout',
      ],
      numberOfRuns: 3, // 3회 실행 평균
    },
    assert: {
      preset: 'lighthouse:recommended',
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 0.9 }],
        'categories:best-practices': ['error', { minScore: 0.9 }],
        'categories:seo': ['warn', { minScore: 0.8 }],
        'first-contentful-paint': ['error', { maxNumericValue: 2000 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['error', { maxNumericValue: 300 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
```

## Core Web Vitals

Google이 정의한 사용자 경험의 핵심 지표:

| 지표                                  | 측정 대상   | 좋음      | 개선 필요   | 나쁨      |
| ----------------------------------- | ------- | ------- | ------- | ------- |
| **LCP** (Largest Contentful Paint)  | 로딩 속도   | ≤ 2.5s  | ≤ 4s    | > 4s    |
| **INP** (Interaction to Next Paint) | 응답성     | ≤ 200ms | ≤ 500ms | > 500ms |
| **CLS** (Cumulative Layout Shift)   | 시각적 안정성 | ≤ 0.1   | ≤ 0.25  | > 0.25  |

### 프로그래밍 방식 측정

```typescript
// web-vitals 라이브러리 사용
import { onLCP, onINP, onCLS } from 'web-vitals';

onLCP(metric => {
  console.log('LCP:', metric.value);
  // 모니터링 서비스로 전송
  analytics.track('web-vitals', {
    name: 'LCP',
    value: metric.value,
    rating: metric.rating, // 'good', 'needs-improvement', 'poor'
  });
});

onINP(metric => console.log('INP:', metric.value));
onCLS(metric => console.log('CLS:', metric.value));
```

## 성능 프로파일링

### Node.js 메모리 프로파일링

```typescript
// 메모리 사용량 모니터링
function logMemoryUsage() {
  const usage = process.memoryUsage();
  console.log({
    rss: `${(usage.rss / 1024 / 1024).toFixed(2)} MB`,
    heapTotal: `${(usage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
    heapUsed: `${(usage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
    external: `${(usage.external / 1024 / 1024).toFixed(2)} MB`,
  });
}

// 주기적 모니터링
setInterval(logMemoryUsage, 30000);
```

### React 렌더링 프로파일링

```typescript
// React DevTools Profiler API
import { Profiler } from 'react';

function onRender(
  id: string,
  phase: 'mount' | 'update',
  actualDuration: number,
  baseDuration: number,
) {
  if (actualDuration > 16) { // 60fps = 16.67ms/frame
    console.warn(`Slow render: ${id} took ${actualDuration.toFixed(2)}ms`);
  }
}

<Profiler id="ProductList" onRender={onRender}>
  <ProductList products={products} />
</Profiler>
```

## 성능 예산 (Performance Budget)

```json
{
  "budgets": [
    {
      "resourceType": "script",
      "budget": 300
    },
    {
      "resourceType": "stylesheet",
      "budget": 100
    },
    {
      "resourceType": "image",
      "budget": 500
    },
    {
      "resourceType": "total",
      "budget": 1000
    },
    {
      "metric": "first-contentful-paint",
      "budget": 1500
    },
    {
      "metric": "largest-contentful-paint",
      "budget": 2500
    }
  ]
}
```

## 성능 테스트 체크리스트

* [ ] 핵심 API의 응답 시간 SLA가 정의되어 있는가
* [ ] 부하 테스트가 CI에서 정기적으로 실행되는가
* [ ] Core Web Vitals가 모니터링되는가
* [ ] Lighthouse CI가 PR에서 실행되는가
* [ ] 성능 예산이 설정되어 있는가
* [ ] 메모리 누수 감지 메커니즘이 있는가
* [ ] 번들 사이즈가 추적되는가
* [ ] 성능 회귀 시 알림이 오는가