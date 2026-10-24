# Performance Testing

> 참조: [web.dev — Core Web Vitals](https://web.dev/articles/vitals) (LCP, INP, CLS 정의와 임계값) · [web.dev — Performance Budgets 101](https://web.dev/articles/performance-budgets-101) · [web.dev — Lighthouse로 성능 예산](https://web.dev/articles/use-lighthouse-for-performance-budgets) (KB·ms 단위) · [Chrome DevTools — Lighthouse](https://developer.chrome.com/docs/lighthouse) · [Lighthouse CI 설정](https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/configuration.md) · [Grafana k6 공식 문서](https://grafana.com/docs/k6/latest/) · [Artillery 공식 문서](https://www.artillery.io/docs) · [MDN — Performance API](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API)

프로파일링·병목 분석은 `~/.claude/skills/be/performance.md`, FE 렌더링·SSR 성능은 `~/.claude/skills/fe/performance-ssr.md`, Core Web Vitals 측정(RUM, Lab/Field)은 `~/.claude/skills/fe/monitoring.md`를 따른다. 이 파일은 QA의 판정 기준값과 부하 테스트 유형만 둔다.

## Core Web Vitals

| 지표 | 좋음 | 개선 필요 | 나쁨 |
|---|---|---|---|
| **LCP** (로딩 속도) | ≤ 2.5s | ≤ 4s | > 4s |
| **INP** (응답성) | ≤ 200ms | ≤ 500ms | > 500ms |
| **CLS** (시각적 안정성) | ≤ 0.1 | ≤ 0.25 | > 0.25 |

- 통과는 방문의 **75퍼센타일**에서 세 지표가 모두 '좋음'일 때다(모바일·데스크톱을 나눠서 본다).
- Lighthouse는 Lab 측정이라 INP를 정확히 재지 못한다. CI 게이트는 Lab으로, INP·CLS 판정은 Field 데이터(CrUX, RUM)로 한다(`~/.claude/skills/fe/monitoring.md` §2.2).

## 성능 예산 (예시값)

프로젝트에 정해진 예산이 있으면 그것이 기준이고, 없으면 예산이 없다는 점을 지적한다.

- 리소스: script 300KB · stylesheet 100KB · image 500KB · 전체 1,000KB. 시간: FCP 1,500ms · LCP 2,500ms
- Lighthouse CI assertion: performance·accessibility·best-practices 점수 ≥ 0.9(error), SEO 점수 ≥ 0.8(warn), FCP ≤ 2,000ms · LCP ≤ 2,500ms · CLS ≤ 0.1 · TBT ≤ 300ms(error)
- 위 FCP 두 값은 예시끼리 다르다. 프로젝트에서는 하나로 정한다.
- assertion은 기본 `aggregationMethod: optimistic`, 즉 여러 실행 중 통과 가능성이 가장 높은 값으로 판정한다. 회귀 게이트에는 `median-run`이나 `pessimistic`을 명시한다.
- Lighthouse는 기본이 모바일 프로필이고 데스크톱은 `--preset=desktop`이다. 판정에 쓴 프로필을 리포트에 적는다.

## 부하 테스트 유형

| 유형 | 목적 | 부하 모양 (VU) | 판정 |
|---|---|---|---|
| **Load** | 예상 트래픽에서 정상 동작 | 증가 → 유지 → 감소 (예: 2분간 100명까지, 5분 유지, 2분간 0명) | 임계값(p95, 에러율) 충족 |
| **Stress** | 한계점 찾기 | 100 → 200 → 300명 단계 상승(각 5분 유지) 뒤 10분에 걸쳐 0명 | 성능이 꺾이는 지점을 기록하고, 부하를 내린 뒤 지연·에러가 복구된다 |
| **Spike** | 급격한 증가 대응 | 100명에서 10초 만에 1,400명으로 올려 3분 유지 → 100명으로 내려 3분 | 급증 구간의 에러율, 급감 후 복구 |
| **Soak** | 장시간 운영 시 누수 | 일정한 부하를 길게 (예: 24시간) | 메모리·커넥션이 계속 늘지 않는다 |
| **Capacity** | 최대 처리량 측정 | — | 초당 최대 요청 수를 기록한다 |

## k6 예시

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 100 }, // 증가
    { duration: '5m', target: 100 }, // 유지
    { duration: '2m', target: 0 },   // 감소
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // p95 500ms 미만
    http_req_failed: ['rate<0.01'],   // 에러율 1% 미만
    http_reqs: ['rate>100'],          // 초당 100 요청 이상
  },
};

export default function () {
  const res = http.get(`${__ENV.BASE_URL}/api/products`);
  check(res, { 'status 200': (r) => r.status === 200 });
  sleep(1); // think time
}
```

- 실행: `k6 run -e BASE_URL=https://staging.example.com load-test.js`. threshold가 하나라도 실패하면 k6가 0이 아닌 종료 코드로 끝나므로 CI 게이트로 쓸 수 있다.
- 임계값 수치는 예시다. 실제 기준은 요구사항·SLA에서 가져온다.
- Stress·Spike·Soak은 `stages`만 위 표대로 바꾼다. Artillery(YAML `phases`·`scenarios`)와 autocannon(`~/.claude/skills/be/performance.md`)은 대체·보조 도구다.

## 체크리스트

- [ ] 핵심 API의 응답 시간 SLA가 정의되어 있는가
- [ ] 부하 테스트가 CI에서 정기적으로 실행되는가
- [ ] Core Web Vitals가 모니터링되는가
- [ ] Lighthouse CI가 PR에서 실행되는가
- [ ] 성능 예산이 설정되어 있는가
- [ ] 메모리 누수 감지 메커니즘이 있는가
- [ ] 번들 사이즈가 추적되는가
- [ ] 성능 회귀 시 알림이 오는가
