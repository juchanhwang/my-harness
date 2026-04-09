# Distributed Systems

## 목차

1. [CAP Theorem](#cap-theorem)
2. [Consensus 패턴](#consensus-패턴)
3. [Idempotency 설계](#idempotency-설계)
4. [Distributed Locks](#distributed-locks)
5. [Leader Election 패턴](#leader-election-패턴)
6. [실무 가이드라인](#실무-가이드라인)

## CAP Theorem

분산 시스템에서 Consistency, Availability, Partition Tolerance 세 가지를 동시에 만족할 수 없다.

| 선택 | 특성           | 사용 사례                                          |
| -- | ------------ | ---------------------------------------------- |
| CP | 일관성 + 파티션 허용 | 주문 처리, 재고 관리 (PostgreSQL, MongoDB w/ majority) |
| AP | 가용성 + 파티션 허용 | SNS 피드, 좋아요 수 (Cassandra, DynamoDB)            |

### Eventual Consistency

강한 일관성(strong consistency)이 필요하지 않은 경우, 최종 일관성을 선택하여 성능과 가용성을 확보한다.

```typescript
// 예: 좋아요 수는 eventually consistent하게 처리
// 실시간 정확도보다 응답 속도가 중요
class LikeService {
  async addLike(postId: string, userId: string) {
    // 1. Redis에 즉시 반영 (빠른 응답)
    await redis.sadd(`post:${postId}:likes`, userId);
    await redis.incr(`post:${postId}:like_count`);

    // 2. DB에 비동기 반영 (eventual consistency)
    await queue.add('sync-like', { postId, userId });
  }

  async getLikeCount(postId: string): Promise<number> {
    // Redis에서 읽기 (DB와 약간 차이 가능)
    return await redis.get(`post:${postId}:like_count`) ?? 0;
  }
}
```

## Consensus 패턴

### Raft

분산 시스템에서 리더 선출과 로그 복제를 위한 합의 알고리즘.

* **Leader**: 클라이언트 요청을 받아 로그 엔트리를 생성, follower에 복제
* **Follower**: leader의 로그를 수신하고 복제
* **Candidate**: leader가 죽으면 follower가 candidate로 전환, 투표 시작

핵심 흐름:

1. Leader가 heartbeat를 보냄
2. Heartbeat timeout → follower가 candidate로 전환
3. 과반수 투표 확보 → 새 leader 선출
4. Leader가 로그 엔트리를 과반수에 복제 → commit

### Paxos

더 이론적이고 범용적인 합의 알고리즘. Proposer, Acceptor, Learner 역할. 실무에서는 Raft가 더 이해하기 쉽고 구현이 명확해서 선호됨 (etcd, Consul 등이 Raft 사용).

> Service discovery 구현 패턴(Consul, Eureka, DNS-based, Kubernetes Service)은 [microservices.md](microservices.md#service-discovery) 참조. etcd/Consul은 합의 알고리즘(Raft) 위에 동작하는 service registry로 활용된다.

## Idempotency 설계

멱등성은 동일한 요청을 여러 번 보내도 결과가 같은 것을 보장한다. 네트워크 재시도, 중복 요청에 필수.

### Idempotency Key 패턴

```typescript
import { eq } from 'drizzle-orm';
import { db } from './db';
import { idempotencyKeys, payments } from './schema';

interface IdempotencyRecord {
  key: string;
  statusCode: number;
  responseBody: string;
  createdAt: Date;
}

async function processPayment(
  idempotencyKey: string,
  payload: PaymentRequest
): Promise<PaymentResponse> {
  // 1. 이미 처리된 요청인지 확인
  const existing = await db.query.idempotencyKeys.findFirst({
    where: eq(idempotencyKeys.key, idempotencyKey),
  });

  if (existing) {
    // 이전 응답을 그대로 반환
    return JSON.parse(existing.responseBody);
  }

  // 2. 트랜잭션으로 처리 + idempotency key 저장
  const result = await db.transaction(async (tx) => {
    // 결제 처리
    const payment = await tx.insert(payments).values({
      amount: payload.amount,
      userId: payload.userId,
      status: 'completed',
    }).returning();

    // idempotency key 저장
    const response = { paymentId: payment[0].id, status: 'completed' };
    await tx.insert(idempotencyKeys).values({
      key: idempotencyKey,
      statusCode: 200,
      responseBody: JSON.stringify(response),
    });

    return response;
  });

  return result;
}

// Fastify route
app.post('/api/payments', async (request, reply) => {
  const idempotencyKey = request.headers['idempotency-key'] as string;
  if (!idempotencyKey) {
    return reply.status(400).send({ error: 'Idempotency-Key header required' });
  }

  const result = await processPayment(idempotencyKey, request.body);
  return reply.send(result);
});
```

### DB 스키마

```sql
CREATE TABLE idempotency_keys (
  key VARCHAR(255) PRIMARY KEY,
  status_code INTEGER NOT NULL,
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- 오래된 키는 주기적으로 삭제 (24~72시간 보관)
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours'
);

CREATE INDEX idx_idempotency_expires ON idempotency_keys(expires_at);
```

## Distributed Locks

여러 프로세스/서버에서 동시에 접근하면 안 되는 자원을 보호한다.

### Redis SETNX (단일 Redis 인스턴스)

```typescript
import Redis from 'ioredis';

const redis = new Redis();

class DistributedLock {
  private readonly prefix = 'lock:';

  async acquire(
    resource: string,
    ttlMs: number = 10000
  ): Promise<string | null> {
    const token = crypto.randomUUID();
    const key = `${this.prefix}${resource}`;

    // SET NX EX — 키가 없을 때만 설정
    const result = await redis.set(key, token, 'PX', ttlMs, 'NX');

    return result === 'OK' ? token : null;
  }

  async release(resource: string, token: string): Promise<boolean> {
    const key = `${this.prefix}${resource}`;

    // Lua script로 atomic하게 확인 + 삭제
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    const result = await redis.eval(script, 1, key, token);
    return result === 1;
  }

  async withLock<T>(
    resource: string,
    fn: () => Promise<T>,
    ttlMs: number = 10000
  ): Promise<T> {
    const token = await this.acquire(resource, ttlMs);
    if (!token) {
      throw new Error(`Failed to acquire lock for ${resource}`);
    }

    try {
      return await fn();
    } finally {
      await this.release(resource, token);
    }
  }
}

// 사용 예: 동시에 하나의 주문만 처리
const lock = new DistributedLock();

async function processOrder(orderId: string) {
  await lock.withLock(`order:${orderId}`, async () => {
    const order = await db.query.orders.findFirst({
      where: eq(orders.id, orderId),
    });

    if (order?.status !== 'pending') return;

    await db.update(orders)
      .set({ status: 'processing' })
      .where(eq(orders.id, orderId));

    await fulfillOrder(order);
  });
}
```

### Redlock (다중 Redis 인스턴스)

단일 Redis가 SPOF가 될 수 있으므로, 3~5개의 독립 Redis 인스턴스에 대해 과반수 이상 lock을 획득해야 한다.

```typescript
import Redlock from 'redlock';
import Redis from 'ioredis';

const redisInstances = [
  new Redis({ host: 'redis-1', port: 6379 }),
  new Redis({ host: 'redis-2', port: 6379 }),
  new Redis({ host: 'redis-3', port: 6379 }),
];

const redlock = new Redlock(redisInstances, {
  driftFactor: 0.01,
  retryCount: 3,
  retryDelay: 200,
  retryJitter: 100,
});

async function criticalSection(resourceId: string) {
  const lock = await redlock.acquire([`lock:${resourceId}`], 10000);

  try {
    // critical section
    await doWork(resourceId);
  } finally {
    await lock.release();
  }
}
```

> **주의**: Martin Kleppmann의 Redlock 비판 — clock drift, GC pause 등으로 lock이 깨질 수 있다. 정말 critical한 경우에는 fencing token과 함께 사용하거나, DB 레벨 lock을 병행하라.

## Leader Election 패턴

여러 인스턴스 중 하나만 특정 작업(cron, migration 등)을 수행해야 할 때.

### Redis 기반 Leader Election

```typescript
class LeaderElection {
  private readonly key: string;
  private readonly instanceId: string;
  private readonly ttlMs: number;
  private renewInterval: NodeJS.Timeout | null = null;

  constructor(key: string, ttlMs: number = 30000) {
    this.key = `leader:${key}`;
    this.instanceId = crypto.randomUUID();
    this.ttlMs = ttlMs;
  }

  async tryBecomeLeader(): Promise<boolean> {
    const result = await redis.set(
      this.key,
      this.instanceId,
      'PX', this.ttlMs,
      'NX'
    );
    return result === 'OK';
  }

  async startLeaderLoop(onLeader: () => Promise<void>) {
    const isLeader = await this.tryBecomeLeader();

    if (isLeader) {
      // TTL의 1/3 간격으로 갱신
      this.renewInterval = setInterval(async () => {
        const script = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("pexpire", KEYS[1], ARGV[2])
          else
            return 0
          end
        `;
        const renewed = await redis.eval(
          script, 1, this.key, this.instanceId, this.ttlMs
        );
        if (!renewed) {
          clearInterval(this.renewInterval!);
        }
      }, this.ttlMs / 3);

      await onLeader();
    }
  }

  async resign() {
    if (this.renewInterval) clearInterval(this.renewInterval);
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      end
    `;
    await redis.eval(script, 1, this.key, this.instanceId);
  }
}

// 사용: 하나의 인스턴스만 cron 실행
const election = new LeaderElection('cron-scheduler');

election.startLeaderLoop(async () => {
  console.log('I am the leader, running scheduled tasks');
  await runScheduledTasks();
});

// Graceful shutdown 시
process.on('SIGTERM', () => election.resign());
```

## 실무 가이드라인

### 언제 분산 시스템 패턴을 적용하는가

1. **단일 서버로 충분한가?** → 충분하면 쓰지 마라. 복잡성만 증가.
2. **Idempotency**: 결제, 주문 등 부작용이 있는 모든 API에 기본 적용
3. **Distributed Lock**: DB lock으로 충분하면 DB lock을 써라. Redis lock은 DB 외부 자원 보호 시
4. **Leader Election**: 다중 인스턴스에서 단일 실행이 필요한 cron, batch job에만
5. **Consensus**: 직접 구현하지 마라. etcd, Consul 등 검증된 솔루션 사용

### 분산 시스템 설계 원칙

* **Fail gracefully**: 부분 실패를 전제로 설계
* **Idempotency first**: 모든 상태 변경 API는 멱등하게
* **Timeout everywhere**: 모든 외부 호출에 timeout 설정
* **Observe everything**: 분산 환경에서는 관찰 가능성이 생명
* **Simple > Clever**: 간단한 해결책이 유지보수 가능한 해결책

---

## Related

- [microservices.md](microservices.md) — 마이크로서비스 통신·Service Discovery
- [message-queues.md](message-queues.md) — 이벤트 기반 통신·Saga orchestration
- [resilience.md](resilience.md) — Circuit Breaker·Retry
- [caching.md](caching.md) — 분산 캐시 일관성
