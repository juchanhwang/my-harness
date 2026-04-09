# Fastify Resilience

> 이 파일은 **Fastify 5** 전용 구현을 다룬다.
> Framework-agnostic 복원력 패턴 이론(Circuit Breaker, Retry, Bulkhead, Timeout, Chaos Engineering)은 [../resilience.md](../resilience.md)를 참조하라.

## 목차

1. [Graceful Shutdown with Fastify](#graceful-shutdown-with-fastify)
2. [Signal Handler 통합](#signal-handler-통합)
3. [onClose Hook](#onclose-hook)
4. [Circuit Breaker를 decorator로 등록](#circuit-breaker를-decorator로-등록)
5. [Related](#related)

## Graceful Shutdown with Fastify

`fastify.close()`는 Fastify의 **공식 graceful shutdown 메소드**로, 다음을 수행한다:

1. **새 요청 거부** — HTTP server가 새 connection을 accept하지 않음
2. **진행 중 요청 완료 대기** — 기존 요청은 정상 처리됨
3. **`onClose` hook 실행** — 등록된 모든 `onClose` hook이 역순으로 실행
4. **리소스 정리** — DB connection, Redis, 외부 SDK 등

```typescript
import Fastify from 'fastify';

const fastify = Fastify({ logger: true });

// ... plugin/route 등록 ...

async function shutdown(signal: string) {
  fastify.log.info({ signal }, 'Received shutdown signal');

  // 새 요청 거부, 진행 중 요청 완료 대기
  // onClose hook 자동 실행
  await fastify.close();

  fastify.log.info('Server shut down gracefully');
  process.exit(0);
}
```

> **Graceful Shutdown 패턴 이론**(Fail fast, connection 추적, timeout deadline)은 [../resilience.md](../resilience.md#graceful-shutdown)에 정식 정의가 있다.
> 이 파일은 Fastify `close()`와 `onClose` hook 통합 패턴에 집중한다.

## Signal Handler 통합

SIGINT/SIGTERM을 받으면 `fastify.close()`를 호출한다.

```typescript
// server.ts
import Fastify from 'fastify';
import { buildApp } from './app.js';

async function start() {
  const app = await buildApp();
  await app.listen({ port: Number(process.env.PORT) || 3000, host: '0.0.0.0' });

  const signals = ['SIGINT', 'SIGTERM'] as const;

  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info({ signal }, 'Received shutdown signal');

      try {
        // 새 요청 거부, 진행 중 요청 완료 대기
        await app.close();
        app.log.info('Server shut down gracefully');
        process.exit(0);
      } catch (err) {
        app.log.error({ err }, 'Error during shutdown');
        process.exit(1);
      }
    });
  }
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

### Shutdown 시 health check를 unhealthy로

Kubernetes 환경에서는 shutdown 시작 시점에 readiness probe를 실패시켜 LB가 트래픽을 끊도록 한다. 이는 `await app.close()` 호출 **이전**에 health handler를 교체하거나, 플래그를 설정해 처리한다.

```typescript
let shuttingDown = false;

app.get('/ready', async (request, reply) => {
  if (shuttingDown) {
    return reply.code(503).send({ status: 'shutting_down' });
  }
  // ... DB/Redis check ...
  return { status: 'ready' };
});

process.on('SIGTERM', async () => {
  shuttingDown = true;

  // preStop grace period (보통 10초)
  // LB가 endpoint를 제거할 시간 확보
  await new Promise((resolve) => setTimeout(resolve, 10_000));

  await app.close();
  process.exit(0);
});
```

## onClose Hook

`onClose` hook은 `fastify.close()` 호출 시 **plugin별로 리소스를 정리**할 수 있는 공식 hook이다. DB plugin, Redis plugin 등에서 사용한다.

```typescript
// plugins/db.ts
import fp from 'fastify-plugin';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';

export default fp(async function dbPlugin(fastify) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  fastify.decorate('db', db);

  // Fastify 종료 시 pool 정리
  fastify.addHook('onClose', async () => {
    await pool.end();
    fastify.log.info('Database pool closed');
  });
}, { name: 'db-plugin' });
```

```typescript
// plugins/redis.ts
import fp from 'fastify-plugin';
import Redis from 'ioredis';

export default fp(async function redisPlugin(fastify) {
  const redis = new Redis(process.env.REDIS_URL!);

  fastify.decorate('redis', redis);

  fastify.addHook('onClose', async () => {
    await redis.quit();
    fastify.log.info('Redis connection closed');
  });
}, { name: 'redis-plugin' });
```

**장점**: Plugin이 자신의 리소스 정리 책임을 지므로, `server.ts`에서 별도로 `pool.end()`, `redis.quit()`를 호출할 필요가 없다. `fastify.close()` 하나로 모든 plugin이 정리된다.

## Circuit Breaker를 decorator로 등록

Framework-agnostic `CircuitBreaker` 클래스를 Fastify plugin으로 감싸 route handler에서 재사용할 수 있게 한다.

```typescript
// plugins/circuit-breaker.ts
import fp from 'fastify-plugin';
import { CircuitBreaker } from '../lib/circuit-breaker.js';

export default fp(async function circuitBreakerPlugin(fastify) {
  // 서비스별 circuit breaker 인스턴스 생성
  const paymentCircuit = new CircuitBreaker({
    failureThreshold: 5,
    resetTimeoutMs: 30000,
    halfOpenMaxAttempts: 3,
  });

  const notificationCircuit = new CircuitBreaker({
    failureThreshold: 10,
    resetTimeoutMs: 60000,
    halfOpenMaxAttempts: 5,
  });

  fastify.decorate('paymentCircuit', paymentCircuit);
  fastify.decorate('notificationCircuit', notificationCircuit);
});

// TypeScript 타입 확장
declare module 'fastify' {
  interface FastifyInstance {
    paymentCircuit: CircuitBreaker;
    notificationCircuit: CircuitBreaker;
  }
}
```

Handler에서 사용:

```typescript
import { FastifyRequest, FastifyReply } from 'fastify';

export async function createPayment(request: FastifyRequest, reply: FastifyReply) {
  const result = await request.server.paymentCircuit.execute(() =>
    stripeClient.charges.create(request.body as PaymentInput),
  );

  return reply.send({ data: result });
}
```

> **CircuitBreaker 클래스 구현**(CLOSED/OPEN/HALF_OPEN 전이, onSuccess/onFailure)과 **CircuitOpenError fallback 패턴**은 [../resilience.md](../resilience.md#circuit-breaker-pattern)에 정식 정의가 있다.

### Rate Limit Context (FastifyRequest 사용)

route handler에서 rate limit 정보를 decorate로 노출할 때 `FastifyRequest` 타입을 사용한다:

```typescript
import fp from 'fastify-plugin';
import { FastifyRequest } from 'fastify';

export default fp(async function rateLimitContextPlugin(fastify) {
  fastify.decorateRequest('rateLimitKey', '');

  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    request.rateLimitKey = request.user?.id?.toString() ?? request.ip;
  });
});
```

## Related

- [../resilience.md](../resilience.md) — Circuit Breaker, Retry, Bulkhead, Timeout 이론과 framework-agnostic 구현
- [./observability.md](./observability.md) — Health check routes (shutdown 시 unhealthy 처리)
- [./error-handling.md](./error-handling.md) — `CircuitOpenError` fallback 처리
- [./architecture.md](./architecture.md) — Plugin 등록 순서 (`onClose` hook은 역순 실행)
- [../deployment.md](../deployment.md) — Kubernetes preStop, graceful termination
