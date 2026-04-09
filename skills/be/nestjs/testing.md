# NestJS Testing

> 이 파일은 **NestJS 11 + Vitest** 전용 구현을 다룬다.
> Framework-agnostic 테스트 전략(피라미드, test doubles, CI 통합)은 [../testing.md](../testing.md)에 정식 정의가 있다.

## 목차

1. [Vitest로 NestJS 테스트하기](#vitest로-nestjs-테스트하기)
2. [`Test.createTestingModule()`](#testcreatetestingmodule)
3. [Service 단위 테스트](#service-단위-테스트)
4. [Controller 단위 테스트](#controller-단위-테스트)
5. [`overrideProvider` — Mock 주입](#overrideprovider--mock-주입)
6. [Guard/Interceptor/Pipe/Filter Override](#guardinterceptorpipefilter-override)
7. [E2E 테스트 (Supertest)](#e2e-테스트-supertest)
8. [Integration 테스트 (DB transaction rollback)](#integration-테스트-db-transaction-rollback)
9. [Request-scoped Provider 테스트](#request-scoped-provider-테스트)
10. [Auto-mocking](#auto-mocking)
11. [안티패턴](#안티패턴)
12. [Related](#related)
13. [References](#references-공식-문서)

> **테스트 피라미드**(Unit/Integration/E2E 비율), **Test Doubles 분류**(stub/mock/fake/spy), **CI 통합 전략**은 [../testing.md](../testing.md)에 정식 정의가 있다.
> 이 파일은 NestJS `@nestjs/testing` 패키지 + Vitest 통합에 집중한다.

## Vitest로 NestJS 테스트하기

NestJS 공식 문서는 Jest를 기본으로 사용하지만, 프로젝트 stack은 Vitest다. `@nestjs/testing`은 test runner에 agnostic하므로 Vitest로도 완벽히 동작한다 (공식 인용: *"you can use any testing framework that you like, as Nest doesn't force any specific tooling"*).

### 설정

```bash
npm i -D vitest @vitest/coverage-v8 @nestjs/testing supertest @types/supertest
```

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{spec,test}.ts', 'test/**/*.e2e-spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: [
        '**/*.module.ts',
        '**/*.dto.ts',
        '**/main.ts',
        '**/index.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
  plugins: [
    // NestJS는 decorator metadata가 필요하므로 SWC transform 필요
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
});
```

> **왜 SWC?** NestJS는 `emitDecoratorMetadata`(reflection)에 의존한다. Vitest의 기본 esbuild transform은 이를 지원하지 않으므로 [공식 recipe](https://docs.nestjs.com/recipes/swc)에서도 권장하는 `unplugin-swc`를 사용한다. `tsconfig.json`에 `emitDecoratorMetadata: true`, `experimentalDecorators: true`도 필수.

### Jest → Vitest API 매핑

NestJS 공식 문서의 Jest 예시를 Vitest로 옮길 때 필요한 것:

| Jest | Vitest |
|---|---|
| `jest.fn()` | `vi.fn()` |
| `jest.spyOn()` | `vi.spyOn()` |
| `jest.mock()` | `vi.mock()` |
| `jest.clearAllMocks()` | `vi.clearAllMocks()` |
| `jest.resetAllMocks()` | `vi.resetAllMocks()` |

`describe`, `it`, `expect`, `beforeEach` 등은 동일.

## `Test.createTestingModule()`

공식 문서에서 핵심 유틸. 공식 인용: *"The `Test` class is useful for providing an application execution context that essentially mocks the full Nest runtime, but gives you hooks that make it easy to manage class instances, including mocking and overriding."*

```typescript
import { Test, TestingModule } from '@nestjs/testing';

const moduleRef: TestingModule = await Test.createTestingModule({
  controllers: [CatsController],
  providers: [CatsService],
}).compile();

const controller = moduleRef.get<CatsController>(CatsController);
const service = moduleRef.get<CatsService>(CatsService);
```

**핵심 메서드**:

- `.compile()` — module을 bootstrap. async.
- `.get(Token)` — static(singleton) instance 획득. 공식 인용: *"the important one is the `compile()` method. This method bootstraps a module with its dependencies."*
- `.resolve(Token)` — request/transient scope instance 획득 (아래 참조).
- `.overrideProvider(Token).useValue(mock)` — provider 교체.
- `.overrideGuard(Guard).useValue(mock)` — guard 교체.
- `.overrideInterceptor(...)`, `.overridePipe(...)`, `.overrideFilter(...)`, `.overrideModule(...)` — 동일한 override 패턴.
- `.createNestApplication()` — E2E용 `INestApplication` 생성.

## Service 단위 테스트

```typescript
// src/modules/users/users.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersService } from './users.service';
import { UsersRepository, type User } from './users.repository';

describe('UsersService', () => {
  let service: UsersService;
  let repo: UsersRepository;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: UsersRepository,
          useValue: {
            findById: vi.fn(),
            findByEmail: vi.fn(),
            create: vi.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(UsersService);
    repo = moduleRef.get(UsersRepository);
  });

  describe('findOne', () => {
    it('returns the user when found', async () => {
      const user: User = {
        id: 'u1',
        email: 'a@b.c',
        name: 'A',
        password: 'x',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.spyOn(repo, 'findById').mockResolvedValue(user);

      const result = await service.findOne('u1');

      expect(result).toBe(user);
      expect(repo.findById).toHaveBeenCalledWith('u1');
    });

    it('throws NotFoundException when user does not exist', async () => {
      vi.spyOn(repo, 'findById').mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });
});
```

**핵심**:

- `UsersRepository`는 `useValue`로 object literal mock 주입.
- 각 메서드는 `vi.fn()`으로 spy. `mockResolvedValue`로 반환 설정.
- `vi.spyOn`으로 개별 test마다 동작 변경.

## Controller 단위 테스트

```typescript
// src/modules/cats/cats.controller.spec.ts
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CatsController } from './cats.controller';
import { CatsService } from './cats.service';
import type { Cat } from './cat.interface';

describe('CatsController', () => {
  let controller: CatsController;
  let service: CatsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CatsController],
      providers: [
        {
          provide: CatsService,
          useValue: {
            findAll: vi.fn(),
            create: vi.fn(),
          },
        },
      ],
    }).compile();

    controller = moduleRef.get(CatsController);
    service = moduleRef.get(CatsService);
  });

  it('findAll returns all cats', async () => {
    const cats: Cat[] = [{ name: 'Kitty', age: 3, breed: 'Persian' }];
    vi.spyOn(service, 'findAll').mockResolvedValue(cats);

    const result = await controller.findAll();

    expect(result).toEqual(cats);
  });
});
```

## `overrideProvider` — Mock 주입

실제 module import 후 특정 provider만 mock으로 교체:

```typescript
const moduleRef = await Test.createTestingModule({
  imports: [UsersModule], // 실제 모듈
})
  .overrideProvider(UsersRepository)
  .useValue({ findById: vi.fn() })
  .compile();
```

공식 문서에 따르면 세 가지 override 방식이 있다 (공식 인용):

- `.useClass(AnotherClass)` — 대체 클래스를 instantiate
- `.useValue(instance)` — 이미 만들어진 instance/object 사용
- `.useFactory((inject) => { ... })` — factory function

## Guard/Interceptor/Pipe/Filter Override

### 개별 컴포넌트 override

```typescript
const moduleRef = await Test.createTestingModule({
  imports: [AppModule],
})
  .overrideGuard(JwtAuthGuard)
  .useValue({ canActivate: () => true }) // 항상 통과
  .overridePipe(ValidationPipe)
  .useValue({ transform: (val: unknown) => val })
  .compile();
```

### Globally registered enhancer override (공식 주의점)

공식 문서 인용: *"If you have a globally registered guard (or pipe, interceptor, or filter), you need to take a few more steps to override that enhancer."*

문제: `APP_GUARD` 토큰으로 등록된 guard는 `useClass`를 사용하면 Nest가 내부에서 새 인스턴스를 만들어 `overrideProvider`로 교체 불가. 해결: `useExisting`으로 변경.

```typescript
// src/app.module.ts — 수정 후
providers: [
  {
    provide: APP_GUARD,
    useExisting: JwtAuthGuard, // useClass가 아니라 useExisting
  },
  JwtAuthGuard, // 별도 provider로 등록
],
```

이렇게 하면 테스트에서 교체 가능:

```typescript
const moduleRef = await Test.createTestingModule({
  imports: [AppModule],
})
  .overrideProvider(JwtAuthGuard)
  .useClass(MockAuthGuard)
  .compile();
```

## E2E 테스트 (Supertest)

공식 문서 패턴. `createNestApplication()`으로 완전한 Nest runtime을 띄우고 supertest로 HTTP 호출.

```typescript
// test/cats.e2e-spec.ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { CatsService } from '../src/modules/cats/cats.service';

describe('Cats (e2e)', () => {
  let app: INestApplication;
  const mockCatsService = {
    findAll: () => [{ name: 'Kitty', age: 3, breed: 'Persian' }],
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CatsService)
      .useValue(mockCatsService)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /cats returns cats array', async () => {
    const response = await request(app.getHttpServer()).get('/cats').expect(200);
    expect(response.body).toEqual(mockCatsService.findAll());
  });

  it('POST /cats with invalid body returns 400', async () => {
    await request(app.getHttpServer())
      .post('/cats')
      .send({ name: 123 }) // age, breed 누락 + name 타입 에러
      .expect(400);
  });
});
```

> **Fastify Adapter E2E**: 공식 문서 인용 — Fastify를 쓰면 `createNestApplication<NestFastifyApplication>(new FastifyAdapter())`로 생성하고, `await app.getHttpAdapter().getInstance().ready();`를 호출해야 한다. 그 후 `app.inject({ method, url })`로 요청 가능. 이 파일은 Express adapter 기준 예시.

## Integration 테스트 (DB transaction rollback)

실제 DB에 붙되, 테스트마다 transaction으로 감싸고 마지막에 rollback 하는 패턴. 빠르고 격리성이 높다.

```typescript
// test/integration/users-repository.integration.spec.ts
import { Test } from '@nestjs/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION, DATABASE_POOL } from '../../src/core/database/database.tokens';
import * as schema from '../../src/core/database/schema';
import { UsersRepository } from '../../src/modules/users/users.repository';

describe('UsersRepository (integration)', () => {
  let pool: Pool;
  let db: NodePgDatabase<typeof schema>;
  let repo: UsersRepository;

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    db = drizzle(pool, { schema });

    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersRepository,
        { provide: DATABASE_CONNECTION, useValue: db },
        { provide: DATABASE_POOL, useValue: pool },
      ],
    }).compile();

    repo = moduleRef.get(UsersRepository);
  });

  afterEach(async () => {
    // 각 test 후 테이블 truncate (또는 transaction rollback 패턴)
    await db.execute(/* sql */ `TRUNCATE TABLE users RESTART IDENTITY CASCADE`);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('create + findByEmail round trip', async () => {
    const created = await repo.create({
      email: 'test@example.com',
      name: 'Test',
      password: 'hashed',
    });
    expect(created.email).toBe('test@example.com');

    const found = await repo.findByEmail('test@example.com');
    expect(found?.id).toBe(created.id);
  });
});
```

> **CI 전략**: Integration test는 docker-compose로 PostgreSQL을 띄우고, `TEST_DATABASE_URL`로 격리된 DB를 사용한다. Unit test와 분리 실행(`vitest --project integration`)해서 CI 속도를 유지한다.
>
> **Transaction rollback 패턴의 한계**: 테스트 내부에서 이미 transaction을 시작하는 service를 테스트할 때는 "nested transaction"이 필요하며, PostgreSQL에서는 `SAVEPOINT`로 처리할 수 있다. 자세한 내용은 [../testing.md#3-integration-testing-전략](../testing.md#3-integration-testing-전략) 참조.

## Request-scoped Provider 테스트

공식 문서의 까다로운 케이스. Request-scoped provider는 매 요청마다 새 instance가 생성되므로 DI sub-tree가 별도다. 테스트에서는 `ContextIdFactory`를 spy 해서 동일한 context id를 사용하도록 강제한다.

```typescript
import { ContextIdFactory } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('RequestScopedService', () => {
  let moduleRef: TestingModule;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [RequestScopedService /* scope: REQUEST */],
    }).compile();
  });

  it('retrieves the same instance within a single context', async () => {
    const contextId = ContextIdFactory.create();
    vi.spyOn(ContextIdFactory, 'getByRequest').mockImplementation(() => contextId);

    const instance1 = await moduleRef.resolve(RequestScopedService, contextId);
    const instance2 = await moduleRef.resolve(RequestScopedService, contextId);

    expect(instance1).toBe(instance2);
  });
});
```

> **공식 경고 인용**: *"The `resolve()` method returns a unique instance of the provider, from its own DI container sub-tree. Each sub-tree has a unique context identifier. Thus, if you call this method more than once and compare instance references, you will see that they are not equal."* 그래서 `contextId`를 명시적으로 넘겨야 한다.

## Auto-mocking

의존성이 많을 때 모두 수동으로 mock 하는 건 지저분하다. `useMocker`로 일괄 처리.

```typescript
import { ModuleMocker, MockMetadata } from 'jest-mock'; // Vitest에서도 사용 가능

