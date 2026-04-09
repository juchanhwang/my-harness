# Cost Optimization

## Database 비용 최적화

### 쿼리 효율

```sql
-- ❌ 불필요한 데이터 조회
SELECT * FROM orders WHERE user_id = '123';

-- ✅ 필요한 컬럼만
SELECT id, status, total_amount, created_at FROM orders WHERE user_id = '123';

-- ❌ 대량 데이터 풀스캔
SELECT COUNT(*) FROM orders;

-- ✅ 근사치로 충분하면
SELECT reltuples AS estimate FROM pg_class WHERE relname = 'orders';
```

### Connection 관리

```typescript
// Connection pool 적정 크기 = (코어 수 × 2) + effective_spindle_count
// 예: 4코어 + SSD(1) = 9개
// 과하면: DB 메모리 낭비, 컨텍스트 스위칭
// 부족하면: 요청 대기

const sql = postgres({
  max: 10,              // 과도하게 크게 잡지 않기
  idle_timeout: 20,     // 유휴 연결 빠르게 해제
  max_lifetime: 1800,   // 30분 후 갱신 (connection leak 방지)
});

// Serverless에서: connection pooler 사용 (PgBouncer, Neon pooler)
// 이유: serverless는 인스턴스마다 새 connection → 빠르게 고갈
```

### 불필요한 인덱스 제거

```sql
-- 사용하지 않는 인덱스 = 쓰기 성능 저하 + 스토리지 낭비
SELECT
  schemaname, tablename, indexname,
  idx_scan as usage_count,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
AND indexrelid NOT IN (
  SELECT conindid FROM pg_constraint WHERE contype IN ('p', 'u')
)
ORDER BY pg_relation_size(indexrelid) DESC;

-- 중복 인덱스 찾기
SELECT
  a.indexrelid::regclass AS index_a,
  b.indexrelid::regclass AS index_b,
  pg_size_pretty(pg_relation_size(a.indexrelid)) AS size_a
FROM pg_index a
JOIN pg_index b ON a.indrelid = b.indrelid
  AND a.indexrelid != b.indexrelid
  AND a.indkey::text LIKE b.indkey::text || '%'
ORDER BY pg_relation_size(a.indexrelid) DESC;
```

## Infrastructure 비용

### Right-Sizing

```
문제: "혹시 몰라서" 큰 인스턴스를 선택
현실: 평균 CPU 사용률 5%, 메모리 20%

방법:
1. 2주간 메트릭 수집 (CPU, Memory, Network)
2. P95 사용률 기준으로 인스턴스 크기 결정
3. 피크 대응은 auto-scaling으로

예:
  Before: t3.xlarge (4 vCPU, 16GB) × 3 = $450/월
  After:  t3.medium (2 vCPU, 4GB) × 2 + auto-scale = $120/월
  절감: $330/월 (73%)
```

### Reserved vs On-Demand vs Spot

```
On-Demand: 기본 가격 (유연, 비쌈)
Reserved (1년): ~40% 할인 (예측 가능한 워크로드)
Reserved (3년): ~60% 할인
Spot: ~70-90% 할인 (언제든 중단 가능, batch 작업에 적합)
Savings Plans: 시간당 최소 사용량 약정 → 할인

전략:
- Baseline 트래픽 → Reserved
- Peak 대응 → On-Demand + Auto-scaling
- Batch/Worker → Spot (중단 허용)
```

## API 호출 최적화

### Batching

```typescript
// ❌ 개별 호출
for (const userId of userIds) {
  await notificationService.send(userId, message);
}

// ✅ 배치 호출
await notificationService.sendBatch(
  userIds.map(id => ({ userId: id, message }))
);

// 외부 API 비용 절감 (Stripe 등)
// 개별 조회 100건 = 100 API calls
// Batch 조회 = 1 API call (list endpoint + filter)
const charges = await stripe.charges.list({
  created: { gte: startTimestamp },
  limit: 100,
});
```

### 불필요한 API 호출 제거

```typescript
// ❌ 매 요청마다 외부 API 호출
app.get('/api/exchange-rate', async () => {
  const rate = await fetch('https://api.exchangerate.com/latest'); // 과금
  return rate;
});

// ✅ 캐싱 (환율은 1시간 정도 캐시 가능)
app.get('/api/exchange-rate', async () => {
  return cache.get('exchange-rate', async () => {
    return await fetch('https://api.exchangerate.com/latest');
  }, { ttl: 3600 }); // 1시간 캐시
});

// 월 API 호출: 100만 → 730 (시간당 1회)
// 비용 절감: 99.9%
```

