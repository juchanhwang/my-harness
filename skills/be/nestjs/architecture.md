# NestJS Architecture

> 이 파일은 **NestJS 11** 전용 구현을 다룬다.
> Framework-agnostic 아키텍처 원칙(Layered, Service Layer, Event-Driven, Monorepo 구조)은 [../architecture.md](../architecture.md)를 참조하라.

## 목차

1. [모듈 시스템 개요](#모듈-시스템-개요)
2. [Feature / Shared / Core 모듈 분류](#feature--shared--core-모듈-분류)
3. [Dynamic Module 패턴](#dynamic-module-패턴)
4. [ConfigurableModuleBuilder](#configurablemodulebuilder)
5. [Global Module](#global-module)
6. [Module Re-Exporting](#module-re-exporting)
7. [권장 디렉토리 구조](#권장-디렉토리-구조)
8. [안티패턴](#안티패턴)
9. [Related](#related)
10. [References](#references-공식-문서)

> **Layered Architecture 원칙**(Controller → Service → Repository, 의존성 방향)은 [../architecture.md](../architecture.md#1-layered-architecture-원칙)에 정식 정의가 있다.
> 이 파일은 NestJS의 `@Module` 기반 의존성 그래프와 encapsulation 구현에 집중한다.

## 모듈 시스템 개요

NestJS의 모든 애플리케이션은 최소 하나의 **root module**(보통 `AppModule`)을 가진다. Nest는 모듈 메타데이터를 읽어 내부적으로 **application graph**를 구성하고, 이 그래프로 provider 간 의존성을 resolve 한다.

`@Module()` decorator는 다음 네 가지 속성만 받는다 (공식 문서 표 그대로):

| Property | 설명 |
|---|---|
| `providers` | Nest injector가 인스턴스화하는 provider 목록. 이 모듈 안에서 공유된다 |
| `controllers` | 이 모듈에 정의된 controller 목록 |
| `imports` | 이 모듈이 필요로 하는 provider를 export 하는 다른 모듈 목록 |
| `exports` | 이 모듈의 `providers` 중 외부(import 한 모듈)에 공개할 부분집합. provider 자체 또는 token 문자열/심볼 모두 가능 |

**핵심 원칙: encapsulation**. 기본적으로 모듈은 자신의 provider를 캡슐화하므로, 외부에서 사용하려면 **반드시 `exports`에 명시**해야 한다. encapsulation은 의도치 않은 결합을 막고 의존성 경계를 명확히 한다.

```typescript
// src/modules/cats/cats.module.ts
import { Module } from '@nestjs/common';
import { CatsController } from './cats.controller';
import { CatsService } from './cats.service';

@Module({
  controllers: [CatsController],
  providers: [CatsService],
  exports: [CatsService], // 다른 모듈에서 CatsService를 주입하려면 필요
})
export class CatsModule {}
```

> **Tip**: 모듈 파일을 수작업으로 만들지 말고 `nest g module cats` CLI를 사용하라. 파일 생성과 root module 등록이 동시에 된다.

## Feature / Shared / Core 모듈 분류

NestJS 공식 문서는 "feature module" 개념만 명시하지만, 실무에서는 역할에 따라 세 가지로 나누는 것이 일반적이다. 이 구분은 관례(convention)이며 런타임 의미는 동일하다.

### 1. Feature Module — 도메인 단위

한 도메인(cats, orders, payments)의 controller/service/repository를 묶는다. 외부에는 필요한 service만 export 한다.

```typescript
// src/modules/orders/orders.module.ts
@Module({
  imports: [UsersModule], // 다른 feature module 참조
  controllers: [OrdersController],
  providers: [OrdersService, OrdersRepository],
  exports: [OrdersService],
})
export class OrdersModule {}
```

### 2. Shared Module — 여러 feature에서 재사용되는 순수 유틸

Stateless 유틸리티(encryption, date utils 등). `providers`와 `exports`가 거의 동일하다.

```typescript
// src/shared/crypto/crypto.module.ts
@Module({
  providers: [CryptoService],
  exports: [CryptoService],
})
export class CryptoModule {}
```

> NestJS 공식 문서는 "모든 모듈은 이미 singleton이며 자동으로 shared" 라고 명시한다. 즉 "SharedModule"이라는 특별한 타입이 있는 게 아니라, provider를 export 해서 다른 모듈이 import 하면 **같은 instance가 공유**된다.

### 3. Core Module — 앱 전역 인프라

DB 연결, Logger, Config 등 앱 전역 인프라. **루트 모듈에서 한 번만 import** 하며, 보통 `@Global()`로 선언한다.

```typescript
// src/core/core.module.ts
import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';

@Global()
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), LoggerModule.forRoot()],
  exports: [ConfigModule, LoggerModule],
})
export class CoreModule {}
```

> 공식 문서 인용: *"Global modules should be registered **only once**, generally by the root or core module."*

## Dynamic Module 패턴

**Dynamic module**은 import 시점에 외부에서 설정값을 주입할 수 있는 모듈이다. 공식 문서는 "static module binding과 달리, consuming module이 host module의 provider 구성에 영향을 줄 수 있다"고 설명한다.

`forRoot`, `register`, `forFeature`는 이름만 다르며, 공식 커뮤니티 가이드라인은 다음과 같다 (공식 문서 `fundamentals/dynamic-modules.md` 인용):

| 메서드 | 용도 |
|---|---|
| `register` | 호출 모듈 전용 설정. 같은 모듈을 다른 설정으로 여러 번 import 가능. 예: `HttpModule.register({ baseUrl: 'a' })` |
| `forRoot` | 앱 전역에서 한 번만 설정. 예: `TypeOrmModule.forRoot()`, `GraphQLModule.forRoot()` |
| `forFeature` | `forRoot` 설정 기반으로 호출 모듈별 세부 설정 추가. 예: 특정 repository 주입 |

각 메서드는 `Async` 변종(`registerAsync`, `forRootAsync`, `forFeatureAsync`)을 가지며, 이들은 Nest DI로 설정 팩토리를 주입받는다.

### 수동 구현 예시 (동기 + 비동기)

```typescript
// src/modules/redis/redis.module.ts
import { DynamicModule, Module, Provider } from '@nestjs/common';
import Redis from 'ioredis';

export interface RedisModuleOptions {
  host: string;
  port: number;
  password?: string;
}

export interface RedisModuleAsyncOptions {
  useFactory: (...args: unknown[]) => Promise<RedisModuleOptions> | RedisModuleOptions;
  inject?: unknown[];
}

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');
export const REDIS_OPTIONS = Symbol('REDIS_OPTIONS');

@Module({})
export class RedisModule {
  static forRoot(options: RedisModuleOptions): DynamicModule {
    return {
      module: RedisModule,
      global: true, // 전역으로 노출 (선택)
      providers: [
        { provide: REDIS_OPTIONS, useValue: options },
        {
          provide: REDIS_CLIENT,
          useFactory: (opts: RedisModuleOptions) =>
            new Redis({ host: opts.host, port: opts.port, password: opts.password }),
          inject: [REDIS_OPTIONS],
        },
      ],
      exports: [REDIS_CLIENT],
    };
  }

  static forRootAsync(options: RedisModuleAsyncOptions): DynamicModule {
    const optionsProvider: Provider = {
      provide: REDIS_OPTIONS,
      useFactory: options.useFactory,
      inject: options.inject ?? [],
    };

    return {
      module: RedisModule,
      global: true,
      providers: [
        optionsProvider,
        {
          provide: REDIS_CLIENT,
          useFactory: (opts: RedisModuleOptions) =>
            new Redis({ host: opts.host, port: opts.port, password: opts.password }),
          inject: [REDIS_OPTIONS],
        },
      ],
      exports: [REDIS_CLIENT],
    };
  }
}
```

사용:

```typescript
// 동기
@Module({
  imports: [RedisModule.forRoot({ host: 'localhost', port: 6379 })],
})
export class AppModule {}

// 비동기 (ConfigService로부터 주입)
@Module({
  imports: [
    RedisModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        host: config.getOrThrow<string>('REDIS_HOST'),
        port: config.getOrThrow<number>('REDIS_PORT'),
      }),
      inject: [ConfigService],
    }),
  ],
})
export class AppModule {}
```

## ConfigurableModuleBuilder

NestJS 10에서 도입되어 11에서 안정화된 `ConfigurableModuleBuilder`는 위의 boilerplate를 자동 생성해 준다. 공식 문서가 권장하는 최신 방식이다.

```typescript
// src/modules/redis/redis.module-definition.ts
import { ConfigurableModuleBuilder } from '@nestjs/common';

export interface RedisModuleOptions {
  host: string;
  port: number;
  password?: string;
}

export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
  new ConfigurableModuleBuilder<RedisModuleOptions>()
    .setClassMethodName('forRoot') // register → forRoot
    .setExtras({ isGlobal: false }, (definition, extras) => ({
      ...definition,
      global: extras.isGlobal,
    }))
    .build();
```

```typescript
// src/modules/redis/redis.module.ts
import { Module } from '@nestjs/common';
import Redis from 'ioredis';
import {
  ConfigurableModuleClass,
  MODULE_OPTIONS_TOKEN,
  RedisModuleOptions,
} from './redis.module-definition';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (options: RedisModuleOptions) =>
        new Redis({ host: options.host, port: options.port, password: options.password }),
      inject: [MODULE_OPTIONS_TOKEN],
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule extends ConfigurableModuleClass {}
```

`ConfigurableModuleClass`를 상속하면 자동으로 `forRoot`와 `forRootAsync`(useFactory/useClass/useExisting 지원) 두 메서드가 모두 생긴다. 위 예시에 `setExtras`를 쓰면 consumer가 `{ isGlobal: true, host: ..., port: ... }` 형태로 global 여부도 함께 넘길 수 있다.

## Global Module

`@Global()` decorator는 모듈을 전역 scope로 만든다. 전역 모듈의 exported provider는 다른 모듈에서 `imports` 없이도 주입 가능하다.

```typescript
import { Global, Module } from '@nestjs/common';

@Global()
@Module({
  providers: [LoggerService],
  exports: [LoggerService],
})
export class LoggerModule {}
```

> **주의** (공식 문서 인용): *"Making everything global is not recommended as a design practice."* 전역 모듈을 남용하면 의존성이 숨어져 리팩터링이 어렵고, 순환 의존성을 디버깅할 때 원인 추적이 힘들다.
>
> **Core infra (Logger, Config, DB connection, Redis)**만 `@Global()`로 두고, 도메인 서비스는 명시적 `imports`로 관리하는 것이 원칙이다.

## Module Re-Exporting

한 모듈이 다른 모듈을 import 하면서 동시에 그 모듈 자체를 export 할 수 있다. 공식 문서 예시:

```typescript
// src/core/core.module.ts
@Module({
  imports: [CommonModule],
  exports: [CommonModule], // CoreModule을 import 하는 모듈은 CommonModule도 자동 사용 가능
})
export class CoreModule {}
```

dynamic module도 재수출 가능하며, 이 경우 `forRoot()` 호출을 다시 하지 않고 **클래스 자체**를 exports 에 넣는다:

```typescript
@Module({
  imports: [DatabaseModule.forRoot([User])],
  exports: [DatabaseModule], // forRoot 호출 없이
})
export class AppModule {}
```

## 권장 디렉토리 구조

Layered Architecture 원칙([../architecture.md](../architecture.md#1-layered-architecture-원칙))을 NestJS 모듈 시스템에 적용한 구조:

```
src/
├── main.ts                          # bootstrap 진입점
├── app.module.ts                    # root module
├── core/                            # 전역 infra (Global)
│   ├── core.module.ts
│   ├── config/
│   │   └── app-config.service.ts
│   ├── database/
│   │   ├── database.module.ts       # Drizzle 연결
│   │   └── database.providers.ts
│   ├── logger/
│   │   └── logger.module.ts         # nestjs-pino wrapping
│   └── health/
│       └── health.module.ts         # @nestjs/terminus
├── common/                          # 순수 공용 유틸 (Shared)
│   ├── decorators/
│   ├── filters/                     # global exception filter
│   ├── interceptors/                # timeout, transform
│   ├── pipes/
│   └── guards/
├── modules/                         # feature modules
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── strategies/
│   │   └── dto/
│   ├── users/
│   │   ├── users.module.ts
│   │   ├── users.controller.ts
│   │   ├── users.service.ts
│   │   ├── users.repository.ts
│   │   └── dto/
│   └── orders/
│       └── ...
└── shared/                          # 앱 전역 타입/유틸 (decorator 불필요)
    └── types/
```

**구조 원칙**:

- **`core/`**: 앱에 하나만 존재하는 infra. 대부분 `@Global()`.
- **`common/`**: 전역 filter/pipe/guard/interceptor 등 횡단 관심사. NestJS 공식 문서에서 권장하는 위치.
- **`modules/`**: 도메인별 feature module. 서로 명시적 `imports`로 참조.
- **`shared/`**: Pure TypeScript 타입, 상수. NestJS DI와 무관한 정적 코드만.

> **주의**: `common/`과 `shared/`를 혼동하지 말 것. `common/`은 NestJS decorator가 붙은 코드(`@Injectable`, `@Catch`), `shared/`는 순수 TS.

## 안티패턴

### 1. `providers` 배열에 넣고 `exports`를 빼먹기

```typescript
// ❌ UsersService를 다른 모듈에서 쓰려는데 exports 누락
@Module({
  providers: [UsersService],
  // exports: [UsersService], ← 없어서 외부 모듈이 주입 실패
})
export class UsersModule {}
```

결과: `Nest can't resolve dependencies of the OrdersService (?)` 에러. encapsulation이 동작 중이라는 신호다.

### 2. 모든 것을 `@Global()`로 선언

```typescript
// ❌ feature module까지 global로 만들면 의존성 그래프가 사라진다
@Global()
@Module({ /* UsersModule */ })
export class UsersModule {}
```

유지보수가 불가능해진다. `@Global()`은 **반드시 core infra에만** 사용하라.

### 3. `forRoot`와 `register`를 혼동

- 여러 번 다른 설정으로 부를 수 있는 모듈(`HttpModule`, `BullModule.registerQueue`)에 `forRoot`를 쓰면 혼동이 생긴다.
- 전역 singleton으로 한 번만 설정해야 하는 모듈(`TypeOrmModule`, `GraphQLModule`)에 `register`를 쓰면 역시 마찬가지.

공식 커뮤니티 가이드라인을 따라라.

### 4. root module에 모든 feature 직접 `providers`로 등록

```typescript
// ❌ 1000줄짜리 AppModule
@Module({
  controllers: [UsersController, OrdersController, PaymentsController, ...],
  providers: [UsersService, OrdersService, PaymentsService, ...],
})
export class AppModule {}
```

각 도메인을 별도 feature module로 분리하고 `imports`로 합쳐야 한다. 테스트 격리, lazy loading도 feature 분리 없이는 불가능.

### 5. 순환 참조를 `forwardRef`로 "임시 해결"

`forwardRef`는 탈출구이지 해결책이 아니다. 순환 참조는 도메인 경계 설계가 잘못됐다는 신호이니, 공통 로직을 별도 모듈로 추출하거나 event-driven으로 분리해야 한다. 자세한 판단 기준은 [./providers-di.md](./providers-di.md#circular-dependency-처리)에 있다.

## Related

- [../architecture.md](../architecture.md) — Framework-agnostic Layered Architecture, Service Layer Pattern
- [./providers-di.md](./providers-di.md) — `@Injectable`, custom provider, scope
- [./lifecycle-shutdown.md](./lifecycle-shutdown.md) — 모듈 lifecycle hook
- [./drizzle-integration.md](./drizzle-integration.md) — `core/database` 모듈 실제 구현
- [../fastify/architecture.md](../fastify/architecture.md) — Fastify plugin 기반 아키텍처 비교

## References (공식 문서)

- [NestJS Docs — Modules](https://docs.nestjs.com/modules) — `@Module`, providers/controllers/imports/exports, feature module, shared module, module re-exporting, `@Global()`, dynamic module 기본
- [NestJS Docs — Dynamic Modules](https://docs.nestjs.com/fundamentals/dynamic-modules) — `register` vs `forRoot` vs `forFeature` 커뮤니티 가이드라인, `ConfigurableModuleBuilder`, `setClassMethodName`, `setExtras`, async factory (`useFactory`/`useClass`/`useExisting`)
- [NestJS Docs — Custom Providers](https://docs.nestjs.com/fundamentals/custom-providers) — non-class token, `useFactory` 패턴
- [NestJS Sample — Dynamic Modules](https://github.com/nestjs/nest/tree/master/sample/25-dynamic-modules) — 공식 예제 코드
