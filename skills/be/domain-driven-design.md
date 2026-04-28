# Domain-Driven Design

> **기본 방법론**: 모든 BE 구현은 DDD를 기본으로 따른다. 단순 CRUD만으로 충분한 경우 명시적으로 opt-out할 수 있으나, 기본값은 DDD다. 새 기능 구현 시 Entity/Value Object/Aggregate 분리, Repository 추상화, Domain Event 발행을 기본 패턴으로 적용하라.

## 목차

1. [핵심 개념](#핵심-개념)
2. [Tactical Patterns](#tactical-patterns)
3. [Application Service (Use Case)](#application-service-use-case)
4. [Anti-Corruption Layer (ACL)](#anti-corruption-layer-acl)
5. [Repository Pattern (DDD 관점)](#repository-pattern-ddd-관점)
6. [Hexagonal Architecture (Ports & Adapters)](#hexagonal-architecture-ports--adapters)
7. [실무 적용 가이드](#실무-적용-가이드)

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

고유 식별자로 구분. 시간에 따라 상태가 변함. 비즈니스 규칙을 메서드로 캡슐화.

```typescript
class Product {
  constructor(
    public readonly id: string,
    private name: string,
    private price: Money,
    private status: 'active' | 'discontinued',
  ) {}

  updatePrice(newPrice: Money): void {
    if (this.status === 'discontinued') {
      throw new DomainError('Cannot update discontinued product');
    }
    this.price = newPrice;
  }
}
// Aggregate Root도 Entity다. 전체 예시는 아래 Aggregate 절 참고.
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

  subtract(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new DomainError('Cannot subtract different currencies');
    }
    return new Money(this.amount - other.amount, this.currency);
  }

  multiply(factor: number): Money {
    return new Money(Math.round(this.amount * factor), this.currency);
  }

  equals(other: Money): boolean {
    return this.amount === other.amount && this.currency === other.currency;
  }
}
```

### Aggregate

관련 Entity와 Value Object의 클러스터. Aggregate Root를 통해서만 접근. `version` 필드로 낙관적 동시성 제어.

```typescript
// Order가 Aggregate Root
// OrderItem은 Order를 통해서만 접근/수정

class Order {
  private items: OrderItem[] = [];
  private domainEvents: DomainEvent[] = [];
  private version = 0;

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
    if (this.status !== 'draft') {
      throw new DomainError('Cannot modify a non-draft order');
    }
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

  getVersion(): number { return this.version; }
  getItems(): readonly OrderItem[] { return this.items; }

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
// Aggregate별 이벤트를 discriminated union으로 정의 → 타입 안전
type OrderEvent =
  | { type: 'order.created'; data: { orderId: string; userId: string } }
  | { type: 'order.submitted'; data: { orderId: string; totalAmount: number } }
  | { type: 'order.cancelled'; data: { orderId: string; reason: string } };

// Dispatcher 등 범용 코드에서 사용하는 base 인터페이스
interface DomainEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp: Date;
  metadata?: { correlationId?: string; userId?: string };
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

### Domain Service

여러 Aggregate에 걸친 비즈니스 로직. 단일 Entity에 속하지 않는 도메인 규칙을 캡슐화. 인프라 의존성 없이 순수 도메인 객체만 사용.

```typescript
// 주문 금액 계산 시 사용자 등급별 할인 적용 — Order와 User 두 Aggregate 관련
class OrderPricingService {
  calculateTotal(order: Order, userTier: UserTier): Money {
    const subtotal = order.getSubtotal();
    const discountRate = userTier === 'vip' ? 0.1 : userTier === 'premium' ? 0.05 : 0;
    return subtotal.multiply(1 - discountRate);
  }
}
```

> Entity/VO 메서드 vs Domain Service: 로직이 단일 Aggregate 내부에서 완결되면 Entity 메서드. 여러 Aggregate가 관여하면 Domain Service로 분리.

## Application Service (Use Case)

도메인 객체를 조합하여 비즈니스 흐름을 실행. 트랜잭션 경계·인증 확인·이벤트 발행을 조율. **도메인 로직은 포함하지 않는다.**

```typescript
class SubmitOrderUseCase {
  constructor(
    private readonly orderRepo: OrderRepository,
    private readonly userRepo: UserRepository,
    private readonly pricingService: OrderPricingService,
  ) {}

  async execute(orderId: string, userId: string): Promise<void> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) throw new NotFoundError('Order', orderId);

    const user = await this.userRepo.findById(userId);
    const total = this.pricingService.calculateTotal(order, user.tier);

    order.submit();                    // 도메인 규칙은 Aggregate 내부
    await this.orderRepo.save(order);  // 영속화 + 이벤트 발행
  }
}
```

> Application Service vs Domain Service: Application Service는 흐름 조율(orchestration)만 한다. `if/else` 비즈니스 규칙이 보이면 Domain Service나 Entity로 옮겨라.

## Anti-Corruption Layer (ACL)

외부 시스템의 모델이 내부 도메인 모델을 오염시키지 않도록 번역 계층을 둔다.

```typescript
// 외부 결제 API의 응답을 내부 도메인 모델로 변환
class PaymentGatewayAdapter {
  constructor(private readonly client: StripeClient) {}

  async charge(payment: Payment): Promise<PaymentResult> {
    const stripePayload = {
      amount: payment.amount.amount,
      currency: payment.amount.currency.toLowerCase(),
      customer: payment.externalCustomerId,
      metadata: { orderId: payment.orderId },
    };

    const stripeResult = await this.client.charges.create(stripePayload);

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

Aggregate의 영속성을 추상화. 컬렉션처럼 사용. Optimistic concurrency로 동시 수정 충돌을 감지.

> **트랜잭션 API 동작 원리·격리 수준·lock 사용법**은 [database.md](database.md#6-transaction-isolation-levels)에 정식 정의가 있다.

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
      const data = this.toPersistence(order);

      if (order.getVersion() > 0) {
        // Optimistic concurrency: version 불일치 시 동시 수정 감지
        const result = await tx.update(orders)
          .set({ ...data, version: order.getVersion() + 1 })
          .where(and(eq(orders.id, order.id), eq(orders.version, order.getVersion())));
        if (result.rowsAffected === 0) {
          throw new ConcurrencyError(`Order ${order.id} was modified concurrently`);
        }
      } else {
        await tx.insert(orders).values({ ...data, version: 1 });
      }

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
    // DB row → Domain model (version 포함)
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
│   └── services/        # Domain Services
├── application/         # Use cases, Ports 정의
│   ├── ports/           # 인터페이스 (Repository, Gateway 등)
│   ├── use-cases/       # Application Services
│   └── dto/
├── infrastructure/      # Adapters 구현
│   ├── persistence/     # DB 구현체 (Drizzle)
│   ├── messaging/       # 메시지 큐 (BullMQ)
│   ├── external/        # 외부 API (Stripe, SendGrid)
│   └── http/            # HTTP 라우트 (Fastify)
└── config/              # 의존성 주입, 설정
```

## 실무 적용 가이드

### DDD 적용 수준 판단 (기본값: 적용)

DDD는 **기본 방법론**이다. 아래 표에서 명시적으로 opt-out하는 경우만 예외다.

| 프로젝트 특성            | DDD 적용          | 비고                                           |
| ------------------ | --------------- | -------------------------------------------- |
| 복잡한 비즈니스 규칙        | ✅ 전면 적용 (기본)    | Entity/VO/Aggregate/Repository/Domain Event 전부 |
| CRUD 위주 (블로그, 관리자) | ⚠️ 경량 적용        | Entity/Repository는 유지, Aggregate/Event는 생략 가능  |
| 스타트업 MVP           | ✅ 핵심 도메인 전면 적용  | 부차 도메인은 경량 적용 허용                              |
| 레거시 마이그레이션         | ✅ ACL로 격리 후 점진 도입 | 새 기능부터 DDD 적용                                 |
| 단순 유틸/설정 API       | ❌ 명시적 opt-out   | 비즈니스 로직이 없는 경우만 해당                            |

### 실무 원칙

1. **도메인 모델에 인프라 의존성 없음**: Entity/VO는 순수 TypeScript
2. **Aggregate는 작게**: 한 트랜잭션 = 한 Aggregate만 수정
3. **Aggregate 간 참조는 ID로**: 직접 객체 참조 금지
4. **도메인 이벤트로 Aggregate 간 통신**: 느슨한 결합
5. **Repository는 Aggregate Root당 하나**: 하위 Entity는 Root를 통해 접근
6. **Ubiquitous Language 유지**: 코드 리뷰에서 네이밍 검증
7. **Optimistic Concurrency**: Aggregate에 version 필드 필수, Repository save 시 version check

---

## Related

- [architecture.md](architecture.md) — 레이어 분리·Plugin 경계
- [data-patterns.md](data-patterns.md) — Event Sourcing·CQRS
- [database.md](database.md) — Transaction API·Repository 구현
- [testing.md](testing.md) — Aggregate 단위 테스트
