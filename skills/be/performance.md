# Performance

## 목차

1. [Node.js 프로파일링](#nodejs-프로파일링)
2. [N+1 쿼리 탐지 & 해결](#n1-쿼리-탐지--해결)
3. [Memory Leak 진단](#memory-leak-진단)
4. [Benchmark 도구](#benchmark-도구)
5. [Database Query Optimization](#database-query-optimization)
6. [Bundle/Startup Optimization](#bundlestartup-optimization)
7. [실무 체크리스트](#실무-체크리스트)

## Node.js 프로파일링

### --inspect (Chrome DevTools)

```bash
# 디버그 모드로 실행
node --inspect server.js

# 특정 포트
node --inspect=0.0.0.0:9229 server.js

# 시작 시 바로 break
node --inspect-brk server.js
```

Chrome에서 `chrome://inspect` → "Open dedicated DevTools for Node" → Performance/Memory 탭.

### Flame Graph

```bash
# clinic.js로 flame graph 생성
npx clinic flame -- node server.js
# 부하를 준 후 Ctrl+C → HTML 리포트 자동 생성

# 0x로 flame graph
npx 0x server.js
```

```typescript
// 프로그래밍 방식으로 CPU 프로파일링
import { Session } from 'node:inspector';
import fs from 'node:fs';

const session = new Session();
session.connect();

session.post('Profiler.enable', () => {
  session.post('Profiler.start', () => {
    // 10초 동안 프로파일링
    setTimeout(() => {
      session.post('Profiler.stop', (err, { profile }) => {
        fs.writeFileSync('profile.cpuprofile', JSON.stringify(profile));
        console.log('CPU profile saved');
      });
    }, 10000);
  });
});
```

## N+1 쿼리 탐지 & 해결

### 문제

```typescript
// ❌ N+1: 유저 100명 조회 → 각 유저의 주문을 개별 쿼리
const users = await db.query.users.findMany({ limit: 100 });
for (const user of users) {
  const orders = await db.query.orders.findMany({
    where: eq(orders.userId, user.id), // 100번 실행!
  });
  user.orders = orders;
}
// 총 101개 쿼리
```

### 해결 방법

```typescript
// ✅ 1. JOIN으로 한 번에
const usersWithOrders = await db.query.users.findMany({
  limit: 100,
  with: {
    orders: true, // Drizzle relations 사용
  },
});

// ✅ 2. Batch 조회 (IN clause)
const users = await db.query.users.findMany({ limit: 100 });
const userIds = users.map(u => u.id);

const orders = await db.query.orders.findMany({
  where: inArray(orders.userId, userIds),
});

// userId로 그룹핑
const ordersByUser = Map.groupBy(orders, o => o.userId);
const result = users.map(u => ({
  ...u,
  orders: ordersByUser.get(u.id) ?? [],
}));
// 총 2개 쿼리

// ✅ 3. DataLoader 패턴 (GraphQL에서 주로 사용)
import DataLoader from 'dataloader';

const orderLoader = new DataLoader(async (userIds: readonly string[]) => {
  const orders = await db.query.orders.findMany({
    where: inArray(orders.userId, [...userIds]),
  });
  const byUser = Map.groupBy(orders, o => o.userId);
  return userIds.map(id => byUser.get(id) ?? []);
});

// 여러 곳에서 호출해도 자동 batch
const orders1 = await orderLoader.load('user-1');
const orders2 = await orderLoader.load('user-2');
// → 1개 쿼리로 합쳐짐
```

### N+1 탐지

```typescript
// 쿼리 카운터 미들웨어
let queryCount = 0;

// Drizzle logger
const db = drizzle(sql, {
  logger: {
    logQuery(query) {
      queryCount++;
      if (queryCount > 20) {
        console.warn(`⚠️ High query count: ${queryCount} queries in single request`);
      }
    },
  },
});

// 요청별 리셋
app.addHook('onRequest', async () => { queryCount = 0; });
app.addHook('onResponse', async (request) => {
  if (queryCount > 10) {
    console.warn(`[N+1?] ${request.method} ${request.url}: ${queryCount} queries`);
  }
});
```

## Memory Leak 진단

### Heapdump

```typescript
import v8 from 'node:v8';
import fs from 'node:fs';

// 수동 힙 덤프
function takeHeapSnapshot() {
  const filename = `heap-${Date.now()}.heapsnapshot`;
  const snapshotStream = v8.writeHeapSnapshot(filename);
  console.log(`Heap snapshot: ${snapshotStream}`);
}

// 메모리 사용량 모니터링 → 임계값 초과 시 힙 덤프
// 메모리 구조/GC 이론: nodejs-internals.md §Memory Management & V8 GC 참조
setInterval(() => {
  const { heapUsed } = process.memoryUsage();
  const heapMB = heapUsed / 1024 / 1024;

  if (heapMB > 500) {
    console.warn(`⚠️ High memory: ${heapMB.toFixed(0)}MB`);
    takeHeapSnapshot(); // 분석용 스냅샷
  }
}, 30000);
```

### 흔한 Memory Leak 패턴

```typescript
// ❌ 1. 이벤트 리스너 누적
class Service {
  init() {
    // 매번 호출할 때마다 리스너가 추가됨
    emitter.on('data', this.handleData);
  }
}
// ✅ 정리 필요
class Service {
  init() { emitter.on('data', this.handleData); }
  destroy() { emitter.off('data', this.handleData); }
}

// ❌ 2. 무한히 커지는 Map/Set/Array
const cache = new Map();
function getItem(key) {
  if (!cache.has(key)) {
    cache.set(key, fetchFromDB(key)); // 계속 커짐!
  }
  return cache.get(key);
}
// ✅ LRU Cache 사용
import { LRUCache } from 'lru-cache';
const cache = new LRUCache({ max: 1000 });

// ❌ 3. Closure가 큰 객체 참조 유지
function processLargeData() {
  const hugeArray = new Array(1000000).fill('x');
  return () => {
    // hugeArray를 참조하지 않아도 closure에 의해 유지될 수 있음
    console.log('done');
  };
}
```

> **V8 메모리 구조·GC 알고리즘(Scavenge/Mark-Sweep/Mark-Compact)·`--max-old-space-size` 옵션** 이론은 [nodejs-internals.md](nodejs-internals.md#memory-management--v8-gc)에 정식 정의가 있다.
>
> 이 절은 **메모리 leak 진단 절차**(heap snapshot 찍기, `v8.writeHeapSnapshot` 사용법, leak 패턴 식별)에 집중한다.

## Benchmark 도구

### autocannon (HTTP 벤치마크)

```bash
# 기본 벤치마크
npx autocannon -c 100 -d 30 http://localhost:3000/api/health
# -c: concurrent connections, -d: duration (seconds)

# POST 요청
npx autocannon -c 50 -d 10 -m POST \
  -H "Content-Type: application/json" \
  -b '{"name":"test"}' \
  http://localhost:3000/api/users
```

### k6 (시나리오 기반 부하 테스트)

```javascript
// load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 20 },   // ramp up
    { duration: '1m', target: 100 },    // peak
    { duration: '30s', target: 0 },     // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'],   // 95% < 200ms
    http_req_failed: ['rate<0.01'],     // 에러율 < 1%
  },
};

export default function () {
  const res = http.get('http://localhost:3000/api/products');

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 200ms': (r) => r.timings.duration < 200,
  });

  sleep(1);
}
```

```bash
k6 run load-test.js
```

## Database Query Optimization

### EXPLAIN ANALYZE

```sql
-- 실행 계획 분석
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT o.* FROM orders o
JOIN users u ON u.id = o.user_id
WHERE u.email = 'test@example.com'
AND o.created_at > '2024-01-01';

-- 주요 지표:
-- Seq Scan → Index Scan으로 개선 필요
-- actual time: 실제 실행 시간
-- rows: 예상 vs 실제 행 수 (차이가 크면 ANALYZE 필요)
-- Buffers: shared hit(캐시) vs read(디스크)
```

### pg_stat_statements

```sql
-- 활성화 (postgresql.conf)
-- shared_preload_libraries = 'pg_stat_statements'

-- 느린 쿼리 top 10
SELECT
  query,
  calls,
  mean_exec_time::numeric(10,2) as avg_ms,
  total_exec_time::numeric(10,2) as total_ms,
  rows
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- 총 실행 시간 기준 (가장 영향력 큰 쿼리)
SELECT
  query,
  calls,
  total_exec_time::numeric(10,2) as total_ms,
  (total_exec_time / sum(total_exec_time) OVER() * 100)::numeric(5,2) as pct
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;
```

### 인덱스 최적화

```sql
-- 사용하지 않는 인덱스 찾기
SELECT
  schemaname, tablename, indexname,
  idx_scan as times_used,
  pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
AND indexrelid NOT IN (
  SELECT conindid FROM pg_constraint WHERE contype IN ('p', 'u')
)
ORDER BY pg_relation_size(indexrelid) DESC;

-- 누락된 인덱스 힌트 (sequential scan이 많은 테이블)
SELECT
  relname,
  seq_scan,
  seq_tup_read,
  idx_scan,
  n_live_tup
FROM pg_stat_user_tables
WHERE seq_scan > 100
AND n_live_tup > 10000
ORDER BY seq_tup_read DESC;
```

## Bundle/Startup Optimization

```typescript
// Lazy import로 startup 시간 단축
app.get('/api/reports/pdf', async (request, reply) => {
  // PDF 생성은 드물게 사용 → lazy import
  const { generatePDF } = await import('./services/pdf-generator');
  const pdf = await generatePDF(request.query);
  return reply.type('application/pdf').send(pdf);
});

// Fastify plugin 등록 최적화
// ❌ 모든 플러그인을 동기적으로 로드
// ✅ 라우트별로 필요한 플러그인만 로드
app.register(async (fastify) => {
  // /api/admin/* 라우트에서만 admin 플러그인 로드
  await fastify.register(adminPlugin);
  fastify.get('/api/admin/dashboard', adminHandler);
});
```

## 실무 체크리스트

1. **쿼리 최적화 먼저**: 캐시 추가 전에 쿼리 자체를 최적화
2. **N+1 확인**: 모든 리스트 API에서 쿼리 수 확인
3. **인덱스 검증**: 자주 사용하는 WHERE, JOIN 컬럼에 인덱스
4. **Connection pooling**: DB, Redis 연결 수 적절히 설정
5. **메모리 모니터링**: RSS, heapUsed 추이 확인
6. **벤치마크**: 변경 전후 성능 비교 (autocannon)
7. **Profiling**: 병목은 추측이 아닌 측정으로 찾기

---

## Related

- [nodejs-internals.md](nodejs-internals.md) — V8 GC·메모리 구조
- [caching.md](caching.md) — 캐시 히트율·응답 속도
- [database.md](database.md) — Query 프로파일링·Connection Pool
- [observability.md](observability.md) — 메트릭 수집·APM
