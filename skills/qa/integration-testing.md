# Integration Testing

> 참조: [Martin Fowler — IntegrationTest](https://martinfowler.com/bliki/IntegrationTest.html) · [Martin Fowler — TestDouble](https://martinfowler.com/bliki/TestDouble.html) (Stub, Mock, Fake, Dummy, Spy의 원전) · Gerard Meszaros, *xUnit Test Patterns* (Addison-Wesley, 2007) · [MSW 공식 문서](https://mswjs.io/docs/) · [Supertest](https://github.com/ladjs/supertest) · [Testcontainers](https://testcontainers.com/) (실제 DB 통합 테스트)

## 목차

1. [통합 테스트란](#통합-테스트란) — 단위 테스트와의 차이, "조립 후 오작동" 방어
2. [통합 테스트 전략](#통합-테스트-전략) — 범위·격리 수준·실행 환경
3. [API 통합 테스트](#api-통합-테스트) — Supertest, 요청/응답 검증
4. [데이터베이스 통합 테스트](#데이터베이스-통합-테스트) — 트랜잭션 롤백, 테스트 DB 관리
5. [테스트 더블 (Test Doubles)](#테스트-더블-test-doubles) — Stub, Mock, Fake, Dummy, Spy
6. [MSW (Mock Service Worker)로 외부 API 모킹](#msw-mock-service-worker로-외부-api-모킹)
7. [통합 테스트 체크리스트](#통합-테스트-체크리스트)

***

## 통합 테스트란

단위 테스트가 개별 함수/모듈을 격리해서 테스트한다면, 통합 테스트는 **여러 모듈이 함께 동작할 때** 올바르게 작동하는지 검증한다. "각 부품은 멀쩡한데 조립하면 안 돌아간다"를 잡아내는 테스트다.

## 통합 테스트 전략

### 무엇을 통합 테스트로?

| 테스트 대상    | 예시                             |
| --------- | ------------------------------ |
| API 엔드포인트 | HTTP 요청 → 핸들러 → DB → 응답        |
| 서비스 레이어   | 서비스 → 리포지토리 → DB               |
| 미들웨어 체인   | 인증 → 권한 → 핸들러                  |
| 이벤트 처리    | 이벤트 발행 → 핸들러 → 부수 효과           |
| 외부 API 연동 | 서비스 → HTTP 클라이언트 → 외부 API (모킹) |

### Big Bang vs Incremental

* **Big Bang**: 모든 모듈을 한꺼번에 통합. 실패 시 원인 찾기 어려움 ❌
* **Top-Down**: 상위 모듈부터 통합. 하위는 stub으로 대체
* **Bottom-Up**: 하위 모듈부터 통합. 상위는 driver로 대체
* **Sandwich**: Top-Down + Bottom-Up 동시. 중간 레이어에서 만남

**실무 추천**: Bottom-Up 또는 기능 단위 슬라이스. DB → Repository → Service → API 순서로 통합.

## API 통합 테스트

### 기본 패턴 (supertest + Express/Fastify)

```typescript
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { setupTestDB, teardownTestDB, seedTestData } from '../test/helpers';

describe('POST /api/users', () => {
  let app: Express;

  beforeAll(async () => {
    await setupTestDB();
    app = createApp();
  });

  afterAll(async () => {
    await teardownTestDB();
  });

  test('유효한 데이터로 사용자를 생성한다', async () => {
    const response = await request(app)
      .post('/api/users')
      .send({
        name: 'Alice',
        email: 'alice@test.com',
        password: 'SecurePass123!',
      })
      .expect(201);

    expect(response.body).toMatchObject({
      id: expect.any(String),
      name: 'Alice',
      email: 'alice@test.com',
    });
    expect(response.body).not.toHaveProperty('password');
  });

  test('중복 이메일은 409를 반환한다', async () => {
    await seedTestData({ users: [{ email: 'existing@test.com' }] });

    const response = await request(app)
      .post('/api/users')
      .send({
        name: 'Bob',
        email: 'existing@test.com',
        password: 'SecurePass123!',
      })
      .expect(409);

    expect(response.body.error).toBe('Email already exists');
  });

  test('유효하지 않은 이메일은 400을 반환한다', async () => {
    const response = await request(app)
      .post('/api/users')
      .send({
        name: 'Charlie',
        email: 'not-an-email',
        password: 'SecurePass123!',
      })
      .expect(400);

    expect(response.body.errors).toContainEqual(
      expect.objectContaining({ field: 'email' })
    );
  });

  test('인증 없이 보호된 엔드포인트 접근 시 401', async () => {
    await request(app)
      .get('/api/users/me')
      .expect(401);
  });
});
```

## 데이터베이스 통합 테스트

### 테스트 DB 설정

```typescript
// test/helpers/db.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

let pool: Pool;
let db: ReturnType<typeof drizzle>;

export async function setupTestDB() {
  pool = new Pool({
    connectionString: process.env.TEST_DATABASE_URL
      || 'postgresql://test:test@localhost:5432/testdb',
  });
  db = drizzle(pool);
  await migrate(db, { migrationsFolder: './drizzle' });
  return db;
}

export async function teardownTestDB() {
  await pool.end();
}

export async function cleanDB() {
  // 테스트 간 데이터 격리
  await db.execute(sql`TRUNCATE users, orders, products CASCADE`);
}
```

### 트랜잭션 롤백 패턴

```typescript
// 각 테스트를 트랜잭션으로 감싸고 롤백 — 빠르고 격리됨
import { beforeEach, afterEach } from 'vitest';

let tx: Transaction;

beforeEach(async () => {
  tx = await db.transaction();
});

afterEach(async () => {
  await tx.rollback();
});

test('사용자 생성이 DB에 저장된다', async () => {
  const repo = new UserRepository(tx);
  const user = await repo.create({ name: 'Alice', email: 'alice@test.com' });

  const found = await repo.findById(user.id);
  expect(found).toMatchObject({ name: 'Alice', email: 'alice@test.com' });
});
```

## 테스트 더블 (Test Doubles)

Martin Fowler와 Gerard Meszaros가 정리한 5가지 테스트 더블:

### 1. Dummy

전달만 되고 실제로 사용되지 않는 객체.

```typescript
// 파라미터를 채우기 위한 dummy
const dummyLogger = { log: () => {}, error: () => {} };
const service = new UserService(realRepo, dummyLogger);
```

### 2. Stub

미리 정해진 답을 반환하는 객체.

```typescript
const stubRepo = {
  findById: vi.fn().mockResolvedValue({
    id: '1', name: 'Alice', email: 'alice@test.com'
  }),
  findByEmail: vi.fn().mockResolvedValue(null), // 이메일 없음
};
```

### 3. Spy

호출 기록을 남기는 객체. 실제 동작도 수행.

```typescript
const emailSpy = vi.spyOn(emailService, 'send');
await userService.register({ email: 'test@test.com' });
expect(emailSpy).toHaveBeenCalledWith(expect.objectContaining({
  to: 'test@test.com',
  template: 'welcome',
}));
```

### 4. Mock

기대하는 호출을 미리 정의하고, 검증하는 객체.

```typescript
const mockPayment = vi.fn()
  .mockResolvedValueOnce({ success: true, transactionId: 'tx-123' })
  .mockRejectedValueOnce(new Error('Insufficient funds'));

// 첫 번째 호출 → 성공
await expect(processPayment(mockPayment, 10000)).resolves.toBeTruthy();
// 두 번째 호출 → 실패
await expect(processPayment(mockPayment, 10000)).rejects.toThrow();
```

### 5. Fake

실제 구현의 간소화 버전. 인메모리 DB가 대표적.

```typescript
class FakeUserRepository implements UserRepository {
  private users: Map<string, User> = new Map();

  async create(data: CreateUserInput): Promise<User> {
    const user = { id: crypto.randomUUID(), ...data, createdAt: new Date() };
    this.users.set(user.id, user);
    return user;
  }

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  async findByEmail(email: string): Promise<User | null> {
    return [...this.users.values()].find(u => u.email === email) || null;
  }
}
```

### 언제 어떤 더블을 쓸까?

| 더블    | 용도         | 단위 테스트 | 통합 테스트 |
| ----- | ---------- | :----: | :----: |
| Dummy | 파라미터 채우기   |    ✅   |    ✅   |
| Stub  | 간접 입력 제어   |    ✅   |    △   |
| Spy   | 간접 출력 검증   |    ✅   |    ✅   |
| Mock  | 행동 검증      |    ✅   |    △   |
| Fake  | 복잡한 의존성 대체 |    △   |    ✅   |

**통합 테스트에서는 가능한 실제 의존성을 쓴다.** 외부 API, 메일 서비스 등 제어 불가능한 것만 더블로 대체.

## MSW (Mock Service Worker)로 외부 API 모킹

```typescript
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

const server = setupServer(
  http.get('https://api.github.com/users/:username', ({ params }) => {
    return HttpResponse.json({
      login: params.username,
      id: 1,
      name: 'Test User',
    });
  }),

  http.post('https://api.stripe.com/v1/charges', () => {
    return HttpResponse.json({
      id: 'ch_test',
      amount: 10000,
      status: 'succeeded',
    });
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

test('GitHub 사용자 정보를 가져온다', async () => {
  const user = await githubService.getUser('octocat');
  expect(user.name).toBe('Test User');
});

// 에러 시뮬레이션
test('GitHub API 실패 시 적절히 처리한다', async () => {
  server.use(
    http.get('https://api.github.com/users/:username', () => {
      return HttpResponse.json({ message: 'Not Found' }, { status: 404 });
    })
  );

  await expect(githubService.getUser('nonexistent')).rejects.toThrow();
});
```

## 통합 테스트 체크리스트

* [ ] 실제 DB를 사용하는가 (인메모리 또는 테스트 전용)
* [ ] 테스트 간 데이터 격리가 되는가
* [ ] 해피 패스와 에러 케이스 모두 커버하는가
* [ ] 외부 API는 MSW 등으로 모킹하는가
* [ ] 인증/인가 플로우가 테스트되는가
* [ ] 응답 형태(schema)가 검증되는가
* [ ] 테스트가 CI에서 안정적으로 실행되는가