# Message Queues

## 목차

1. [Event-Driven Architecture 기본](#event-driven-architecture-기본)
2. [BullMQ Job Queue](#bullmq-job-queue)
3. [Redis Streams & Pub/Sub](#redis-streams--pubsub)
4. [Saga Pattern](#saga-pattern)
5. [Outbox Pattern (Transactional Outbox)](#outbox-pattern-transactional-outbox)
6. [Dead Letter Queue (DLQ)](#dead-letter-queue-dlq)
7. [실무 가이드라인](#실무-가이드라인)

## Event-Driven Architecture 기본

이벤트 기반 아키텍처는 서비스 간 결합도를 낮추고, 비동기 처리를 통해 확장성을 확보한다.

### 핵심 개념

* **Event**: 시스템에서 발생한 사실 (과거형: `OrderCreated`, `PaymentCompleted`)
* **Producer**: 이벤트를 발행하는 주체
* **Consumer**: 이벤트를 구독하고 처리하는 주체
* **Broker**: 이벤트를 중개하는 시스템 (Redis, RabbitMQ, Kafka)

```typescript
// 이벤트 타입 정의
interface DomainEvent<T = unknown> {
  id: string;
  type: string;
  data: T;
  timestamp: Date;
  metadata: {
    correlationId: string;
    causationId?: string;
    userId?: string;
  };
}

interface OrderCreatedEvent extends DomainEvent<{
  orderId: string;
  userId: string;
  items: Array<{ productId: string; quantity: number; price: number }>;
  totalAmount: number;
}> {
  type: 'order.created';
}
```

## BullMQ Job Queue

BullMQ는 Redis 기반 Node.js job queue로, 안정적인 비동기 작업 처리에 적합하다.

### 기본 패턴

```typescript
import { Queue, Worker, QueueEvents } from 'bullmq';
import Redis from 'ioredis';

const connection = new Redis({ host: 'localhost', port: 6379, maxRetriesPerRequest: null });

// Queue 생성
const emailQueue = new Queue('email', { connection });
const paymentQueue = new Queue('payment', { connection });

// Job 추가
await emailQueue.add(
  'welcome-email',  // job name
  {                  // job data
    to: 'user@example.com',
    template: 'welcome',
    variables: { name: 'Abel' },
  },
  {                  // job options
    delay: 5000,              // 5초 후 실행
    attempts: 3,              // 최대 3회 시도
    backoff: {
      type: 'exponential',
      delay: 2000,            // 2s, 4s, 8s
    },
    removeOnComplete: { age: 3600 },   // 완료 후 1시간 보관
    removeOnFail: { age: 86400 * 7 },  // 실패 시 7일 보관
  }
);

// Worker 생성
const emailWorker = new Worker(
  'email',
  async (job) => {
    console.log(`Processing ${job.name} [${job.id}]`, job.data);

    switch (job.name) {
      case 'welcome-email':
        await sendEmail(job.data);
        break;
      case 'password-reset':
        await sendPasswordResetEmail(job.data);
        break;
    }
  },
  {
    connection,
    concurrency: 5,        // 동시 처리 수
    limiter: {
      max: 100,            // 최대 100개
      duration: 60000,     // 1분당
    },
  }
);

// 이벤트 핸들링
emailWorker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

emailWorker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
});
```

### 반복 작업 (Cron)

```typescript
// 매일 자정에 실행
await reportQueue.add(
  'daily-report',
  {},
  {
    repeat: {
      pattern: '0 0 * * *', // cron expression
      tz: 'Asia/Seoul',
    },
  }
);

// 5분마다 실행
await healthQueue.add(
  'health-check',
  {},
  { repeat: { every: 300000 } }
);
```

### Flow (의존 관계가 있는 Job)

```typescript
import { FlowProducer } from 'bullmq';

const flowProducer = new FlowProducer({ connection });

await flowProducer.add({
  name: 'send-invoice',
  queueName: 'notification',
  data: { orderId: '123' },
  children: [
    {
      name: 'generate-pdf',
      queueName: 'document',
      data: { orderId: '123' },
    },
    {
      name: 'calculate-tax',
      queueName: 'billing',
      data: { orderId: '123' },
    },
  ],
});
// children이 모두 완료된 후 parent job 실행
```

## Redis Streams & Pub/Sub

### Pub/Sub (간단한 실시간 메시징)

```typescript
// Publisher
const pub = new Redis();
await pub.publish('notifications', JSON.stringify({
  type: 'order.created',
  data: { orderId: '123' },
}));

// Subscriber
const sub = new Redis();
sub.subscribe('notifications');
sub.on('message', (channel, message) => {
  const event = JSON.parse(message);
  console.log(`[${channel}]`, event);
});
```

> **주의**: Pub/Sub은 메시지를 저장하지 않는다. 구독자가 없으면 메시지 유실. 신뢰성이 필요하면 Streams 사용.

### Redis Streams (내구성 있는 이벤트 스트림)

```typescript
// Producer
await redis.xadd(
  'stream:orders',
  '*',  // auto-generate ID
  'type', 'order.created',
  'data', JSON.stringify({ orderId: '123', amount: 50000 })
);

// Consumer Group 생성
await redis.xgroup('CREATE', 'stream:orders', 'payment-service', '0', 'MKSTREAM');

// Consumer (Consumer Group으로 읽기)
async function consumeStream() {
  while (true) {
    const results = await redis.xreadgroup(
      'GROUP', 'payment-service', 'consumer-1',
      'COUNT', 10,
      'BLOCK', 5000,  // 5초 대기
      'STREAMS', 'stream:orders', '>'
    );

    if (!results) continue;

    for (const [stream, messages] of results) {
      for (const [id, fields] of messages) {
        try {
          const type = fields[fields.indexOf('type') + 1];
          const data = JSON.parse(fields[fields.indexOf('data') + 1]);

          await processEvent(type, data);

          // 처리 완료 확인 (ACK)
          await redis.xack('stream:orders', 'payment-service', id);
        } catch (err) {
          console.error(`Failed to process message ${id}:`, err);
          // ACK 안 하면 pending으로 남아서 재처리 가능
        }
      }
    }
  }
}
```

## Saga Pattern

분산 트랜잭션을 여러 로컬 트랜잭션의 연쇄로 구현하는 패턴.

### Choreography (이벤트 기반)

각 서비스가 이벤트를 발행하고, 다른 서비스가 반응. 중앙 조정자 없음.

```
OrderService → OrderCreated
  → PaymentService (listens) → PaymentCompleted
    → InventoryService (listens) → InventoryReserved
      → NotificationService (listens) → EmailSent

실패 시 보상 이벤트:
PaymentService → PaymentFailed
  → OrderService (listens) → OrderCancelled
```

**장점**: 서비스 간 결합도 낮음
**단점**: 플로우 추적 어려움, 디버깅 복잡

### Orchestration (중앙 조정)

Saga Orchestrator가 전체 흐름을 제어.

```typescript
class OrderSaga {
  private steps: SagaStep[] = [
    {
      name: 'reserve-inventory',
      execute: (ctx) => inventoryService.reserve(ctx.items),
      compensate: (ctx) => inventoryService.release(ctx.items),
    },
    {
      name: 'process-payment',
      execute: (ctx) => paymentService.charge(ctx.userId, ctx.amount),
      compensate: (ctx) => paymentService.refund(ctx.paymentId),
    },
    {
      name: 'create-shipment',
      execute: (ctx) => shipmentService.create(ctx.orderId),
      compensate: (ctx) => shipmentService.cancel(ctx.shipmentId),
    },
  ];

  async execute(context: OrderContext): Promise<void> {
    const completedSteps: SagaStep[] = [];

    for (const step of this.steps) {
      try {
        const result = await step.execute(context);
        Object.assign(context, result);
        completedSteps.push(step);
      } catch (error) {
        console.error(`Saga step "${step.name}" failed:`, error);

        // 보상 트랜잭션 실행 (역순)
        for (const completed of completedSteps.reverse()) {
          try {
            await completed.compensate(context);
          } catch (compError) {
            console.error(
              `Compensation "${completed.name}" failed:`, compError
            );
            // 보상 실패는 수동 개입 필요 → alert 발송
            await alertOps(completed.name, compError);
          }
        }

        throw new SagaError(`Saga failed at step: ${step.name}`, error);
      }
    }
  }
}
```

**장점**: 플로우 명확, 디버깅 쉬움
**단점**: Orchestrator가 단일 장애점이 될 수 있음

## Outbox Pattern (Transactional Outbox)

DB 트랜잭션과 이벤트 발행의 원자성을 보장한다. "DB 쓰기는 성공했는데 이벤트 발행 실패" 문제를 해결.

```typescript
// 1. 비즈니스 로직 + outbox 테이블에 이벤트 저장 (같은 트랜잭션)
async function createOrder(data: CreateOrderInput) {
  return db.transaction(async (tx) => {
    const order = await tx.insert(orders).values({
      userId: data.userId,
      status: 'created',
      totalAmount: data.totalAmount,
    }).returning();

    // outbox 테이블에 이벤트 저장
    await tx.insert(outboxEvents).values({
      aggregateType: 'Order',
      aggregateId: order[0].id,
      eventType: 'order.created',
      payload: JSON.stringify({
        orderId: order[0].id,
        userId: data.userId,
        totalAmount: data.totalAmount,
      }),
      status: 'pending',
    });

    return order[0];
  });
}

// 2. Outbox Relay — pending 이벤트를 주기적으로 발행
async function relayOutboxEvents() {
  const events = await db.query.outboxEvents.findMany({
    where: eq(outboxEvents.status, 'pending'),
    orderBy: asc(outboxEvents.createdAt),
    limit: 100,
  });

  for (const event of events) {
    try {
      // 메시지 큐에 발행
      await queue.add(event.eventType, JSON.parse(event.payload));

      // 발행 완료 표시
      await db.update(outboxEvents)
        .set({ status: 'published', publishedAt: new Date() })
        .where(eq(outboxEvents.id, event.id));
    } catch (err) {
      console.error(`Failed to relay event ${event.id}:`, err);
    }
  }
}

// 3. 주기적 실행 (BullMQ repeat 또는 setInterval)
setInterval(relayOutboxEvents, 5000);
```

```sql
-- Outbox 테이블
CREATE TABLE outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type VARCHAR(100) NOT NULL,
  aggregate_id VARCHAR(100) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  retry_count INTEGER DEFAULT 0
);

CREATE INDEX idx_outbox_pending ON outbox_events(status, created_at)
  WHERE status = 'pending';
```

## Dead Letter Queue (DLQ)

최대 재시도 후에도 실패한 메시지를 별도 큐로 이동하여 수동 검토/재처리할 수 있게 한다.

```typescript
// BullMQ에서 DLQ 패턴
const mainWorker = new Worker('orders', async (job) => {
  // 비즈니스 로직
  await processOrder(job.data);
}, {
  connection,
  settings: {
    backoffStrategy: (attemptsMade) => {
      return Math.min(1000 * 2 ** attemptsMade, 30000); // max 30s
    },
  },
});

mainWorker.on('failed', async (job, err) => {
  if (job && job.attemptsMade >= job.opts.attempts!) {
    // 최대 재시도 초과 → DLQ로 이동
    const dlq = new Queue('orders-dlq', { connection });
    await dlq.add('dead-letter', {
      originalJob: job.data,
      error: err.message,
      failedAt: new Date().toISOString(),
      attempts: job.attemptsMade,
    });

    console.error(`Job ${job.id} moved to DLQ after ${job.attemptsMade} attempts`);
  }
});

// DLQ 모니터링 & 재처리
const dlqWorker = new Worker('orders-dlq', async (job) => {
  // 수동 검토를 위해 로깅/알림
  await notifyOps({
    type: 'dlq-entry',
    queue: 'orders',
    data: job.data,
  });
}, { connection });
```

## 실무 가이드라인

| 요구사항                 | 추천 솔루션                                       |
| -------------------- | -------------------------------------------- |
| 간단한 비동기 작업 (이메일, 알림) | BullMQ                                       |
| 이벤트 스트리밍 (로그, 실시간)   | Redis Streams                                |
| 간단한 실시간 메시징 (채팅)     | Redis Pub/Sub                                |
| 대규모 이벤트 스트리밍         | Kafka (BullMQ로 시작 → 스케일 필요 시 전환)             |
| 분산 트랜잭션              | Saga (간단하면 Choreography, 복잡하면 Orchestration) |
| 이벤트 + DB 원자성         | Outbox pattern                               |

### 설계 원칙

1. **At-least-once delivery 가정**: 소비자는 반드시 멱등하게 구현
   > **멱등성 구현**: 소비자는 반드시 멱등해야 한다. Idempotency Key + 트랜잭션 기반 풀 구현은 [distributed-systems.md](distributed-systems.md#idempotency-설계) 참조.
2. **순서 보장이 필요하면**: 파티션/그룹 키 활용 (같은 orderId → 같은 파티션)
3. **DLQ 항상 설정**: 재시도 실패 메시지는 반드시 DLQ로
4. **모니터링**: queue depth, processing time, failure rate 모니터링 필수
5. **Backpressure**: consumer 처리 속도 < producer 속도 → rate limiting 적용

---

## Related

- [distributed-systems.md](distributed-systems.md) — Saga·Idempotency·Event-driven 아키텍처
- [resilience.md](resilience.md) — Worker graceful shutdown·재시도
- [concurrency.md](concurrency.md) — Consumer concurrency·backpressure
- [observability.md](observability.md) — BullMQ 메트릭·worker 로깅
