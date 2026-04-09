# Caching

## 목차

1. [Redis 캐싱 패턴](#redis-캐싱-패턴)
2. [Cache Invalidation 전략](#cache-invalidation-전략)
3. [Cache Stampede 방지](#cache-stampede-방지)
4. [Multi-Level Caching](#multi-level-caching)
5. [HTTP Caching](#http-caching)
6. [실무 가이드라인](#실무-가이드라인)

## Redis 캐싱 패턴

### Cache-Aside (Lazy Loading)

가장 일반적인 패턴. 애플리케이션이 캐시를 직접 관리.

```typescript
import Redis from 'ioredis';

const redis = new Redis();

class CacheAside<T> {
  constructor(
    private readonly prefix: string,
    private readonly ttlSeconds: number = 300
  ) {}

  async get(key: string, fetcher: () => Promise<T>): Promise<T> {
    const cacheKey = `${this.prefix}:${key}`;

    // 1. 캐시 확인
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // 2. 캐시 미스 → DB에서 조회
    const data = await fetcher();

    // 3. 캐시에 저장
    if (data !== null && data !== undefined) {
      await redis.setex(cacheKey, this.ttlSeconds, JSON.stringify(data));
    }

    return data;
  }

  async invalidate(key: string): Promise<void> {
    await redis.del(`${this.prefix}:${key}`);
  }

  async invalidatePattern(pattern: string): Promise<void> {
    const keys = await redis.keys(`${this.prefix}:${pattern}`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }
}

// 사용
const userCache = new CacheAside<User>('user', 600);

async function getUser(userId: string): Promise<User> {
  return userCache.get(userId, () =>
    db.query.users.findFirst({ where: eq(users.id, userId) })
  );
}

async function updateUser(userId: string, data: UpdateUserInput) {
  await db.update(users).set(data).where(eq(users.id, userId));
  await userCache.invalidate(userId); // 캐시 무효화
}
```

### Write-Through

쓰기 시 캐시와 DB를 동시에 업데이트. 읽기 시 항상 캐시 히트 보장.

```typescript
class WriteThrough<T> {
  async set(key: string, data: T, dbWriter: (data: T) => Promise<void>): Promise<void> {
    // DB와 캐시를 동시에 업데이트
    await dbWriter(data);
    await redis.setex(`${this.prefix}:${key}`, this.ttlSeconds, JSON.stringify(data));
  }

  async get(key: string): Promise<T | null> {
    const cached = await redis.get(`${this.prefix}:${key}`);
    return cached ? JSON.parse(cached) : null;
  }
}
```

### Write-Behind (Write-Back)

캐시에 먼저 쓰고, 나중에 비동기로 DB에 반영. 쓰기 성능 최적화.

```typescript
class WriteBehind {
  async increment(key: string, field: string, value: number = 1): Promise<void> {
    // Redis에 즉시 반영
    await redis.hincrby(`counter:${key}`, field, value);

    // 비동기 DB 동기화 (debounced)
    await syncQueue.add(
      'sync-counter',
      { key, field },
      {
        delay: 5000,                    // 5초 후 실행
        jobId: `sync:${key}:${field}`,  // 중복 방지 (같은 키면 교체)
      }
    );
  }
}

// 조회수, 좋아요 등 높은 쓰기 빈도에 적합
const viewCounter = new WriteBehind();
await viewCounter.increment('post:123', 'views');
```

## Cache Invalidation 전략

### 1. Time-based (TTL)

가장 단순. TTL 만료 시 자동 무효화.

```typescript
await redis.setex('user:123', 300, data); // 5분 TTL
```

### 2. Event-based

데이터 변경 시 명시적으로 캐시 무효화.

```typescript
// 사용자 정보 업데이트 시
async function updateUserProfile(userId: string, data: ProfileUpdate) {
  await db.update(users).set(data).where(eq(users.id, userId));

  // 관련된 모든 캐시 무효화
  await Promise.all([
    redis.del(`user:${userId}`),
    redis.del(`user:${userId}:profile`),
    redis.del(`user:${userId}:settings`),
  ]);
}
```

### 3. Version-based

캐시 키에 버전을 포함. 데이터 변경 시 버전만 올리면 이전 캐시는 자동 만료.

```typescript
async function getUserWithVersion(userId: string) {
  const version = await redis.get(`user:${userId}:version`) || '1';
  const cacheKey = `user:${userId}:v${version}`;

  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  await redis.setex(cacheKey, 3600, JSON.stringify(user));
  return user;
}

async function invalidateUserCache(userId: string) {
  await redis.incr(`user:${userId}:version`);
}
```

## Cache Stampede 방지

캐시 만료 직후 다수의 요청이 동시에 DB를 때리는 문제.

### Mutex Lock (Single Flight)

```typescript
async function getWithMutex<T>(
  key: string,
  ttl: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const lockKey = `lock:${key}`;
  const acquired = await redis.set(lockKey, '1', 'EX', 10, 'NX');

  if (acquired) {
    try {
      const data = await fetcher();
      await redis.setex(key, ttl, JSON.stringify(data));
      return data;
    } finally {
      await redis.del(lockKey);
    }
  } else {
    // Lock 획득 실패 → 잠시 대기 후 재시도
    await new Promise((r) => setTimeout(r, 100));
    return getWithMutex(key, ttl, fetcher);
  }
}
```

### Stale-While-Revalidate

만료된 캐시를 일단 반환하고, 백그라운드에서 갱신.

```typescript
async function getWithSWR<T>(
  key: string,
  ttl: number,
  staleTtl: number, // stale 데이터 허용 시간
  fetcher: () => Promise<T>
): Promise<T> {
  const result = await redis.hgetall(key);

  if (result.data) {
    const data = JSON.parse(result.data);
    const expiresAt = parseInt(result.expiresAt);

    if (Date.now() > expiresAt) {
      // 만료됨 → 백그라운드에서 갱신, stale 데이터 반환
      refreshInBackground(key, ttl, staleTtl, fetcher);
    }

    return data;
  }

  // 캐시 없음 → 동기적으로 가져옴
  const fresh = await fetcher();
  await setWithSWR(key, fresh, ttl, staleTtl);
  return fresh;
}

async function setWithSWR<T>(key: string, data: T, ttl: number, staleTtl: number) {
  await redis.hset(key, {
    data: JSON.stringify(data),
    expiresAt: (Date.now() + ttl * 1000).toString(),
  });
  await redis.expire(key, ttl + staleTtl); // stale 기간 포함한 전체 TTL
}
```

## Multi-Level Caching

### L1: In-Memory (프로세스 내) + L2: Redis

```typescript
import { LRUCache } from 'lru-cache';

class MultiLevelCache<T> {
  private l1: LRUCache<string, T>;

  constructor(
    private readonly prefix: string,
    private readonly l2TtlSeconds: number = 300,
    l1Options: { max: number; ttlMs: number } = { max: 1000, ttlMs: 30000 }
  ) {
    this.l1 = new LRUCache<string, T>({
      max: l1Options.max,
      ttl: l1Options.ttlMs,
    });
  }

  async get(key: string, fetcher: () => Promise<T>): Promise<T> {
    const fullKey = `${this.prefix}:${key}`;

    // L1 확인
    const l1Hit = this.l1.get(fullKey);
    if (l1Hit !== undefined) return l1Hit;

    // L2 확인
    const l2Hit = await redis.get(fullKey);
    if (l2Hit) {
      const data = JSON.parse(l2Hit) as T;
      this.l1.set(fullKey, data); // L1에 채우기
      return data;
    }

    // DB에서 조회
    const data = await fetcher();
    this.l1.set(fullKey, data);
    await redis.setex(fullKey, this.l2TtlSeconds, JSON.stringify(data));

    return data;
  }

  async invalidate(key: string): Promise<void> {
    const fullKey = `${this.prefix}:${key}`;
    this.l1.delete(fullKey);
    await redis.del(fullKey);
  }
}

// 사용
const configCache = new MultiLevelCache<AppConfig>('config', 600, {
  max: 100,
  ttlMs: 60000,  // L1: 1분, L2: 10분
});

const config = await configCache.get('global', () =>
  db.query.appConfigs.findFirst({ where: eq(appConfigs.key, 'global') })
);
```

## HTTP Caching

### ETag

```typescript
import { createHash } from 'crypto';

app.get('/api/products/:id', async (request, reply) => {
  const product = await getProduct(request.params.id);
  const etag = createHash('md5').update(JSON.stringify(product)).digest('hex');

  // 클라이언트가 보낸 ETag과 비교
  if (request.headers['if-none-match'] === `"${etag}"`) {
    return reply.status(304).send(); // Not Modified
  }

  reply
    .header('ETag', `"${etag}"`)
    .header('Cache-Control', 'private, max-age=0, must-revalidate')
    .send(product);
});
```

### Cache-Control

```typescript
// 정적 데이터 — 오래 캐싱
app.get('/api/countries', async (request, reply) => {
  const countries = await getCountries();
  reply
    .header('Cache-Control', 'public, max-age=86400, s-maxage=86400') // 24h
    .send(countries);
});

// 사용자별 데이터 — 캐싱 제한
app.get('/api/me/profile', async (request, reply) => {
  const profile = await getProfile(request.userId);
  reply
    .header('Cache-Control', 'private, max-age=60') // 1분
    .send(profile);
});

// 민감 데이터 — 캐싱 금지
app.get('/api/me/payment-methods', async (request, reply) => {
  const methods = await getPaymentMethods(request.userId);
  reply
    .header('Cache-Control', 'no-store')
    .send(methods);
});
```

## 실무 가이드라인

| 데이터 특성      | 캐싱 전략                            | TTL                       |
| ----------- | -------------------------------- | ------------------------- |
| 자주 안 바뀌는 설정 | Cache-aside + 긴 TTL              | 1시간~24시간                 |
| 사용자 프로필     | Cache-aside + event invalidation | 5~10분                    |
| 피드/리스트      | SWR 패턴                           | 1~5분                     |
| 카운터 (조회수 등) | Write-behind                     | 실시간 Redis, 5~30초 DB sync |
| 세션 데이터      | Redis 직접 저장                      | 세션 수명                     |

### 주의사항

1. **Cache invalidation is hard**: 의심스러우면 TTL을 짧게 잡아라
2. **Thundering herd**: 인기 키는 mutex lock 또는 SWR 패턴 사용
3. **Serialization 비용**: 큰 객체는 캐싱 전에 필요한 필드만 추출
4. **메모리 관리**: L1 캐시는 반드시 LRU + max size 제한
5. **모니터링**: hit rate, miss rate, eviction rate 추적

---

## Related

- [database.md](database.md) — Transaction·Isolation (캐시 무효화와 일관성)
- [performance.md](performance.md) — 캐시 히트율·메모리 사용량 프로파일링
- [distributed-systems.md](distributed-systems.md) — 분산 캐시·Idempotency
- [postgresql.md](postgresql.md) — Query 결과 캐싱 대상