const moduleMocker = new ModuleMocker(global);

beforeEach(async () => {
  const moduleRef = await Test.createTestingModule({
    controllers: [CatsController],
  })
    .useMocker((token) => {
      if (token === CatsService) {
        return { findAll: vi.fn().mockResolvedValue(['test']) };
      }
      if (typeof token === 'function') {
        const mockMetadata = moduleMocker.getMetadata(token) as MockMetadata<unknown, unknown>;
        const Mock = moduleMocker.generateFromMetadata(mockMetadata) as new () => unknown;
        return new Mock();
      }
    })
    .compile();
});
```

> **공식 Hint**: *"`REQUEST` and `INQUIRER` providers cannot be auto-mocked because they're already pre-defined in the context."*

## 안티패턴

### 1. 실제 DB/Redis를 unit test에서 사용

```typescript
// ❌ unit test라면서 실제 DB 연결
it('creates user', async () => {
  const user = await realDb.insert(users).values({ ... });
});
```

Unit test는 모든 외부 의존성을 mock 해야 한다. DB가 필요하면 **integration test**로 분리하라.

### 2. Mock을 다른 test로 전파

```typescript
// ❌ beforeEach에서 clearAllMocks 호출 안 함
beforeEach(async () => {
  moduleRef = await Test.createTestingModule({ ... }).compile();
  // vi.clearAllMocks() 누락
});
```

test 간 mock state가 누수된다. `beforeEach`에 `vi.clearAllMocks()` 또는 Vitest config에 `clearMocks: true`.

### 3. E2E test에서 `app.close()` 누락

```typescript
// ❌ afterAll에서 app.close() 호출 안 함
afterAll(() => {
  // 빈 함수
});
```

HTTP server가 열린 채 다음 test suite로 넘어가면 port 충돌, connection 누수. 반드시 `await app.close()`.

### 4. Global ValidationPipe 누락한 E2E test

```typescript
// ❌ production과 다른 behavior 테스트 중
beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
  // useGlobalPipes 누락 → validation이 동작 안 함 → production과 결과가 다름
});
```

E2E는 반드시 `main.ts`와 **동일한 설정**을 적용하라. `useGlobalPipes`, `useGlobalFilters`, `enableVersioning` 등. 아니면 production 버그를 테스트가 못 잡는다.

### 5. Service 테스트에서 controller decorator 테스트

```typescript
// ❌ @Get() 같은 decorator가 붙었는지 확인
expect(Reflect.getMetadata('path', SomeController.prototype.findAll)).toBe('');
```

이건 NestJS framework 내부 동작을 테스트하는 것이지 내 코드를 테스트하는 것이 아니다. 대신 **E2E로 `GET /cats`가 200을 반환하는지** 확인하라.

### 6. Mock factory를 모든 spec에서 복붙

```typescript
// ❌ 100개 spec 파일에 같은 mockUsersRepository가 복사됨
const mockUsersRepository = { findById: vi.fn(), ... };
```

공용 mock builder는 `test/mocks/` 디렉토리에 만들어 재사용하라. 다만 너무 과하게 추상화하면 test의 의도가 흐려지므로 적당히.

## Related

- [../testing.md](../testing.md) — Test pyramid, Unit/Integration/E2E 비율, Test Doubles 분류
- [./providers-di.md](./providers-di.md#custom-provider-4가지) — `useValue`, `useClass`, `useFactory`
- [./drizzle-integration.md](./drizzle-integration.md) — DB test 연결 설정
- [./request-lifecycle.md](./request-lifecycle.md#global-component-등록-방식) — `APP_GUARD` 등록 방식과 override
- [../fastify/testing.md](../fastify/testing.md) — Fastify `inject()` 기반 비교

## References (공식 문서)

- [NestJS Docs — Testing](https://docs.nestjs.com/fundamentals/testing) — `Test.createTestingModule()`, `.compile()`, `.get()`/`.resolve()`, `overrideProvider/Guard/Interceptor/Pipe/Filter/Module`, `useValue/useClass/useFactory`, E2E with Supertest, `createNestApplication()`, auto-mocking (`useMocker`), request-scoped test (`ContextIdFactory.getByRequest` spy), globally registered enhancer override (`useExisting` 트릭)
- [NestJS Docs — SWC Recipe](https://docs.nestjs.com/recipes/swc) — SWC compiler 사용 (Vitest와 호환)
- [Supertest](https://github.com/ladjs/supertest) — HTTP assertion library
- [Vitest](https://vitest.dev/) — Jest 호환 API, `vi.fn()`, `vi.spyOn()`, coverage
- [unplugin-swc](https://github.com/unplugin/unplugin-swc) — Vitest + SWC + decorator metadata 지원