## Serverless vs Always-On

```
Serverless (Lambda, Vercel Functions):
  비용 = 요청 수 × 실행 시간 × 메모리
  장점: 트래픽 0일 때 비용 0
  단점: Cold start, 실행 시간 제한

Always-On (EC2, Railway, Container):
  비용 = 인스턴스 × 시간 (트래픽 무관)
  장점: 일정한 성능, cold start 없음
  단점: 유휴 시에도 비용 발생

판단 기준:
  일 요청 < 100,000 → Serverless가 대체로 저렴
  일 요청 > 1,000,000 → Always-On이 저렴해지는 구간
  일정한 트래픽 → Always-On
  불규칙/spike → Serverless
```

### 비용 계산 예제

```
시나리오: API 서버, 일 100만 요청, 평균 응답 200ms

Serverless (AWS Lambda):
  요청 비용: 1M × $0.0000002 = $0.20/일
  컴퓨팅: 1M × 0.2s × 128MB = $0.33/일
  일 합계: $0.53, 월: ~$16

Always-On (t3.small):
  $0.0208/시간 × 24 × 30 = ~$15/월
  + Load Balancer: ~$16/월
  월 합계: ~$31

→ 이 경우 Serverless가 약 50% 저렴
→ 단, 요청이 10M/일이면 Serverless $160 > Always-On $31
```

## Monitoring-Driven Optimization

### 비용 모니터링 대시보드

```typescript
// 주요 메트릭
const costMetrics = {
  // DB
  dbConnectionsActive: gauge('db_connections_active'),
  dbQueryDuration: histogram('db_query_duration_ms'),
  dbQueryCount: counter('db_queries_total'),

  // 외부 API
  externalApiCalls: counter('external_api_calls_total', ['service']),
  externalApiCost: counter('external_api_cost_usd', ['service']),

  // Cache
  cacheHitRate: gauge('cache_hit_rate'),
  cacheMissRate: gauge('cache_miss_rate'),

  // Infra
  cpuUtilization: gauge('cpu_utilization_percent'),
  memoryUtilization: gauge('memory_utilization_percent'),
};

// 캐시 히트율 모니터링
let hits = 0, misses = 0;
setInterval(() => {
  const rate = hits / (hits + misses || 1);
  costMetrics.cacheHitRate.set(rate);
  if (rate < 0.8) {
    console.warn(`Cache hit rate low: ${(rate * 100).toFixed(1)}%`);
  }
  hits = 0; misses = 0;
}, 60000);
```

### 비용 최적화 체크리스트

| 영역     | 확인 사항                           | 빈도    |
| ------ | ------------------------------- | ----- |
| DB     | 미사용 인덱스, 느린 쿼리, connection pool | 월 1회  |
| 캐시     | Hit rate > 80%, TTL 적절성         | 주 1회  |
| 외부 API | 호출 횟수, 캐싱 여부                    | 월 1회  |
| 인프라    | CPU/메모리 사용률, right-sizing       | 월 1회  |
| 스토리지   | 로그 보관 기간, 불필요 데이터               | 분기 1회 |

### 실무 사례

```
Before:
  - PostgreSQL RDS db.r5.xlarge ($600/월)
  - 모든 쿼리 → DB 직접 조회
  - 외부 API 캐싱 없음 ($200/월 API 비용)

After:
  - PostgreSQL RDS db.r5.large ($300/월) ← right-sizing
  - Redis 캐시 추가 ($50/월) → DB 부하 60% 감소
  - 외부 API 캐싱 → 호출 95% 감소 ($10/월)

  총 비용: $800/월 → $360/월 (55% 절감)
```

## 원칙

1. **측정 먼저, 최적화 나중**: 추측으로 최적화하지 마라
2. **큰 것부터**: 가장 비용이 큰 항목부터 최적화
3. **Trade-off 인식**: 비용 절감 vs 성능/안정성
4. **자동화**: 비용 알림, right-sizing 추천 자동화
5. **정기 리뷰**: 월 1회 비용 리뷰 습관화

---

## Related

- [performance.md](performance.md) — 리소스 사용량 최적화
- [caching.md](caching.md) — 캐시로 DB/API 호출 비용 절감
- [deployment.md](deployment.md) — 인프라 구성·환경 분리
- [observability.md](observability.md) — 사용량 측정·알람
