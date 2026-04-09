# Fastify Architecture

> 이 파일은 **Fastify 5** 전용 구현을 다룬다.
> Framework-agnostic 아키텍처 원칙(Layered, Service Layer, Event-Driven)은 [../architecture.md](../architecture.md)를 참조하라.

## 목차

1. [Plugin 기반 아키텍처](#plugin-기반-아키텍처)
2. [Encapsulation과 fastify-plugin](#encapsulation과-fastify-plugin)
3. [Plugin 등록 순서](#plugin-등록-순서)
4. [Dependency Injection via Decorators](#dependency-injection-via-decorators)
5. [디렉토리 구조](#디렉토리-구조)
6. [Related](#related)

## Plugin 기반 아키텍처

Fastify의 핵심은 **encapsulated plugin system**이다. 모든 것이 plugin이다.

### Plugin 종류

```
Application Plugin    — 비즈니스 로직 (routes, services)
Utility Plugin        — 공유 유틸리티 (DB 커넥션, auth, error handler)
Decorator Plugin      — Fastify 인스턴스 확장 (request.user, server.db)
```

## Encapsulation과 fastify-plugin

### Encapsulation 원칙

```typescript
// ✅ 자식 plugin은 부모의 decorator에 접근 가능
// ❌ 부모/형제 plugin은 자식의 decorator에 접근 불가

fastify.register(async function parent(instance) {
  instance.decorate('parentUtil', () => 'parent');

  instance.register(async function child(childInstance) {
    // ✅ 부모의 parentUtil 접근 가능
    childInstance.parentUtil();

    childInstance.decorate('childOnly', () => 'child');
  });

  // ❌ childOnly는 여기서 접근 불가
});
```

### fastify-plugin으로 캡슐화 해제

공유해야 하는 plugin은 `fastify-plugin`으로 감싼다:

```typescript
import fp from 'fastify-plugin';

// fp로 감싸면 부모 scope에 decorator가 노출됨
export default fp(async function dbPlugin(fastify) {
  const db = drizzle(pool, { schema });
  fastify.decorate('db', db);
}, {
  name: 'db-plugin',
  dependencies: [], // 의존하는 다른 plugin 명시
});
```

## Plugin 등록 순서

```typescript
// app.ts — 순서가 중요!
const app = Fastify({ logger: true });

// 1. Infrastructure plugins (DB, Redis, etc.)
await app.register(dbPlugin);
await app.register(redisPlugin);

// 2. Utility plugins (auth, error handler, CORS)
await app.register(corsPlugin);
await app.register(authPlugin);
await app.register(errorHandlerPlugin);

// 3. Application plugins (routes)
await app.register(userRoutes, { prefix: '/api/v1/users' });
await app.register(orderRoutes, { prefix: '/api/v1/orders' });

// 4. Health check (인프라 plugin 이후)
await app.register(healthCheckPlugin);
```

순서 규칙: **Infrastructure → Utility → Application → Health**. 하위 plugin은 상위에 등록된 decorator에 접근할 수 있다.

## Dependency Injection via Decorators

> **Service Layer Pattern**(Handler → Service → Repository 3계층 분리 이유)은 [../architecture.md](../architecture.md#2-service-layer-pattern)에 정식 정의가 있다.
> 이 섹션은 Fastify decorator로 service를 주입하는 통합 패턴에 집중한다.

Fastify는 별도 DI 프레임워크 없이 **decorator**로 의존성을 주입한다.

```typescript
// plugins/services.ts
import fp from 'fastify-plugin';

export default fp(async function servicePlugin(fastify) {
  // Repository 계층
  const userRepo = new UserRepository(fastify.db);
  const orderRepo = new OrderRepository(fastify.db);
  const productRepo = new ProductRepository(fastify.db);

  // Service 계층 (repository 주입)
  const userService = new UserService(userRepo);
  const orderService = new OrderService(orderRepo, productRepo);

  // Fastify 인스턴스에 등록
  fastify.decorate('userService', userService);
  fastify.decorate('orderService', orderService);
}, {
  name: 'service-plugin',
  dependencies: ['db-plugin'],
});

// TypeScript 타입 확장
declare module 'fastify' {
  interface FastifyInstance {
    db: DrizzleDB;
    userService: UserService;
    orderService: OrderService;
  }
}
```

### Handler에서 사용

```typescript
import { FastifyRequest } from 'fastify';

export async function getUser(request: FastifyRequest<{ Params: { id: string } }>) {
  // request.server를 통해 service 접근
  return request.server.userService.findById(request.params.id);
}
```

### Route Handler에서의 계층 분리 예제

```typescript
// routes/orders/handler.ts — HTTP 관심사만
import { FastifyRequest, FastifyReply } from 'fastify';
import type { CreateOrderInput } from '../../shared/types.js';

export async function createOrder(request: FastifyRequest, reply: FastifyReply) {
  const { userId, items } = request.body as CreateOrderInput;
  const order = await request.server.orderService.create(userId, items);
  return reply.code(201).send({ data: order });
}
```

Service/Repository 계층 구현은 framework-agnostic이므로 [../architecture.md](../architecture.md#2-service-layer-pattern)를 참조한다.

## 디렉토리 구조

Fastify 기반 BE 프로젝트의 권장 디렉토리 구조:

```
apps/server/
├── src/
│   ├── app.ts            # Fastify 인스턴스 생성 (buildApp)
│   ├── server.ts         # 서버 시작 (listen, signal handler)
│   ├── plugins/          # Fastify plugins
│   │   ├── db.ts
│   │   ├── auth.ts
│   │   ├── cors.ts
│   │   ├── error-handler.ts
│   │   └── services.ts
│   ├── routes/           # Route plugins (도메인별)
│   │   ├── users/
│   │   │   ├── index.ts   # route registration
│   │   │   ├── schema.ts  # JSON Schema
│   │   │   └── handler.ts # request handlers
│   │   ├── orders/
│   │   └── health/
│   ├── services/         # Business logic (framework-agnostic)
│   ├── repositories/     # Data access (framework-agnostic)
│   └── errors/           # Custom error classes
└── package.json
```

핵심: **Fastify에 종속된 코드는 `plugins/`와 `routes/`에만 둔다**. `services/`, `repositories/`, `errors/`는 Fastify import 없이 작성하여 framework 교체가 쉽도록 한다.

## Related

- [../architecture.md](../architecture.md) — Layered architecture, Service Layer Pattern, Event-driven architecture 원칙
- [./api-design.md](./api-design.md) — Fastify Route plugin, JSON Schema, hooks
- [./error-handling.md](./error-handling.md) — `setErrorHandler`, error hooks
- [../domain-driven-design.md](../domain-driven-design.md) — Aggregate, Bounded Context
