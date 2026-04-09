# NestJS + Drizzle ORM Integration

> 이 파일은 **NestJS 11 + Drizzle ORM** 통합 구현을 다룬다.
> Drizzle schema 정의, relation, query builder 기본 사용법은 [../drizzle-orm.md](../drizzle-orm.md)에 정식 정의가 있다. Transaction isolation level, connection pooling, migration 전략은 [../database.md](../database.md)를 참조하라.

## 목차

1. [통합 전략 개요](#통합-전략-개요)
2. [Drizzle Module 구현](#drizzle-module-구현)
3. [`DATABASE_CONNECTION` 토큰 주입](#database_connection-토큰-주입)
4. [Repository 패턴](#repository-패턴)
5. [Transaction 기본 사용](#transaction-기본-사용)
6. [Transaction Propagation via CLS](#transaction-propagation-via-cls)
7. [Connection Pool 설정](#connection-pool-설정)
8. [Migration Workflow (drizzle-kit)](#migration-workflow-drizzle-kit)
9. [`drizzle-zod`로 DTO/Schema 공유](#drizzle-zod로-dto-schema-공유)
10. [안티패턴](#안티패턴)
11. [Related](#related)
12. [References](#references-공식-문서)

> **Drizzle schema 정의, 쿼리 빌더, relation API, raw SQL 사용 기준**은 [../drizzle-orm.md](../drizzle-orm.md)에 정식 정의가 있다.
> **Transaction isolation level 선택 기준**은 [../database.md#6-transaction-isolation-levels](../database.md#6-transaction-isolation-levels)에 있다.
> 이 파일은 **NestJS DI 컨테이너와 Drizzle의 통합**에 집중한다.

## 통합 전략 개요

> **Known Limitation**: NestJS 공식 문서에는 Drizzle 전용 통합 페이지가 없다 (공식 문서는 TypeORM/Mongoose/Sequelize/Prisma만 다룸). 따라서 이 파일의 패턴은 NestJS 공식 [Custom Providers](https://docs.nestjs.com/fundamentals/custom-providers) 문서를 기반으로 구성한 **커뮤니티 권장 패턴**이다. Drizzle 공식 문서 또한 `drizzle()` factory 함수를 직접 사용하도록 안내하며, DI framework 통합은 각자에게 맡긴다.

NestJS에서 Drizzle을 통합하는 두 가지 접근:

1. **Direct connection 주입** — `DATABASE_CONNECTION` 토큰으로 Drizzle 인스턴스를 주입. 단순하고 명확.
2. **Repository 추상화** — Drizzle을 repository class 안에 숨기고 도메인 서비스는 repository만 주입. 테스트 용이.

이 문서는 **두 패턴을 함께 사용**하는 것을 권장한다. Drizzle 인스턴스는 한 곳(`DatabaseModule`)에만 있고, 도메인 레벨에서는 repository를 사용한다.

## Drizzle Module 구현

### Token 정의

```typescript
// src/core/database/database.tokens.ts
export const DATABASE_CONNECTION = Symbol('DATABASE_CONNECTION');
export const DATABASE_POOL = Symbol('DATABASE_POOL');
```

### Module 구현 (`@Global()` + async factory)

```typescript
// src/core/database/database.module.ts
import { Global, Module, OnApplicationShutdown, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { DATABASE_CONNECTION, DATABASE_POOL } from './database.tokens';
import * as schema from './schema';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: DATABASE_POOL,
      useFactory: (config: ConfigService): Pool => {
        return new Pool({
          connectionString: config.getOrThrow<string>('DATABASE_URL'),
          min: config.get<number>('DATABASE_POOL_MIN', 2),
          max: config.get<number>('DATABASE_POOL_MAX', 10),
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 5_000,
          allowExitOnIdle: false, // production에서 false (Node process 유지)
        });
      },
      inject: [ConfigService],
    },
    {
      provide: DATABASE_CONNECTION,
      useFactory: (pool: Pool): NodePgDatabase<typeof schema> => {
        return drizzle(pool, { schema });
      },
      inject: [DATABASE_POOL],
    },
  ],
  exports: [DATABASE_CONNECTION, DATABASE_POOL],
})
export class DatabaseModule implements OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseModule.name);

  constructor() {
    // Module 클래스는 provider를 직접 주입받을 수 없음.
    // Pool 종료는 별도 Service에서 처리하거나 module constructor에서 ModuleRef로 해결.
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log({ signal }, 'DatabaseModule shutdown hook invoked');
    // 실제 pool.end()는 아래 PoolLifecycleService에서 처리
  }
}
```

> **Note on module class hooks**: `@Module` 데코레이터가 붙은 클래스는 `constructor`에 provider를 주입할 수는 있지만, 복잡한 lifecycle 관리는 보통 별도 `@Injectable` 서비스로 분리하는 것이 깔끔하다. 아래 `PoolLifecycleService` 참조.

### Pool 종료 Service

```typescript
// src/core/database/pool-lifecycle.service.ts
import { Injectable, OnApplicationShutdown, Logger, Inject } from '@nestjs/common';
import type { Pool } from 'pg';
import { DATABASE_POOL } from './database.tokens';

@Injectable()
export class PoolLifecycleService implements OnApplicationShutdown {
  private readonly logger = new Logger(PoolLifecycleService.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log({ signal }, 'Closing database pool...');
    await this.pool.end();
    this.logger.log('Database pool closed');
  }
}
```

이 Service를 `DatabaseModule`의 `providers`에 추가:

```typescript
@Global()
@Module({
  providers: [
    /* ... 위의 두 provider */,
    PoolLifecycleService,
  ],
  exports: [DATABASE_CONNECTION, DATABASE_POOL],
})
export class DatabaseModule {}
```

> **중요**: `app.enableShutdownHooks()`가 호출되어야 `onApplicationShutdown`이 실행된다 ([./lifecycle-shutdown.md](./lifecycle-shutdown.md)).

## `DATABASE_CONNECTION` 토큰 주입

Service에서 Drizzle 인스턴스 주입:

```typescript
// src/modules/users/users.service.ts
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../../core/database/database.tokens';
import type * as schema from '../../core/database/schema';
import { users } from '../../core/database/schema';

type DbType = NodePgDatabase<typeof schema>;

@Injectable()
export class UsersService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DbType) {}

  async findById(id: string) {
    const [user] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return user ?? null;
  }
}
```

`NodePgDatabase<typeof schema>`로 타입을 고정하면 `db.query.users.findMany()` 같은 relational query API가 type-safe하게 동작한다.

## Repository 패턴

도메인 service가 Drizzle을 직접 다루면 테스트가 어렵고 SRP 위반이다. Repository로 한 겹 감싼다.

```typescript
// src/modules/users/users.repository.ts
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../../core/database/database.tokens';
import * as schema from '../../core/database/schema';
import { users } from '../../core/database/schema';

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

@Injectable()
export class UsersRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async findById(id: string): Promise<User | null> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return user ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return user ?? null;
  }

  async create(data: NewUser): Promise<User> {
    const [created] = await this.db.insert(users).values(data).returning();
    if (!created) {
      throw new Error('Insert returned no rows');
    }
    return created;
  }
}
```

```typescript
// src/modules/users/users.module.ts
import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';

@Module({
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
  exports: [UsersService],
})
export class UsersModule {}
```

> `DatabaseModule`이 `@Global()`이므로 `UsersModule.imports`에 포함할 필요 없다. 전역 토큰으로 `@Inject(DATABASE_CONNECTION)` 주입이 바로 동작한다.

## Transaction 기본 사용

Drizzle의 `transaction()` 메서드는 callback을 받고, 내부에서 같은 인터페이스의 `tx` 객체를 제공한다 ([../drizzle-orm.md](../drizzle-orm.md) 참조).

```typescript
// 단순한 경우 — service 메서드 안에서 직접 트랜잭션
@Injectable()
export class OrdersService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async createOrder(userId: string, amount: number): Promise<Order> {
    return this.db.transaction(async (tx) => {
      const [order] = await tx
        .insert(orders)
        .values({ userId, amount, status: 'pending' })
        .returning();

      await tx
        .update(users)
        .set({ totalSpent: sql`${users.totalSpent} + ${amount}` })
        .where(eq(users.id, userId));

      return order!;
    });
  }
}
```

### Isolation Level 명시

```typescript
await this.db.transaction(
  async (tx) => {
    // ...
  },
  {
    isolationLevel: 'serializable', // PostgreSQL: 'read committed' (default), 'repeatable read', 'serializable'
    accessMode: 'read write',
    deferrable: false,
  },
);
```

> **Isolation level 선택 기준**은 [../database.md#6-transaction-isolation-levels](../database.md#6-transaction-isolation-levels)에 정식 정의가 있다. 돈 관련 연산은 `serializable`, 일반 CRUD는 기본 `read committed`.

## Transaction Propagation via CLS

**문제**: service A가 transaction을 시작하고, 내부에서 service B의 메서드를 호출하면, service B는 **자신의 `this.db`를 쓰므로 같은 트랜잭션에 참여하지 않는다**. 매 호출마다 `tx`를 명시적으로 인자로 넘기는 건 지저분하다.

**해결**: `nestjs-cls` + `@nestjs-cls/transactional` 플러그인으로 AsyncLocalStorage 기반 전파.

### 설치

```bash
npm i nestjs-cls @nestjs-cls/transactional @nestjs-cls/transactional-adapter-pg
```

### Module 설정

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { ClsModule } from 'nestjs-cls';
import { ClsPluginTransactional } from '@nestjs-cls/transactional';
import { TransactionalAdapterPg } from '@nestjs-cls/transactional-adapter-pg';
import { DATABASE_POOL } from './core/database/database.tokens';

@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
      plugins: [
        new ClsPluginTransactional({
          imports: [DatabaseModule],
          adapter: new TransactionalAdapterPg({
            poolToken: DATABASE_POOL,
          }),
        }),
      ],
    }),
  ],
})
export class AppModule {}
```

### 사용

```typescript
import { Transactional } from '@nestjs-cls/transactional';

@Injectable()
export class OrdersService {
  constructor(
    private readonly ordersRepo: OrdersRepository,
    private readonly usersRepo: UsersRepository,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Transactional()
  async createOrder(userId: string, amount: number): Promise<Order> {
    const order = await this.ordersRepo.create({ userId, amount, status: 'pending' });
    await this.usersRepo.incrementSpent(userId, amount);
    await this.notificationsService.sendOrderCreated(order); // 다른 service도 같은 tx 참여
    return order;
  }
}
```

`@Transactional()`로 감싼 메서드 안에서 모든 repository 호출은 **자동으로 같은 트랜잭션에 참여**한다. 각 repository는 `TransactionHost`를 통해 현재 active tx를 가져온다.

> **Known Limitation**: `@nestjs-cls/transactional-adapter-pg`는 `pg` 패키지의 `Pool`을 직접 사용하는 adapter이다. Drizzle ORM을 통한 쿼리도 내부적으로 같은 pool을 사용하지만, Drizzle이 제공하는 type-safe API를 쓰려면 adapter가 제공하는 `TransactionHost<TransactionalAdapterPg>.tx`를 Drizzle 인스턴스로 한 번 더 감싸는 wrapper가 필요할 수 있다. 구체 구현은 `@nestjs-cls/transactional` 공식 문서와 Drizzle 커뮤니티 예제를 참조하라.
>
> 대안: 트랜잭션을 명시적으로 매개변수로 전달하는 "explicit transaction" 패턴도 충분히 실용적이다. 트랜잭션 범위가 크지 않으면 명시성이 오히려 읽기 쉽다.

### 대안: 명시적 transaction 전달

```typescript
// Repository가 tx를 선택적으로 받음
async create(data: NewOrder, tx?: DbType): Promise<Order> {
  const executor = tx ?? this.db;
  const [created] = await executor.insert(orders).values(data).returning();
  return created!;
}

// Service
async createOrder(userId: string, amount: number): Promise<Order> {
  return this.db.transaction(async (tx) => {
    const order = await this.ordersRepo.create({ userId, amount }, tx);
    await this.usersRepo.incrementSpent(userId, amount, tx);
    return order;
  });
}
```

## Connection Pool 설정

> **Pool tuning 원칙**(max connections, idle timeout, PgBouncer와의 관계)은 [../database.md#5-connection-pooling](../database.md#5-connection-pooling)에 정식 정의가 있다.

프로덕션 권장 설정:

```typescript
new Pool({
  connectionString: config.getOrThrow('DATABASE_URL'),
  // 풀 크기 — PostgreSQL max_connections / 앱 인스턴스 수 고려
  min: 2,
  max: 10,
  // Idle connection이 30초 동안 사용 안 되면 pool에서 제거
  idleTimeoutMillis: 30_000,
  // Pool에서 connection 획득 대기 시간 (초과 시 에러)
  connectionTimeoutMillis: 5_000,
  // Node process가 idle connection 때문에 종료되지 못하는 것을 방지
  allowExitOnIdle: false,
  // 통계 정보 (선택)
  statement_timeout: 10_000, // 10초 이상 걸리는 쿼리 자동 취소
  query_timeout: 10_000,
});
```

> Railway/Vercel/Supabase에서는 **PgBouncer** 뒤에 두고 connection pool을 transaction-mode로 설정하는 것이 일반적이다. 이때는 prepared statement가 동작하지 않을 수 있으므로 Drizzle 측에서 `prepare: false` 옵션을 확인하라.

## Migration Workflow (drizzle-kit)

> **Migration 전략, backward compatibility, zero-downtime 원칙**은 [../drizzle-orm.md#4-migration-workflow](../drizzle-orm.md#4-migration-workflow)와 [../database.md#4-migration-strategy-drizzle-kit](../database.md#4-migration-strategy-drizzle-kit)에 정식 정의가 있다.

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/core/database/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
});
```

`package.json` 스크립트:

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  }
}
```

### Migration 실행 (CI/CD)

`db:migrate`는 **배포 파이프라인**에서 앱 시작 전에 실행한다. NestJS 앱 안에서 실행하지 마라. 이유:

- 여러 replica가 동시에 migration을 실행하면 race condition
- Migration 실패 시 앱이 restart loop에 빠짐
- Rollback이 어려워짐

```yaml
# 예: Railway 배포 시 release phase
# railway.toml
[deploy]
startCommand = "npm run db:migrate && npm run start:prod"
```

## `drizzle-zod`로 DTO/Schema 공유

Drizzle schema에서 Zod schema를 자동 생성해 DTO 중복을 줄인다.

```bash
npm i drizzle-zod zod
```

```typescript
// src/modules/users/dto/user.schema.ts
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { users } from '../../../core/database/schema';

export const insertUserSchema = createInsertSchema(users, {
  email: z.string().email(),
  name: z.string().min(2).max(50),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectUserSchema = createSelectSchema(users).omit({
  password: true, // Response에서 제외
});

export type CreateUserInput = z.infer<typeof insertUserSchema>;
export type UserPublic = z.infer<typeof selectUserSchema>;
```

> **주의**: `class-validator` 기반 DTO와 Zod schema 기반 DTO는 ValidationPipe에서 다르게 처리된다. NestJS `ValidationPipe`는 class-validator 전용이므로, Zod를 쓰려면 `ZodValidationPipe` (커뮤니티 라이브러리 `nestjs-zod`) 또는 커스텀 pipe가 필요하다. 프로젝트 일관성상 **class-validator를 기본으로 하고 Drizzle schema는 DB 타입 생성에만 쓰는 것이 단순**하다.

## 안티패턴

### 1. Service에 `pg.Pool` 직접 주입

```typescript
// ❌ raw pool을 서비스가 직접 다룸
@Injectable()
export class UsersService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}
  async findById(id: string) {
    const result = await this.pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows[0];
  }
}
```

Drizzle의 type safety를 잃는다. `DATABASE_CONNECTION`(Drizzle 인스턴스)을 주입하고, raw SQL이 필요하면 `sql` template literal을 써라.

### 2. 매 요청마다 새 Drizzle 인스턴스 생성

```typescript
// ❌ 요청마다 drizzle() 호출 — 성능 최악
@Injectable()
export class BadService {
  getDb() {
    return drizzle(this.pool);
  }
}
```

`drizzle()` factory는 bootstrap 시 한 번만 호출하고 singleton으로 재사용하라.

### 3. Transaction 안에서 HTTP 호출

```typescript
// ❌ 외부 API 호출이 transaction lock을 잡고 있음 → DB connection 소진
await this.db.transaction(async (tx) => {
  await tx.insert(orders).values(data);
  await fetch('https://payment.example.com/charge', { /* ... */ }); // DB lock 유지
});
```

외부 API 호출은 transaction 밖에서 하고, 실패 시 compensating transaction으로 복구한다. 자세한 내용은 [../distributed-systems.md#idempotency-설계](../distributed-systems.md#idempotency-설계) 참조.

### 4. Migration을 앱 부트스트랩에서 실행

```typescript
// ❌ main.ts에서 migration 실행
await migrate(db, { migrationsFolder: './drizzle' });
```

여러 replica 동시 실행, rollback 불가 등 문제 발생. 배포 파이프라인의 release phase에서 한 번만 실행하라.

### 5. Pool 종료 hook 누락

```typescript
// ❌ 프로세스 종료 시 open connection이 남음
@Module({ providers: [ /* pool provider */ ] })
export class DatabaseModule {}  // OnApplicationShutdown 없음
```

SIGTERM 시 pool.end()가 호출되지 않으면 connection leak이 발생한다. `PoolLifecycleService`를 반드시 구현하라.

### 6. `schema`를 `drizzle()` 호출에 전달하지 않음

```typescript
// ❌ db.query.users가 동작하지 않음
drizzle(pool) // schema 인자 누락
```

```typescript
// ✅
drizzle(pool, { schema })
```

`schema`를 전달해야 Drizzle의 relational query API(`db.query.table.findMany()` 등)가 활성화된다.

## Related

- [../drizzle-orm.md](../drizzle-orm.md) — Drizzle schema 정의, relation, 쿼리 빌더 기본
- [../database.md](../database.md) — Connection pooling, transaction isolation, migration 전략
- [./providers-di.md](./providers-di.md) — `useFactory`, Symbol 토큰, `@Global()`
- [./architecture.md](./architecture.md) — Core module 배치
- [./lifecycle-shutdown.md](./lifecycle-shutdown.md) — `enableShutdownHooks()` + pool.end()
- [./testing.md](./testing.md) — DB 테스트 (transaction rollback)
- [./observability.md](./observability.md#custom-health-indicator) — Drizzle health indicator
- [../distributed-systems.md#idempotency-설계](../distributed-systems.md#idempotency-설계) — 트랜잭션과 외부 API 호출 분리

## References (공식 문서)

- [NestJS Docs — Custom Providers](https://docs.nestjs.com/fundamentals/custom-providers) — `useFactory`, `inject`, Symbol 토큰 (Drizzle integration의 기반)
- [Drizzle ORM — Getting Started with PostgreSQL](https://orm.drizzle.team/docs/get-started-postgresql) — `drizzle()` factory, `node-postgres` driver
- [Drizzle ORM — Transactions](https://orm.drizzle.team/docs/transactions) — `db.transaction()`, isolation level, nested transaction (savepoint)
- [Drizzle ORM — drizzle-kit CLI](https://orm.drizzle.team/docs/kit-overview) — `generate`, `migrate`, `push`, `studio` 명령
- [nestjs-cls (GitHub)](https://github.com/Papooch/nestjs-cls) — AsyncLocalStorage 기반 CLS, `@Transactional()` plugin
- [node-postgres — Pool](https://node-postgres.com/apis/pool) — Pool 옵션 (min/max/idleTimeoutMillis 등)
- [drizzle-zod](https://orm.drizzle.team/docs/zod) — `createInsertSchema`, `createSelectSchema`
