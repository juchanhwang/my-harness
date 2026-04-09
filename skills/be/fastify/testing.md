# Fastify Testing

> 이 파일은 **Fastify 5** 전용 구현을 다룬다.
> Framework-agnostic 테스트 전략(테스트 피라미드, Unit vs Integration vs E2E, Test Doubles)은 [../testing.md](../testing.md)를 참조하라.

## 목차

1. [Integration Testing with `app.inject()`](#integration-testing-with-appinject)
2. [buildApp 패턴](#buildapp-패턴)
3. [인증 토큰 발급 테스트](#인증-토큰-발급-테스트)
4. [테스트 Setup/Teardown](#테스트-setupteardown)
5. [Related](#related)

## Integration Testing with `app.inject()`

Fastify의 `inject()`는 실제 TCP listen 없이 전체 스택(hooks, plugins, routes, serializer)을 실행하는 메소드다. **네트워크 overhead 없이** HTTP 요청을 시뮬레이션한다.

### 장점

* **빠르다** — 실제 소켓 open/close 없음
* **deterministic** — 포트 충돌 없음
* **전체 스택 검증** — validation, auth, error handler 모두 실행
* **Jest/Vitest 호환** — 비동기 API 그대로 사용 가능

### 기본 사용법

```typescript
// routes/users/users.integration.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildApp } from '../../app.js';
import { FastifyInstance } from 'fastify';

describe('Users API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ testing: true });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // 테스트 DB 클린업
    await app.db.delete(users);
  });

  describe('POST /api/v1/users', () => {
    it('should create a user', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/users',
        payload: {
          email: 'test@example.com',
          name: 'Test User',
          password: 'securePassword123',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.data.email).toBe('test@example.com');
      expect(body.data).not.toHaveProperty('passwordHash');
    });

    it('should return 409 for duplicate email', async () => {
      const payload = { email: 'dup@example.com', name: 'User', password: 'pass12345678' };

      await app.inject({ method: 'POST', url: '/api/v1/users', payload });
      const response = await app.inject({ method: 'POST', url: '/api/v1/users', payload });

      expect(response.statusCode).toBe(409);
      const body = response.json();
      expect(body.type).toContain('conflict');
    });

    it('should return 400 for invalid email', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/users',
        payload: { email: 'not-an-email', name: 'User', password: 'pass12345678' },
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
```

## buildApp 패턴

테스트와 실제 서버가 같은 Fastify 인스턴스 설정을 공유하도록 **factory 함수**로 분리한다:

```typescript
// app.ts
import Fastify, { FastifyInstance } from 'fastify';
import dbPlugin from './plugins/db.js';
import authPlugin from './plugins/auth.js';
import errorHandlerPlugin from './plugins/error-handler.js';
import userRoutes from './routes/users/index.js';

export interface BuildAppOptions {
  testing?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.testing ? false : { level: 'info' },
  });

  await app.register(dbPlugin);
  await app.register(authPlugin);
  await app.register(errorHandlerPlugin);
  await app.register(userRoutes, { prefix: '/api/v1/users' });

  return app;
}
```

```typescript
// server.ts — 실제 서버 시작
import { buildApp } from './app.js';

async function start() {
  const app = await buildApp();
  await app.listen({ port: 3000, host: '0.0.0.0' });
}

start();
```

이 패턴은 테스트에서 `buildApp({ testing: true })`로 인스턴스를 생성하고, `app.inject()`로 요청을 보낼 수 있게 한다.

## 인증 토큰 발급 테스트

`fastify.decorate('jwt', ...)`로 등록된 JWT plugin을 활용하여 테스트 중 토큰을 직접 발급한다:

```typescript
describe('GET /api/v1/users/:id (authenticated)', () => {
  it('should return user with valid token', async () => {
    // 유저 생성
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { email: 'auth@example.com', name: 'Auth User', password: 'pass12345678' },
    });
    const userId = createRes.json().data.id;

    // 토큰 발급 (app.jwt는 @fastify/jwt plugin이 decorate한 것)
    const token = app.jwt.sign({ sub: userId, role: 'user' });

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/users/${userId}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
  });

  it('should return 401 without token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/users/1',
    });

    expect(response.statusCode).toBe(401);
  });
});
```

> **`@fastify/jwt` plugin 설정**(secret, expiresIn, access/refresh token 전략)은 [./security.md](./security.md#authentication-via-fastifyjwt)에 정식 정의가 있다.

## 테스트 Setup/Teardown

### 생명주기

```typescript
beforeAll(async () => {
  app = await buildApp({ testing: true });
  await app.ready();  // 모든 plugin 초기화 완료 대기
});

afterAll(async () => {
  await app.close();  // graceful shutdown (DB connection 종료 등)
});

beforeEach(async () => {
  // 각 테스트 전 DB clean (순서 주의: FK 제약 역순)
  await app.db.delete(orderItems);
  await app.db.delete(orders);
  await app.db.delete(users);
});
```

핵심:
* **`app.ready()`** — 모든 plugin의 등록이 완료될 때까지 대기. `inject()` 전에 반드시 호출
* **`app.close()`** — `onClose` hook이 실행되며 DB pool, Redis 등 리소스 정리
* **beforeEach로 격리** — 각 테스트가 독립적으로 실행되도록 DB를 clean

### Test DB 설정

```typescript
// test/setup.ts
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

export async function setupTestDb() {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const db = drizzle(pool);

  // Migration 적용
  await migrate(db, { migrationsFolder: './drizzle' });

  return { pool, db };
}
```

> **Test Doubles 전략**(Stub/Mock/Spy/Fake)과 **외부 서비스 Mocking 원칙**은 [../testing.md](../testing.md#4-test-doubles-전략)에 정식 정의가 있다.

## Related

- [../testing.md](../testing.md) — 테스트 피라미드, Unit Testing, Test Doubles 전략
- [./architecture.md](./architecture.md) — `buildApp` factory 패턴, Fastify Plugin 아키텍처
- [./api-design.md](./api-design.md) — Route plugin 구조 (테스트 대상)
- [./security.md](./security.md) — `@fastify/jwt` 기반 토큰 발급
- [./error-handling.md](./error-handling.md) — 에러 응답 검증 (statusCode, type 확인)
