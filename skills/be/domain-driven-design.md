# Domain-Driven Design

## 목차

1. [핵심 개념](#핵심-개념)
2. [Tactical Patterns](#tactical-patterns)
3. [Anti-Corruption Layer (ACL)](#anti-corruption-layer-acl)
4. [Repository Pattern (DDD 관점)](#repository-pattern-ddd-관점)
5. [Hexagonal Architecture (Ports & Adapters)](#hexagonal-architecture-ports--adapters)
6. [실무 적용 가이드](#실무-적용-가이드)

## 핵심 개념

### Ubiquitous Language (보편 언어)

도메인 전문가와 개발자가 **같은 용어**를 사용한다. 코드, 문서, 대화 모두 동일한 언어.

```typescript
// ❌ 기술 중심 네이밍
class TransactionProcessor {
  async processRecord(data: Record<string, unknown>) { ... }
}

// ✅ 도메인 중심 네이밍
class PaymentService {
  async chargeCustomer(payment: Payment): Promise<PaymentResult> { ... }
}
```

### Bounded Context (경계 컨텍스트)

같은 단어가 다른 맥락에서 다른 의미를 가질 수 있다. 각 컨텍스트는 자체 모델을 가진다.

```
"Account"의 의미:
- 결제 컨텍스트: 결제 수단, 잔액
- 인증 컨텍스트: 로그인 정보, 권한
- 배송 컨텍스트: 배송 주소

각 컨텍스트에서 Account는 별도 모델로 존재
```

## Tactical Patterns

### Entity

고유 식별자로 구분. 시간에 따라 상태가 변함.

```typescript
class Order {
  constructor(
    public readonly id: string,
    private status: OrderStatus,
    private items: OrderItem[],
    private totalAmount: number,
    public readonly createdAt: Date,
  ) {}

  addItem(item: OrderItem): void {
    if (this.status !== 'draft') {
      throw new DomainError('Cannot add items to a non-draft order');
    }
    this.items.push(item);
    this.recalculateTotal();
  }

  confirm(): void {
    if (this.items.length === 0) {
      throw new DomainError('Cannot confirm an empty order');
    }
    this.status = 'confirmed';
  }

  private recalculateTotal(): void {
    this.totalAmount = this.items.reduce(
      (sum, item) => sum + item.price * item.quantity, 0
    );
  }
}
```

### Value Object

식별자 없음. 속성으로 비교. 불변.

```typescript
class Money {
  constructor(
    public readonly amount: number,
    public readonly currency: string,
  ) {
    if (amount < 0) throw new DomainError('Amount cannot be negative');
    if (!['KRW', 'USD', 'EUR'].includes(currency)) {
      throw new DomainError(`Unsupported currency: ${currency}`);
    }
  }

  add(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new DomainError('Cannot add different currencies');
    }
    return new Money(this.amount + other.amount, this.currency);
  }

  multiply(factor: number): Money {
    return new Money(Math.round(this.amount * factor), this.currency);
  }

  equals(other: Money): boolean {
    return this.amount === other.amount && this.currency === other.currency;
  }
}

class Address {
  constructor(
    public readonly street: string,
    public readonly city: string,
    public readonly zipCode: string,
    public readonly country: string,
  ) {}

  equals(other: Address): boolean {
    return this.street === other.street
      && this.city === other.city
      && this.zipCode === other.zipCode
      && this.country === other.country;
  }
}
```

### Aggregate

관련 Entity와 Value Object의 클러스터. Aggregate Root를 통해서만 접근.

```typescript
// Order가 Aggregate Root
// OrderItem은 Order를 통해서만 접근/수정

class Order {
  private items: OrderItem[] = [];
  private domainEvents: DomainEvent[] = [];

  static create(userId: string): Order {
    const order = new Order(
      crypto.randomUUID(),
      userId,
      'draft',
      [],
      new Date(),
    );
    order.addDomainEvent({
      type: 'order.created',
      data: { orderId: order.id, userId },
      timestamp: new Date(),
    });
    return order;
  }

  addItem(productId: string, quantity: number, price: Money): void {
    if (this.status !== 'draft') {
      throw new DomainError('Cannot modify a non-draft order');
    }

    const existing = this.items.find(i => i.productId === productId);
    if (existing) {
      existing.updateQuantity(existing.quantity + quantity);
    } else {
      this.items.push(new OrderItem(productId, quantity, price));
    }
  }

  removeItem(productId: string): void {
    this.items = this.items.filter(i => i.productId !== productId);
  }

  submit(): void {
    if (this.items.length === 0) {
      throw new DomainError('Cannot submit empty order');
    }
    this.status = 'submitted';
    this.addDomainEvent({
      type: 'order.submitted',
      data: {
        orderId: this.id,
        totalAmount: this.calculateTotal(),
        itemCount: this.items.length,
      },
      timestamp: new Date(),
    });
  }

  private addDomainEvent(event: DomainEvent): void {
    this.domainEvents.push(event);
  }

  pullDomainEvents(): DomainEvent[] {
    const events = [...this.domainEvents];
    this.domainEvents = [];
    return events;
  }
}
```

### Domain Events

도메인에서 발생한 중요한 사실. 다른 Bounded Context에 전파.

```typescript
interface DomainEvent {
  type: string;
  data: unknown;
  timestamp: Date;
  metadata?: {
    correlationId?: string;
    userId?: string;
  };
}

class DomainEventDispatcher {
  private handlers = new Map<string, Array<(event: DomainEvent) => Promise<void>>>();

  register(eventType: string, handler: (event: DomainEvent) => Promise<void>): void {
    const existing = this.handlers.get(eventType) ?? [];
    existing.push(handler);
    this.handlers.set(eventType, existing);
  }

  async dispatch(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      const handlers = this.handlers.get(event.type) ?? [];
      await Promise.all(handlers.map(h => h(event)));
    }
  }
}

// 사용
const dispatcher = new DomainEventDispatcher();

dispatcher.register('order.submitted', async (event) => {
  await paymentService.initiatePayment(event.data);
});

dispatcher.register('order.submitted', async (event) => {
  await notificationService.sendOrderConfirmation(event.data);
});
```

## Anti-Corruption Layer (ACL)

외부 시스템의 모델이 내부 도메인 모델을 오염시키지 않도록 번역 계층을 둔다.

```typescript
// 외부 결제 API의 응답을 내부 도메인 모델로 변환
class PaymentGatewayAdapter {
  constructor(private readonly client: StripeClient) {}

  async charge(payment: Payment): Promise<PaymentResult> {
    // 내부 모델 → 외부 API 형식으로 변환
    const stripePayload = {
      amount: payment.amount.amount,
      currency: payment.amount.currency.toLowerCase(),
      customer: payment.externalCustomerId,
      metadata: { orderId: payment.orderId },
    };

    const stripeResult = await this.client.charges.create(stripePayload);

    // 외부 API 응답 → 내부 모델로 변환
    return {
      id: stripeResult.id,
      status: this.mapStatus(stripeResult.status),
      amount: new Money(stripeResult.amount, stripeResult.currency.toUpperCase()),
      processedAt: new Date(stripeResult.created * 1000),
    };
  }

  private mapStatus(stripeStatus: string): PaymentStatus {
    const mapping: Record<string, PaymentStatus> = {
      succeeded: 'completed',
      pending: 'processing',
      failed: 'failed',
    };
    return mapping[stripeStatus] ?? 'unknown';
  }
}
```

## Repository Pattern (DDD 관점)

Aggregate의 영속성을 추상화. 컬렉션처럼 사용.

> **트랜잭션 API 동작 원리·격리 수준·lock 사용법**은 [database.md](database.md#6-transaction-isolation-levels)에 정식 정의가 있다. 아래 `save()`는 그 API를 사용하는 호출자 예시일 뿐이다.

```typescript
interface OrderRepository {
  findById(id: string): Promise<Order | null>;
  save(order: Order): Promise<void>;
  delete(id: string): Promise<void>;
  findByUserId(userId: string, options?: PaginationOptions): Promise<Order[]>;
}

class DrizzleOrderRepository implements OrderRepository {
  constructor(
    private readonly db: DrizzleDB,
    private readonly eventDispatcher: DomainEventDispatcher,
  ) {}

  async findById(id: string): Promise<Order | null> {
    const row = await this.db.query.orders.findFirst({
      where: eq(orders.id, id),
      with: { items: true },
    });
    return row ? this.toDomain(row) : null;
  }

  async save(order: Order): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Upsert order
      await tx.insert(orders)
        .values(this.toPersistence(order))
        .onConflictDoUpdate({
          target: orders.id,
          set: this.toPersistence(order),
        });

      // Sync items
      await tx.delete(orderItems).where(eq(orderItems.orderId, order.id));
      const items = order.getItems().map(item => ({
        orderId: order.id,
        productId: item.productId,
        quantity: item.quantity,
        price: item.price.amount,
        currency: item.price.currency,
      }));
      if (items.length > 0) {
        await tx.insert(orderItems).values(items);
      }
    });

    // 도메인 이벤트 발행 (트랜잭션 성공 후)
    const events = order.pullDomainEvents();
    await this.eventDispatcher.dispatch(events);
  }

  private toDomain(row: OrderRow): Order {
    // DB row → Domain model
  }

  private toPersistence(order: Order): OrderRow {
    // Domain model → DB row
  }
}
```

## Hexagonal Architecture (Ports & Adapters)

비즈니스 로직을 인프라에서 분리. 외부 의존성은 Port(인터페이스)로 정의, Adapter로 구현.

```
        ┌──────────────────────────────────────┐
        │            Application               │
        │  ┌────────────────────────────────┐  │
  HTTP ─┤  │        Domain Core             │  ├── PostgreSQL
  gRPC ─┤  │  (Entities, Value Objects,     │  ├── Redis
  CLI  ─┤  │   Services, Domain Events)     │  ├── Stripe API
        │  └────────────────────────────────┘  │
        │    Ports (interfaces)                │
        └──────────────────────────────────────┘
         Adapters        Adapters
         (Driving)       (Driven)
```

```
src/
├── domain/              # 순수 비즈니스 로직 (의존성 없음)
│   ├── entities/
│   ├── value-objects/
│   ├── events/
│   └── services/
├── application/         # Use cases, Ports 정의
│   ├── ports/           # 인터페이스 (Repository, Gateway 등)
│   ├── use-cases/       # 애플리케이션 서비스
│   └── dto/
├── infrastructure/      # Adapters 구현
│   ├── persistence/     # DB 구현체 (Drizzle)
│   ├── messaging/       # 메시지 큐 (BullMQ)
│   ├── external/        # 외부 API (Stripe, SendGrid)
│   └── http/            # HTTP 라우트 (Fastify)
└── config/              # 의존성 주입, 설정
```

## 실무 적용 가이드

### 언제 DDD를 적용하는가

| 프로젝트 특성            | DDD 적용   | 대안           |
| ------------------ | -------- | ------------ |
| 복잡한 비즈니스 규칙        | ✅ 필수     | —            |
| CRUD 위주 (블로그, 관리자) | ❌ 과도     | 간단한 계층 구조    |
| 스타트업 MVP           | ⚠️ 부분 적용 | 핵심 도메인만 DDD  |
| 레거시 마이그레이션         | ✅ 점진적    | ACL로 격리 후 도입 |

### 실무 원칙

1. **도메인 모델에 인프라 의존성 없음**: Entity/VO는 순수 TypeScript
2. **Aggregate는 작게**: 한 트랜잭션 = 한 Aggregate만 수정
3. **Aggregate 간 참조는 ID로**: 직접 객체 참조 금지
4. **도메인 이벤트로 Aggregate 간 통신**: 느슨한 결합
5. **Repository는 Aggregate Root당 하나**: 하위 Entity는 Root를 통해 접근
6. **Ubiquitous Language 유지**: 코드 리뷰에서 네이밍 검증

---

## Related

- [architecture.md](architecture.md) — 레이어 분리·Plugin 경계
- [data-patterns.md](data-patterns.md) — Event Sourcing·CQRS
- [database.md](database.md) — Transaction API·Repository 구현
- [testing.md](testing.md) — Aggregate 단위 테스트
