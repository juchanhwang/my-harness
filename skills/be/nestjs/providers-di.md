# NestJS Providers & Dependency Injection

> 이 파일은 **NestJS 11** 전용 구현을 다룬다.
> Framework-agnostic DI 원칙(constructor injection, SOLID, inversion of control)은 [../architecture.md](../architecture.md#3-dependency-injection-원칙)을 참조하라.

## 목차

1. [DI 기본 개념](#di-기본-개념)
2. [`@Injectable()` Provider](#injectable-provider)
3. [Custom Provider 4가지](#custom-provider-4가지)
4. [Injection Token](#injection-token)
5. [Injection Scope (DEFAULT / REQUEST / TRANSIENT)](#injection-scope)
6. [Durable Provider (멀티 테넌트)](#durable-provider)
7. [`@Optional()` — 선택적 의존성](#optional--선택적-의존성)
8. [Circular Dependency 처리](#circular-dependency-처리)
9. [Custom Param Decorator](#custom-param-decorator)
10. [`applyDecorators` — Decorator 합성](#applydecorators--decorator-합성)
11. [안티패턴](#안티패턴)
12. [Related](#related)
13. [References](#references-공식-문서)

> **DI의 이론적 배경**(Inversion of Control, SOLID, Constructor Injection vs Property Injection)은 [../architecture.md](../architecture.md#3-dependency-injection-원칙)에 정식 정의가 있다.
> 이 파일은 NestJS IoC 컨테이너의 토큰 바인딩 메커니즘과 실무 패턴에 집중한다.

## DI 기본 개념

NestJS 공식 문서 인용: *"Dependency Injection is built into the Nest core in a fundamental way."*

Nest의 DI 동작은 세 단계다:

1. `@Injectable()` — 클래스가 IoC 컨테이너에 의해 관리될 수 있다고 선언
2. 생성자 파라미터 타입으로 의존성 선언 (`constructor(private svc: CatsService) {}`)
3. Module의 `providers` 배열에 등록 → 토큰 ↔ 구현 바인딩

부트스트랩 시 Nest는 모든 모듈을 순회하며 **transitive dependency graph**를 만들고, bottom-up으로 인스턴스를 생성한다. 의존성이 해결되지 않으면 `Nest can't resolve dependencies of ...` 에러로 즉시 실패한다 (fail-fast).

## `@Injectable()` Provider

```typescript
// src/modules/cats/cats.service.ts
import { Injectable } from '@nestjs/common';
import type { Cat } from './cat.interface';

@Injectable()
export class CatsService {
  private readonly cats: Cat[] = [];

  create(cat: Cat): void {
    this.cats.push(cat);
  }

  findAll(): readonly Cat[] {
    return this.cats;
  }
}
```

Controller에서 주입:

```typescript
@Controller('cats')
export class CatsController {
  // 생성자 주입 — private 접근자가 선언과 할당을 동시에 처리
  constructor(private readonly catsService: CatsService) {}

  @Get()
  async findAll(): Promise<readonly Cat[]> {
    return this.catsService.findAll();
  }
}
```

> **property injection은 쓰지 마라.** 공식 문서 인용: *"If your class doesn't extend another class, it's generally better to use constructor-based injection. The constructor clearly specifies which dependencies are required, offering better visibility."*
>
> Property injection(`@Inject('TOKEN') private foo: Foo;`)은 상속 클래스에서 `super()`로 의존성을 다 내릴 수 없을 때만 예외적으로 쓴다.

## Custom Provider 4가지

`providers: [CatsService]`는 short-hand이며, 정식 형태는 다음과 같다:

```typescript
providers: [
  { provide: CatsService, useClass: CatsService },
];
```

공식 문서는 4가지 custom provider 패턴을 제공한다. 모두 `provide`로 토큰을 지정하고, `use*` 중 하나로 구현을 지정한다.

### 1. `useValue` — 값 주입

상수, 외부 라이브러리 인스턴스, 테스트용 mock을 주입할 때 사용.

```typescript
const mockCatsService: Partial<CatsService> = {
  findAll: () => [],
};

@Module({
  providers: [{ provide: CatsService, useValue: mockCatsService }],
})
export class AppModule {}
```

### 2. `useClass` — 구현 클래스 선택

환경에 따라 다른 구현을 주입할 때 사용.

```typescript
abstract class ConfigService {
  abstract get(key: string): string;
}

const configServiceProvider = {
  provide: ConfigService,
  useClass:
    process.env.NODE_ENV === 'development'
      ? DevelopmentConfigService
      : ProductionConfigService,
};

@Module({ providers: [configServiceProvider] })
export class AppModule {}
```

### 3. `useFactory` — 동적 생성

다른 provider의 값을 참조해서 동적으로 생성. `inject`로 의존성을 선언한다.

```typescript
import type { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

const redisProvider = {
  provide: REDIS_CLIENT,
  useFactory: (config: ConfigService): Redis => {
    return new Redis({
      host: config.getOrThrow<string>('REDIS_HOST'),
      port: config.getOrThrow<number>('REDIS_PORT'),
      lazyConnect: false,
    });
  },
  inject: [ConfigService],
  // inject 배열의 순서가 useFactory 파라미터 순서와 일치해야 한다.
};
```

공식 문서는 optional inject도 지원한다:

```typescript
inject: [
  MyOptionsProvider,
  { token: 'SomeOptionalProvider', optional: true },
  // ↑ 해당 토큰이 없으면 undefined가 주입됨
],
```

### 4. `useExisting` — 별칭

기존 provider에 다른 이름(alias)을 부여. 동일 인스턴스를 두 토큰으로 접근 가능.

```typescript
@Injectable()
class LoggerService {}

const loggerAliasProvider = {
  provide: 'AliasedLoggerService',
  useExisting: LoggerService,
};

@Module({ providers: [LoggerService, loggerAliasProvider] })
export class AppModule {}
```

> 공식 문서 인용: *"If both dependencies are specified with SINGLETON scope, they'll both resolve to the same instance."*

## Injection Token

토큰은 DI 컨테이너가 provider를 식별하는 키다. 세 가지 형태가 있다.

### 1. 클래스 토큰 (기본)

```typescript
constructor(private catsService: CatsService) {}
// 토큰 = CatsService 클래스 그 자체
```

TypeScript의 `emitDecoratorMetadata`가 활성화되어야 타입 정보가 런타임에 보존된다. `tsconfig.json`:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "strict": true
  }
}
```

### 2. 문자열 토큰 (지양)

```typescript
@Module({
  providers: [{ provide: 'CONNECTION', useValue: connection }],
})
export class AppModule {}

@Injectable()
class CatsRepository {
  constructor(@Inject('CONNECTION') private connection: Connection) {}
}
```

문자열은 오타로 인한 런타임 에러 위험이 있으므로 별도 파일에 상수로 정의하는 것을 권장한다.

### 3. Symbol 토큰 (권장)

```typescript
// src/core/database/database.tokens.ts
export const DATABASE_CONNECTION = Symbol('DATABASE_CONNECTION');

// 사용
constructor(@Inject(DATABASE_CONNECTION) private readonly db: NodePgDatabase) {}
```

`Symbol`은 전역에서 unique가 보장되므로 충돌 위험이 없다. 여러 라이브러리가 같은 문자열 키를 쓰는 사고를 방지한다.

> **Best Practice**: class token이 불가능한 경우(인터페이스 바인딩, 외부 커넥션 객체) → **Symbol 토큰을 별도 `*.tokens.ts` 파일**에 모아 import.

## Injection Scope

Nest의 모든 provider는 기본적으로 **singleton**이다. 이는 Node.js가 multi-threaded가 아니라 single-threaded이기 때문에 안전하다 (공식 문서 인용).

공식 문서에 정의된 세 가지 scope:

| Scope | 설명 | 수명 |
|---|---|---|
| `DEFAULT` (singleton) | 앱 전체에서 하나의 인스턴스를 공유 | 앱 lifecycle |
| `REQUEST` | 각 요청마다 새 인스턴스 생성. 요청 완료 후 GC | request 단위 |
| `TRANSIENT` | consumer마다 새 인스턴스. 공유 없음 | consumer별 |

```typescript
import { Injectable, Scope } from '@nestjs/common';

// REQUEST
@Injectable({ scope: Scope.REQUEST })
export class RequestLogger {}

// TRANSIENT
@Injectable({ scope: Scope.TRANSIENT })
export class TransientHelper {}
```

### Scope Hierarchy — "REQUEST bubbles up"

공식 문서 인용: *"The REQUEST scope bubbles up the injection chain. A controller that depends on a request-scoped provider will, itself, be request-scoped."*

```
CatsController (← 자동으로 REQUEST)
     ↓
CatsService (REQUEST)
     ↓
CatsRepository (기본 singleton, 그대로 유지)
```

REQUEST scope provider 하나를 주입하면 그 consumer까지 모두 REQUEST scope가 전염된다. TRANSIENT는 전염되지 않는다.

### REQUEST Provider

request scope에서 원본 request 객체에 접근할 때:

```typescript
import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';

@Injectable({ scope: Scope.REQUEST })
export class UserContextService {
  constructor(@Inject(REQUEST) private readonly request: Request) {}

  getUserId(): string | undefined {
    return this.request.headers['x-user-id']?.toString();
  }
}
```

> **성능 경고** (공식 문서 인용): *"Using request-scoped providers will have an impact on application performance. ... Unless a provider must be request-scoped, it is strongly recommended that you use the default singleton scope."*
>
> 벤치마크에 따르면 REQUEST scope 남용 시 평균 응답 시간이 최대 5% 지연된다. 30k 동시 요청이 있으면 30k 개의 ephemeral instance가 만들어지며, 이는 Node.js GC 부담으로 이어진다 ([../nodejs-internals.md#memory-management--v8-gc](../nodejs-internals.md#memory-management--v8-gc) 참조).
>
> 대부분의 경우 **singleton + CLS(Continuation-Local Storage)** 조합으로 요청 컨텍스트를 전파하는 것이 더 낫다. [./drizzle-integration.md](./drizzle-integration.md#transaction-scoping--cls)에서 자세히 다룬다.

## Durable Provider

공식 문서가 소개하는 멀티 테넌트 최적화 패턴. request scope를 tenant 단위로 묶어 DI 서브트리를 재사용한다.

```typescript
// src/core/tenancy/tenant-context-strategy.ts
import {
  ContextIdFactory,
  ContextIdStrategy,
  HostComponentInfo,
  type ContextId,
} from '@nestjs/core';
import type { Request } from 'express';

const tenantSubTrees = new Map<string, ContextId>();

export class TenantContextIdStrategy implements ContextIdStrategy {
  attach(contextId: ContextId, request: Request) {
    const tenantId = request.headers['x-tenant-id']?.toString();
    if (!tenantId) {
      return () => contextId;
    }

    let subTreeId = tenantSubTrees.get(tenantId);
    if (!subTreeId) {
      subTreeId = ContextIdFactory.create();
      tenantSubTrees.set(tenantId, subTreeId);
    }

    return (info: HostComponentInfo) =>
      info.isTreeDurable ? subTreeId : contextId;
  }
}
```

```typescript
// main.ts
import { ContextIdFactory } from '@nestjs/core';
ContextIdFactory.apply(new TenantContextIdStrategy());
```

```typescript
@Injectable({ scope: Scope.REQUEST, durable: true })
export class TenantDataSource {}
```

> **주의** (공식 경고): *"Note this strategy is not ideal for applications operating with a large number of tenants."* tenantSubTrees 맵이 무제한 증가하므로, 수천 개 이상의 tenant가 있으면 LRU 또는 TTL로 제한해야 한다.

## `@Optional()` — 선택적 의존성

의존성이 없어도 에러 없이 동작해야 하는 경우 `@Optional()`을 사용한다.

```typescript
import { Injectable, Optional, Inject } from '@nestjs/common';

@Injectable()
export class HttpService<T> {
  constructor(
    @Optional() @Inject('HTTP_OPTIONS') private readonly httpOptions?: T,
  ) {}
}
```

`HTTP_OPTIONS` 토큰이 등록되지 않으면 `httpOptions`는 `undefined`로 주입된다. 디폴트 값을 사용하는 configuration provider에 유용하다.

## Circular Dependency 처리

공식 문서가 먼저 경고한다: *"While circular dependencies should be avoided where possible, you can't always do so."*

### 언제 발생하는가

두 provider가 서로를 참조하는 경우 (`A → B → A`). Nest가 부트스트랩 시 dependency graph를 만들 때 어느 쪽을 먼저 instantiate 할지 결정할 수 없어 실패한다.

### 해결 순서 (권장)

1. **구조 개선** — 공통 로직을 제3의 service로 추출해 양쪽이 이를 의존하게 변경. 대부분의 경우 순환 참조는 도메인 경계 설계 오류의 신호다.
2. **Event-driven 분리** — `@nestjs/event-emitter`로 느슨하게 연결. A가 event를 emit 하고 B는 event listener로 반응.
3. **`ModuleRef`로 lazy resolve** — 런타임에 한쪽에서만 resolve.
4. **`forwardRef()` (최후 수단)**:

```typescript
// cats.service.ts
@Injectable()
export class CatsService {
  constructor(
    @Inject(forwardRef(() => CommonService))
    private readonly commonService: CommonService,
  ) {}
}

// common.service.ts
@Injectable()
export class CommonService {
  constructor(
    @Inject(forwardRef(() => CatsService))
    private readonly catsService: CatsService,
  ) {}
}
```

> **공식 경고 인용**: *"The order of instantiation is indeterminate. Make sure your code does not depend on which constructor is called first. Having circular dependencies depend on providers with Scope.REQUEST can lead to undefined dependencies."*

### Module 간 circular dependency

```typescript
@Module({
  imports: [forwardRef(() => CatsModule)],
})
export class CommonModule {}

@Module({
  imports: [forwardRef(() => CommonModule)],
})
export class CatsModule {}
```

> **Barrel file 주의** (공식 경고): `cats/index.ts`를 경유해 `cats.service.ts`를 import 하면 circular dependency가 잘못 생기기 쉽다. 모듈/provider 파일에는 barrel file을 쓰지 마라.

## Custom Param Decorator

공식 문서의 `createParamDecorator` 패턴. route handler 파라미터에 request로부터 데이터를 추출해 주입한다.

```typescript
// src/common/decorators/current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly roles: readonly string[];
}

export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext): unknown => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;
    if (!user) {
      return undefined;
    }
    return data ? user[data] : user;
  },
);
```

사용:

```typescript
@Get('me')
getMe(@CurrentUser() user: AuthUser): AuthUser {
  return user;
}

@Get('my-id')
getMyId(@CurrentUser('id') userId: string): string {
  return userId;
}
```

> **ValidationPipe 주의**: 공식 문서 인용 — *"validateCustomDecorators option must be set to true. ValidationPipe does not validate arguments annotated with the custom decorators by default."*

## `applyDecorators` — Decorator 합성

여러 decorator를 하나로 묶는 helper. 공식 문서의 예시를 그대로 쓴다.

```typescript
// src/common/decorators/auth.decorator.ts
import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';

export function Auth(...roles: readonly string[]) {
  return applyDecorators(
    SetMetadata('roles', roles),
    UseGuards(JwtAuthGuard, RolesGuard),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: 'Unauthorized' }),
  );
}
```

```typescript
@Get('users')
@Auth('admin')
findAllUsers() {
  /* ... */
}
```

> **공식 경고**: *"`@ApiHideProperty()` decorator from the `@nestjs/swagger` package is not composable."* 일부 swagger decorator는 `applyDecorators`와 호환되지 않는다.

## 안티패턴

### 1. `new`로 직접 인스턴스화

```typescript
// ❌ DI 컨테이너를 우회 — 테스트에서 mock 주입 불가
export class OrderController {
  private readonly orderService = new OrderService();
}
```

올바른 방법은 생성자 주입이다. 이 한 줄 차이로 unit test 가능 여부가 결정된다.

### 2. Property injection 남용

```typescript
// ❌ 어떤 의존성이 필요한지 생성자만 보고는 모름
@Injectable()
export class OrderService {
  @Inject(PaymentService) private paymentService!: PaymentService;
  @Inject(NotificationService) private notifier!: NotificationService;
}
```

상속으로 `super()`를 관리하기 힘든 경우가 아니라면 생성자 주입을 쓴다.

### 3. REQUEST scope를 "그냥 편해서" 선택

```typescript
// ❌ userId를 service 내부에서 쓰려고 REQUEST scope 남용
@Injectable({ scope: Scope.REQUEST })
export class OrdersService {
  constructor(@Inject(REQUEST) private req: Request) {}

  async createOrder(): Promise<Order> {
    const userId = this.req.user.id; // 편해 보이지만...
    /* ... */
  }
}
```

이 service를 주입하는 모든 컨트롤러가 REQUEST scope로 전염되고, 성능이 무너진다. 대신 `userId`를 메서드 인자로 명시적으로 전달하거나, `nestjs-cls` 같은 AsyncLocalStorage 기반 CLS 라이브러리를 사용한다.

### 4. 문자열 토큰 하드코딩

```typescript
// ❌ 오타, IDE refactor 불가, 전역 충돌
constructor(@Inject('DATABASE') private db: Database) {}
```

`Symbol`이나 상수로 관리한다.

### 5. `forwardRef`를 "우선 돌아가게" 목적으로 사용

순환 참조가 있다는 건 도메인 경계가 뭉그러졌다는 신호다. `forwardRef`로 감추지 말고 근본 원인을 해결하라. 장기적으로 코드 유지보수가 훨씬 편하다.

### 6. Scope를 섞어서 `@nestjs/passport` strategy나 WebSocket gateway에 적용

공식 문서 경고: *"Websocket Gateways should not use request-scoped providers because they must act as singletons. ... The limitation also applies to ... Passport strategies or Cron controllers."* 이들은 반드시 singleton이어야 한다.

## Related

- [../architecture.md](../architecture.md#3-dependency-injection-원칙) — DI, IoC, SOLID 이론
- [./architecture.md](./architecture.md) — Module 시스템, `@Global`, dynamic module
- [./request-lifecycle.md](./request-lifecycle.md) — Guards/Interceptors/Pipes에서의 DI
- [./drizzle-integration.md](./drizzle-integration.md) — `useFactory`로 DB 연결 주입
- [./testing.md](./testing.md) — `overrideProvider`로 테스트 mock 주입
- [../fastify/architecture.md](../fastify/architecture.md) — Fastify decorator 기반 DI 비교

## References (공식 문서)

- [NestJS Docs — Providers](https://docs.nestjs.com/providers) — `@Injectable`, constructor injection, property injection, provider registration
- [NestJS Docs — Custom Providers (Dependency Injection)](https://docs.nestjs.com/fundamentals/dependency-injection) — `useValue` / `useClass` / `useFactory` / `useExisting`, non-class token, `inject` 배열의 optional provider
- [NestJS Docs — Injection Scopes](https://docs.nestjs.com/fundamentals/injection-scopes) — `Scope.DEFAULT` / `REQUEST` / `TRANSIENT`, scope hierarchy bubbling, REQUEST provider, durable provider, 성능 경고
- [NestJS Docs — Circular Dependency](https://docs.nestjs.com/fundamentals/circular-dependency) — `forwardRef()`, barrel file 경고, scope.REQUEST + circular 조합 주의
- [NestJS Docs — Custom Decorators](https://docs.nestjs.com/custom-decorators) — `createParamDecorator`, `applyDecorators`, `validateCustomDecorators`
