# Concurrency

## 목차

1. [Race Condition 패턴 & 방지](#race-condition-패턴--방지)
2. [Optimistic vs Pessimistic Locking](#optimistic-vs-pessimistic-locking)
3. [PostgreSQL Advisory Locks](#postgresql-advisory-locks)
4. [Mutex & Semaphore (Node.js)](#mutex--semaphore-nodejs)
5. [Deadlock Detection & Prevention](#deadlock-detection--prevention)
6. [실무 가이드라인](#실무-가이드라인)

## Race Condition 패턴 & 방지

### 전형적 Race Condition: Check-then-Act

```typescript
// ❌ Race condition: 두 요청이 동시에 check을 통과할 수 있음
async function withdrawBalance(userId: string, amount: number) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (user!.balance >= amount) {
    // 이 사이에 다른 요청이 balance를 변경할 수 있음
    await db.update(users)
      .set({ balance: user!.balance - amount })
      .where(eq(users.id, userId));
  }
}

// ✅ Atomic update로 해결
async function withdrawBalanceSafe(userId: string, amount: number) {
  const result = await db.update(users)
    .set({ balance: sql`balance - ${amount}` })
    .where(
      and(
        eq(users.id, userId),
        gte(users.balance, amount) // WHERE 조건으로 체크
      )
    )
    .returning();

  if (result.length === 0) {
    throw new Error('Insufficient balance');
  }
  return result[0];
}
```

### Read-Modify-Write Race

```typescript
// ❌ Race: 두 요청이 같은 counter 값을 읽고 각각 +1
async function incrementCounter(key: string) {
  const record = await db.query.counters.findFirst({ where: eq(counters.key, key) });
  await db.update(counters)
    .set({ value: record!.value + 1 })
    .where(eq(counters.key, key));
}

// ✅ DB atomic operation
async function incrementCounterSafe(key: string) {
  await db.update(counters)
    .set({ value: sql`value + 1` })
    .where(eq(counters.key, key));
}

// ✅ Redis atomic operation
await redis.incr('counter:page_views');
await redis.hincrby('user:123', 'login_count', 1);
```

## Optimistic vs Pessimistic Locking

### Optimistic Locking (version/timestamp 기반)

충돌이 드문 경우에 적합. Lock을 잡지 않고, 커밋 시 충돌을 감지.

```typescript
// 스키마에 version 컬럼 추가
// version INTEGER NOT NULL DEFAULT 1

async function updateProduct(
  productId: string,
  data: UpdateProductInput,
  expectedVersion: number
) {
  const result = await db.update(products)
    .set({
      ...data,
      version: expectedVersion + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(products.id, productId),
        eq(products.version, expectedVersion) // 버전 확인
      )
    )
    .returning();

  if (result.length === 0) {
    throw new ConflictError(
      'Product was modified by another request. Please retry.'
    );
  }

  return result[0];
}

// 재시도 로직
async function updateProductWithRetry(
  productId: string,
  updater: (product: Product) => UpdateProductInput,
  maxRetries: number = 3
) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const product = await db.query.products.findFirst({
      where: eq(products.id, productId),
    });

    if (!product) throw new NotFoundError('Product not found');

    try {
      return await updateProduct(productId, updater(product), product.version);
    } catch (err) {
      if (err instanceof ConflictError && attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}
```

### Pessimistic Locking (SELECT FOR UPDATE)

충돌이 빈번한 경우에 적합. Row-level lock을 명시적으로 잡음.

```typescript
// PostgreSQL SELECT FOR UPDATE
async function transferMoney(
  fromUserId: string,
  toUserId: string,
  amount: number
) {
  await db.transaction(async (tx) => {
    // 두 계좌를 ID 순으로 lock (deadlock 방지)
    const [id1, id2] = [fromUserId, toUserId].sort();

    const accounts = await tx.execute(sql`
      SELECT * FROM accounts
      WHERE user_id IN (${id1}, ${id2})
      ORDER BY user_id
      FOR UPDATE
    `);

    const fromAccount = accounts.rows.find(a => a.user_id === fromUserId);
    const toAccount = accounts.rows.find(a => a.user_id === toUserId);

    if (!fromAccount || !toAccount) throw new NotFoundError('Account not found');
    if (fromAccount.balance < amount) throw new Error('Insufficient balance');

    await tx.execute(sql`
      UPDATE accounts SET balance = balance - ${amount}
      WHERE user_id = ${fromUserId}
    `);
    await tx.execute(sql`
      UPDATE accounts SET balance = balance + ${amount}
      WHERE user_id = ${toUserId}
    `);
  });
}
```

### FOR UPDATE 변형

```sql
-- FOR UPDATE: 행을 lock, 다른 트랜잭션은 대기
SELECT * FROM orders WHERE id = '123' FOR UPDATE;

-- FOR UPDATE NOWAIT: lock 획득 실패 시 즉시 에러
SELECT * FROM orders WHERE id = '123' FOR UPDATE NOWAIT;

-- FOR UPDATE SKIP LOCKED: lock된 행은 건너뜀 (job queue 패턴)
SELECT * FROM tasks
WHERE status = 'pending'
ORDER BY created_at
LIMIT 1
FOR UPDATE SKIP LOCKED;

-- FOR SHARE: 읽기 lock (다른 트랜잭션도 읽기 가능, 쓰기는 대기)
SELECT * FROM products WHERE id = '123' FOR SHARE;
```

## PostgreSQL Advisory Locks

테이블/행이 아닌 **임의의 리소스**에 대해 lock을 잡는 기능.

```typescript
// Advisory lock으로 job 중복 실행 방지
async function runExclusiveJob(jobName: string, fn: () => Promise<void>) {
  // 문자열을 정수 lock key로 변환
  const lockKey = hashStringToInt(jobName);

  await db.transaction(async (tx) => {
    // try_advisory_xact_lock: 트랜잭션 종료 시 자동 해제
    const [{ locked }] = await tx.execute(
      sql`SELECT pg_try_advisory_xact_lock(${lockKey}) as locked`
    );

    if (!locked) {
      console.log(`Job ${jobName} is already running, skipping`);
      return;
    }

    await fn();
  });
}

// Session-level advisory lock (트랜잭션 밖에서도 유지)
async function acquireSessionLock(lockKey: number): Promise<boolean> {
  const [{ locked }] = await db.execute(
    sql`SELECT pg_try_advisory_lock(${lockKey}) as locked`
  );
  return locked;
}

async function releaseSessionLock(lockKey: number): Promise<void> {
  await db.execute(sql`SELECT pg_advisory_unlock(${lockKey})`);
}

function hashStringToInt(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0; // 32bit integer
  }
  return Math.abs(hash);
}
```

## Mutex & Semaphore (Node.js)

Node.js는 single-threaded지만, async 작업 간 순서 보장이 필요한 경우.

### Async Mutex

```typescript
class AsyncMutex {
  private locked = false;
  private waitQueue: Array<() => void> = [];

  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }

    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  release(): void {
    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift()!;
      next(); // 다음 대기자에게 lock 전달
    } else {
      this.locked = false;
    }
  }

  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

// 사용: 같은 사용자의 동시 요청 직렬화
const userMutexes = new Map<string, AsyncMutex>();

function getUserMutex(userId: string): AsyncMutex {
  if (!userMutexes.has(userId)) {
    userMutexes.set(userId, new AsyncMutex());
  }
  return userMutexes.get(userId)!;
}

app.post('/api/transfer', async (request, reply) => {
  const { userId } = request.body;
  const mutex = getUserMutex(userId);

  const result = await mutex.withLock(async () => {
    return await processTransfer(request.body);
  });

  return reply.send(result);
});
```

### Async Semaphore

동시 실행 수를 제한.

```typescript
class AsyncSemaphore {
  private permits: number;
  private waitQueue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  release(): void {
    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift()!;
      next();
    } else {
      this.permits++;
    }
  }

  async withPermit<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

// 사용: 외부 API 동시 호출 수 제한
const apiSemaphore = new AsyncSemaphore(10); // 최대 10개 동시 요청

async function callExternalApi(data: unknown) {
  return apiSemaphore.withPermit(async () => {
    return await fetch('https://external-api.com/endpoint', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  });
}

// 100개 요청을 10개씩 동시 처리
const results = await Promise.all(
  items.map(item => callExternalApi(item))
);
```

## Deadlock Detection & Prevention

### Deadlock 시나리오

```
Transaction A: lock row 1 → try lock row 2 (wait)
Transaction B: lock row 2 → try lock row 1 (wait)
→ 서로 영원히 대기 = Deadlock
```

### 방지 전략

1. **일관된 lock 순서**: 항상 같은 순서로 리소스를 lock

```typescript
// ✅ ID 순으로 정렬 후 lock
async function transfer(userA: string, userB: string, amount: number) {
  const [first, second] = [userA, userB].sort();
  // first → second 순서로 항상 lock
}
```

2. **Lock timeout 설정**

```sql
-- PostgreSQL lock timeout
SET lock_timeout = '5s';
-- 또는 statement_timeout
SET statement_timeout = '30s';
```

3. **NOWAIT / SKIP LOCKED 사용**

```sql
-- 즉시 실패하거나 건너뛰기
SELECT * FROM tasks FOR UPDATE NOWAIT;
SELECT * FROM tasks FOR UPDATE SKIP LOCKED;
```

4. **PostgreSQL deadlock detection**: PostgreSQL은 자동으로 deadlock을 감지하고 한 트랜잭션을 abort함 (기본 1초 `deadlock_timeout`)

## 실무 가이드라인

| 상황                  | 추천 전략                                       |
| ------------------- | ------------------------------------------- |
| 충돌 드문 경우 (일반 CRUD)  | Optimistic locking (version)                |
| 충돌 빈번 (잔액, 재고)      | Pessimistic locking (SELECT FOR UPDATE)     |
| 단순 증감 연산            | Atomic SQL update (`SET value = value + 1`) |
| 프로세스 간 배타 실행        | Advisory locks 또는 Redis distributed lock    |
| 같은 프로세스 내 async 직렬화 | AsyncMutex                                  |
| 동시 실행 수 제한          | AsyncSemaphore                              |
| Job queue (하나만 처리)  | SELECT FOR UPDATE SKIP LOCKED               |

### 원칙

1. **가능하면 lock을 피하라**: atomic operation으로 충분한 경우가 많다
2. **Lock 범위를 최소화**: 트랜잭션을 짧게, lock 시간을 최소로
3. **Lock 순서를 일관되게**: deadlock 방지의 가장 효과적인 방법
4. **Timeout 항상 설정**: 무한 대기는 서비스 장애로 이어짐
5. **모니터링**: `pg_stat_activity`에서 `wait_event_type = 'Lock'` 확인

---

## Related

- [nodejs-internals.md](nodejs-internals.md) — Event Loop·Worker Threads 내부 동작
- [performance.md](performance.md) — 병목 진단·CPU 프로파일링
- [message-queues.md](message-queues.md) — 비동기 작업 큐·consumer concurrency
- [resilience.md](resilience.md) — 동시성 제어·timeout·graceful shutdown
