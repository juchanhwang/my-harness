# Data Patterns

## 목차

1. [CQRS (Command Query Responsibility Segregation)](#cqrs-command-query-responsibility-segregation)
2. [Event Sourcing](#event-sourcing)
3. [Materialized Views (PostgreSQL)](#materialized-views-postgresql)
4. [ETL vs ELT](#etl-vs-elt)
5. [Change Data Capture (CDC)](#change-data-capture-cdc)
6. [실무 가이드라인](#실무-가이드라인)

## CQRS (Command Query Responsibility Segregation)

읽기(Query)와 쓰기(Command)를 분리하여 각각 최적화.

```
Command Side (Write):                Query Side (Read):
┌──────────┐    ┌──────────┐        ┌──────────┐    ┌──────────────┐
│ Command  │───→│ Domain   │        │ Query    │───→│ Read Model   │
│ Handler  │    │ Model    │        │ Handler  │    │ (Optimized)  │
└──────────┘    └─────┬────┘        └──────────┘    └──────┬───────┘
                      │                                     │
                ┌─────▼────┐                          ┌─────▼────┐
                │ Write DB │───── Sync/Event ────────→│ Read DB  │
                └──────────┘                          └──────────┘
```

```typescript
// Command (쓰기) — 비즈니스 규칙 적용
interface CreateOrderCommand {
  userId: string;
  items: Array<{ productId: string; quantity: number }>;
}

class CreateOrderHandler {
  async execute(command: CreateOrderCommand): Promise<string> {
    // 도메인 규칙 검증
    const user = await this.userRepo.findById(command.userId);
    if (!user.isActive) throw new DomainError('Inactive user');

    // Aggregate 생성
    const order = Order.create(command.userId);
    for (const item of command.items) {
      const product = await this.productRepo.findById(item.productId);
      order.addItem(product.id, item.quantity, product.price);
    }

    await this.orderRepo.save(order);
    return order.id;
  }
}

// Query (읽기) — 표현 최적화, 도메인 규칙 없음
interface OrderListQuery {
  userId: string;
  status?: string;
  page: number;
  limit: number;
}

class OrderListHandler {
  async execute(query: OrderListQuery): Promise<OrderListView> {
    // 읽기 전용 뷰에서 직접 조회 (JOIN, 비정규화된 데이터)
    const orders = await db.execute(sql`
      SELECT
        o.id, o.status, o.total_amount,
        o.created_at,
        json_agg(json_build_object(
          'productName', p.name,
          'quantity', oi.quantity,
          'price', oi.price
        )) as items
      FROM order_read_view o
      JOIN order_item_view oi ON oi.order_id = o.id
      JOIN product_view p ON p.id = oi.product_id
      WHERE o.user_id = ${query.userId}
      ${query.status ? sql`AND o.status = ${query.status}` : sql``}
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}
    `);

    return { orders: orders.rows, page: query.page };
  }
}
```

### 언제 CQRS를 적용하는가

* 읽기/쓰기 비율이 극단적으로 다를 때 (읽기 >>> 쓰기)
* 읽기 모델과 쓰기 모델이 매우 다를 때
* 읽기 성능이 중요할 때

> 주의: 단순 CRUD에는 과도함. 복잡한 도메인에서만.

## Event Sourcing

상태를 저장하는 대신 **상태 변경 이벤트**를 순서대로 저장.

> **트랜잭션 API 동작 원리·격리 수준·lock 사용법·pessimistic vs optimistic concurrency 일반 이론**은 [database.md](database.md#6-transaction-isolation-levels)에 정식 정의가 있다. 아래 `EventStore.append()`는 Event Store 고유의 version check 로직을 위해 `db.transaction()` API를 호출자로서 사용한다.

```typescript
// 이벤트 정의
type OrderEvent =
  | { type: 'OrderCreated'; data: { userId: string; createdAt: Date } }
  | { type: 'ItemAdded'; data: { productId: string; quantity: number; price: number } }
  | { type: 'ItemRemoved'; data: { productId: string } }
  | { type: 'OrderSubmitted'; data: { submittedAt: Date } }
  | { type: 'OrderCancelled'; data: { reason: string; cancelledAt: Date } };

// Event Store
class EventStore {
  async append(aggregateId: string, events: OrderEvent[], expectedVersion: number): Promise<void> {
    await db.transaction(async (tx) => {
      // Event Store 고유: version check로 동시 append 충돌 감지
      const [current] = await tx.execute(sql`
        SELECT MAX(version) as version FROM events
        WHERE aggregate_id = ${aggregateId}
      `);

      if ((current.version ?? 0) !== expectedVersion) {
        throw new ConcurrencyError('Aggregate was modified');
      }

      // 이벤트 저장
      for (let i = 0; i < events.length; i++) {
        await tx.insert(eventsTable).values({
          aggregateId,
          version: expectedVersion + i + 1,
          eventType: events[i].type,
          data: JSON.stringify(events[i].data),
          createdAt: new Date(),
        });
      }
    });
  }

  async getEvents(aggregateId: string): Promise<OrderEvent[]> {
    const rows = await db.query.events.findMany({
      where: eq(eventsTable.aggregateId, aggregateId),
      orderBy: asc(eventsTable.version),
    });
    return rows.map(r => ({ type: r.eventType, data: JSON.parse(r.data) }));
  }
}

// Aggregate 복원 (이벤트 리플레이)
class Order {
  private state: OrderState = { status: 'draft', items: [], totalAmount: 0 };

  static fromEvents(events: OrderEvent[]): Order {
    const order = new Order();
    for (const event of events) {
      order.apply(event);
    }
    return order;
  }

  private apply(event: OrderEvent): void {
    switch (event.type) {
      case 'OrderCreated':
        this.state.status = 'draft';
        break;
      case 'ItemAdded':
        this.state.items.push({
          productId: event.data.productId,
          quantity: event.data.quantity,
          price: event.data.price,
        });
        this.recalculate();
        break;
      case 'OrderSubmitted':
        this.state.status = 'submitted';
        break;
      case 'OrderCancelled':
        this.state.status = 'cancelled';
        break;
    }
  }
}
```

### Snapshot 최적화

이벤트가 많아지면 리플레이가 느려짐 → 주기적으로 스냅샷 저장.

```typescript
async function loadAggregate(aggregateId: string): Promise<Order> {
  // 마지막 스냅샷부터 로드
  const snapshot = await db.query.snapshots.findFirst({
    where: eq(snapshots.aggregateId, aggregateId),
    orderBy: desc(snapshots.version),
  });

  const fromVersion = snapshot?.version ?? 0;
  const events = await eventStore.getEventsSince(aggregateId, fromVersion);

  const order = snapshot
    ? Order.fromSnapshot(snapshot.state)
    : new Order();

  for (const event of events) {
    order.apply(event);
  }

  return order;
}

// 매 100 이벤트마다 스냅샷
if (order.version % 100 === 0) {
  await db.insert(snapshots).values({
    aggregateId: order.id,
    version: order.version,
    state: JSON.stringify(order.getState()),
  });
}
```

## Materialized Views (PostgreSQL)

쿼리 결과를 테이블로 저장하여 읽기 성능 최적화.

```sql
-- Materialized View 생성
CREATE MATERIALIZED VIEW order_summary AS
SELECT
  u.id as user_id,
  u.name as user_name,
  COUNT(o.id) as total_orders,
  SUM(o.total_amount) as total_spent,
  MAX(o.created_at) as last_order_at
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
GROUP BY u.id, u.name;

-- 유니크 인덱스 (CONCURRENTLY 갱신에 필요)
CREATE UNIQUE INDEX idx_order_summary_user ON order_summary(user_id);

-- 갱신 (전체 재계산)
REFRESH MATERIALIZED VIEW order_summary;

-- 동시 접근 가능한 갱신 (서비스 중단 없음)
REFRESH MATERIALIZED VIEW CONCURRENTLY order_summary;
```

```typescript
// 주기적 갱신 (BullMQ)
await refreshQueue.add('refresh-views', {}, {
  repeat: { every: 300000 }, // 5분마다
});

const worker = new Worker('refresh-views', async () => {
  await db.execute(sql`
    REFRESH MATERIALIZED VIEW CONCURRENTLY order_summary
  `);
});
```

## ETL vs ELT

|       | ETL                        | ELT                           |
| ----- | -------------------------- | ----------------------------- |
| 순서    | Extract → Transform → Load | Extract → Load → Transform    |
| 변환 위치 | 중간 서버                      | 목적지 DB 내부                     |
| 적합    | 정형 데이터, 레거시 DW             | 클라우드 DW (BigQuery, Snowflake) |
| 장점    | 목적지 부하 적음                  | 원본 데이터 보존, 유연한 변환             |

## Change Data Capture (CDC)

DB 변경사항을 실시간으로 감지하여 다른 시스템에 전파.

### PostgreSQL Logical Replication

```sql
-- Publication 생성 (원본 DB)
CREATE PUBLICATION order_changes FOR TABLE orders, order_items;

-- Subscription 생성 (대상 DB)
CREATE SUBSCRIPTION order_sync
  CONNECTION 'host=source-db dbname=app'
  PUBLICATION order_changes;
```

### WAL 기반 CDC (Debezium 개념)

```typescript
// pg-logical-replication으로 변경 감지
import { LogicalReplicationService, PgoutputPlugin } from 'pg-logical-replication';

const service = new LogicalReplicationService({
  connectionString: 'postgresql://...',
});

const plugin = new PgoutputPlugin({
  protoVersion: 1,
  publicationNames: ['order_changes'],
});

service.on('data', (lsn, log) => {
  if (log.tag === 'insert') {
    console.log('New row:', log.relation.name, log.new);
    // Read model 업데이트, 캐시 무효화 등
  }
  if (log.tag === 'update') {
    console.log('Updated:', log.relation.name, log.new);
  }
  if (log.tag === 'delete') {
    console.log('Deleted:', log.relation.name, log.old);
  }
});

service.subscribe(plugin, 'order_slot');
```

### 간단한 Polling 기반 CDC

```typescript
// updated_at 기반 polling (간단하지만 효과적)
let lastSync = new Date('2024-01-01');

setInterval(async () => {
  const changes = await db.query.orders.findMany({
    where: gt(orders.updatedAt, lastSync),
    orderBy: asc(orders.updatedAt),
  });

  for (const order of changes) {
    await syncToReadModel(order);
    lastSync = order.updatedAt;
  }
}, 5000);
```

## 실무 가이드라인

| 패턴                | 사용 시점           | 주의                    |
| ----------------- | --------------- | --------------------- |
| CQRS              | 읽기/쓰기 모델이 다를 때  | 복잡도 증가, 간단한 CRUD에는 과도 |
| Event Sourcing    | 감사 추적, 시간 여행 필요 | 스냅샷 필수, 스키마 진화 어려움    |
| Materialized View | 복잡한 집계 쿼리 최적화   | 갱신 지연 허용 필요           |
| CDC               | 시스템 간 실시간 동기화   | WAL 기반이 가장 안정적        |

1. **CQRS 없이 Event Sourcing은 없다**: Event Sourcing은 항상 CQRS와 함께
2. **Event Sourcing은 최후의 수단**: 정말 필요한 도메인(감사 추적, 이력 관리)에만
3. **Materialized View로 시작**: CQRS보다 간단, 대부분의 읽기 최적화에 충분
4. **CDC는 Outbox와 함께**: Outbox pattern + CDC = 안정적 이벤트 전파

---

## Related

- [database.md](database.md) — Transaction API·Isolation Level
- [domain-driven-design.md](domain-driven-design.md) — Aggregate·Repository 패턴
- [distributed-systems.md](distributed-systems.md) — Saga·Idempotency·Event Sourcing
- [drizzle-orm.md](drizzle-orm.md) — Drizzle 기반 Event Store 구현
