# Architecture

## 목차

1. [Layered Architecture 원칙](#1-layered-architecture-원칙)
2. [Service Layer Pattern](#2-service-layer-pattern)
3. [Dependency Injection 원칙](#3-dependency-injection-원칙)
4. [Monorepo 구조 (Turborepo)](#4-monorepo-구조-turborepo)
5. [Event-Driven Architecture (선택적)](#5-event-driven-architecture-선택적)
6. [핵심 원칙 요약](#6-핵심-원칙-요약)

## 1. Layered Architecture 원칙

BE 애플리케이션은 **관심사 분리**를 위한 계층(Layer) 구조로 설계한다. 각 계층은 단방향 의존성(Handler → Service → Repository)을 가지며, 상위 계층이 하위 계층을 호출한다.

### 계층별 책임

```
Handler/Controller Layer — HTTP/transport 관심사 (request parsing, response formatting)
          ↓
Service Layer            — 비즈니스 로직 (validation, orchestration, business rules)
          ↓
Repository Layer         — 데이터 접근 (DB 쿼리, 외부 API 호출)
```

### 원칙

* **단방향 의존성** — 상위가 하위를 알지만, 하위는 상위를 모른다
* **계층 경계 존중** — Handler에서 Repository를 직접 호출하지 않는다
* **Framework 의존성 격리** — Service/Repository는 HTTP framework(Fastify, NestJS 등)에 의존하지 않도록 작성한다

> **Fastify Plugin 기반 아키텍처**(plugin encapsulation, fastify-plugin, plugin 등록 순서)는 [fastify/architecture.md](fastify/architecture.md)에 정식 정의가 있다.
> 이 파일은 framework 중립 아키텍처 원칙에 집중한다.

## 2. Service Layer Pattern

Route handler → Service → Repository 3계층 구조.

### 왜 3계층인가

* **Route handler**: HTTP 관심사 (request parsing, response formatting)
* **Service**: 비즈니스 로직 (validation, orchestration, business rules)
* **Repository**: 데이터 접근 (DB 쿼리, 캐시)

### Service 계층 예제 (framework-agnostic)

```typescript
// services/order.service.ts — 비즈니스 로직 (Fastify 의존성 없음)
export class OrderService {
  constructor(
    private readonly orderRepo: OrderRepository,
    private readonly productRepo: ProductRepository,
    private readonly paymentService: PaymentService,
  ) {}

  async create(userId: number, items: OrderItemInput[]) {
    // 1. 상품 존재 여부 및 재고 확인
    const products = await this.productRepo.findByIds(items.map((i) => i.productId));
    this.validateStock(products, items);

    // 2. 총 금액 계산
    const totalAmount = this.calculateTotal(products, items);

    // 3. 주문 생성 (트랜잭션)
    const order = await this.orderRepo.createWithItems(userId, items, totalAmount);

    // 4. 재고 차감
    await this.productRepo.decrementStock(items);

    return order;
  }
}
```

### Repository 계층 예제 (framework-agnostic)

```typescript
// repositories/order.repository.ts — 데이터 접근만 (HTTP framework 의존성 없음)
export class OrderRepository {
  constructor(private readonly db: DrizzleDB) {}

  async createWithItems(userId: number, items: OrderItemInput[], totalAmount: number) {
    return this.db.transaction(async (tx) => {
      const [order] = await tx.insert(orders).values({ userId, totalAmount }).returning();
      const orderItems = items.map((item) => ({ orderId: order.id, ...item }));
      await tx.insert(orderItemsTable).values(orderItems);
      return order;
    });
  }

  async findByUserId(userId: number, pagination: PaginationParams) {
    return this.db.select().from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt))
      .limit(pagination.limit)
      .offset(pagination.offset);
  }
}
```

핵심: **Service/Repository는 HTTP framework(Fastify, NestJS)에 의존하지 않는다**. framework를 교체해도 비즈니스 로직은 그대로 유지된다.

## 3. Dependency Injection 원칙

BE 애플리케이션에서 DI는 다음 목적을 달성한다:

* **테스트 가능성** — 의존성을 Mock으로 교체 가능
* **결합도 완화** — 구체 클래스가 아닌 인터페이스에 의존
* **생명주기 관리** — singleton vs request-scoped 등

### DI 구현 방식 비교

| 방식 | 예시 | 특징 |
|------|------|------|
| **Constructor Injection** | `new OrderService(repo, payment)` | 명시적, 테스트 용이 |
| **Decorator (Fastify)** | `fastify.decorate('orderService', ...)` | Fastify 인스턴스에 바인딩 |
| **DI Container (NestJS)** | `@Injectable()` + Module system | 자동 resolve, metadata 기반 |

> **Fastify Decorator 기반 DI**(`fastify.decorate`, `declare module 'fastify'`, 서비스 주입 패턴)는 [fastify/architecture.md](fastify/architecture.md#dependency-injection-via-decorators)에 정식 정의가 있다.
> 이 파일은 framework 중립 DI 원칙에 집중한다.

## 4. Monorepo 구조 (Turborepo)

```
project-root/
├── apps/
│   ├── web/              # Next.js 프론트엔드
│   │   ├── src/
│   │   └── package.json
│   └── server/           # 백엔드 애플리케이션
│       └── src/          # framework별 구조는 해당 framework 문서 참조
├── packages/
│   ├── db/               # Drizzle 스키마 & migration (공유)
│   │   ├── src/
│   │   │   ├── schema/
│   │   │   └── index.ts
│   │   ├── drizzle/      # migration SQL files
│   │   └── drizzle.config.ts
│   ├── shared/           # FE-BE 공유 타입, 상수
│   │   ├── src/
│   │   │   ├── types/
│   │   │   └── constants/
│   │   └── package.json
│   └── config/           # ESLint, TypeScript config
│       ├── eslint/
│       └── tsconfig/
├── turbo.json
├── package.json
└── docker-compose.yml
```

> **Fastify 기반 server 앱 디렉토리 구조**(plugins/, routes/, services/, repositories/, errors/)는 [fastify/architecture.md](fastify/architecture.md#디렉토리-구조)에 정식 정의가 있다.

### Turborepo 설정

```jsonc
// turbo.json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "dependsOn": ["^build"],
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "db:generate": {
      "cache": false
    },
    "db:migrate": {
      "cache": false
    },
    "typecheck": {
      "dependsOn": ["^build"]
    }
  }
}
```

## 5. Event-Driven Architecture (선택적)

서비스 간 결합도를 낮추기 위해 이벤트 기반 통신:

```typescript
// events/emitter.ts
import { EventEmitter } from 'node:events';

type AppEvents = {
  'order.created': [{ orderId: number; userId: number; amount: number }];
  'order.completed': [{ orderId: number }];
  'user.registered': [{ userId: number; email: string }];
};

class TypedEventEmitter extends EventEmitter {
  emit<K extends keyof AppEvents>(event: K, ...args: AppEvents[K]): boolean {
    return super.emit(event, ...args);
  }
  on<K extends keyof AppEvents>(event: K, listener: (...args: AppEvents[K]) => void): this {
    return super.on(event, listener as any);
  }
}

export const appEvents = new TypedEventEmitter();

// 사용: 주문 생성 후 이메일 발송, 통계 업데이트 등
appEvents.on('order.created', async ({ orderId, userId, amount }) => {
  await emailService.sendOrderConfirmation(userId, orderId);
  await analyticsService.trackPurchase(userId, amount);
});

// Service에서 이벤트 발행
class OrderService {
  async create(userId: number, items: OrderItemInput[]) {
    const order = await this.orderRepo.createWithItems(userId, items, totalAmount);
    appEvents.emit('order.created', { orderId: order.id, userId, amount: totalAmount });
    return order;
  }
}
```

**규모가 커지면**: In-process EventEmitter → BullMQ (Redis-based job queue) → Kafka/RabbitMQ

## 6. 핵심 원칙 요약

1. **Layered architecture** — Handler(HTTP) → Service(비즈니스) → Repository(데이터)
2. **Framework 의존성 격리** — Service/Repository는 HTTP framework 없이 작성
3. **명시적 DI** — 생성자 주입 또는 framework decorator/container
4. **Monorepo로 코드 공유** — DB 스키마, 타입, 상수를 FE-BE 간 공유
5. **이벤트로 결합도 낮추기** — 부가 기능(이메일, 통계)은 이벤트로 분리

---

## Related

- [fastify/architecture.md](fastify/architecture.md) — Fastify plugin 시스템, decorator DI, 디렉토리 구조
- [api-design.md](api-design.md) — REST 원칙, HTTP 컨벤션
- [domain-driven-design.md](domain-driven-design.md) — Aggregate·Bounded Context·레이어 분리
- [system-design.md](system-design.md) — 상위 시스템 구조·컴포넌트 배치
- [deployment.md](deployment.md) — 빌드·배포·환경 분리


