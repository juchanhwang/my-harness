# Resilience

## 목차

1. [Circuit Breaker Pattern](#circuit-breaker-pattern)
2. [Bulkhead Pattern](#bulkhead-pattern)
3. [Timeout 전략](#timeout-전략)
4. [Retry with Exponential Backoff + Jitter](#retry-with-exponential-backoff--jitter)
5. [Graceful Shutdown](#graceful-shutdown)
6. [Health Check 패턴](#health-check-패턴)
7. [Chaos Engineering 기본](#chaos-engineering-기본)
8. [실무 가이드라인](#실무-가이드라인)

## Circuit Breaker Pattern

외부 서비스 장애 시 빠르게 실패하여 전체 시스템을 보호.

```
States:
CLOSED  ──(failures > threshold)──→ OPEN
OPEN    ──(timeout expires)───────→ HALF_OPEN
HALF_OPEN ──(success)─────────────→ CLOSED
HALF_OPEN ──(failure)─────────────→ OPEN
```

```typescript
enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

class CircuitBreaker {
  private state = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;

  constructor(
    private readonly options: {
      failureThreshold: number;    // OPEN으로 전환할 실패 횟수
      resetTimeoutMs: number;      // OPEN → HALF_OPEN 전환 대기 시간
      halfOpenMaxAttempts: number;  // HALF_OPEN에서 허용할 시도 횟수
    }
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime > this.options.resetTimeoutMs) {
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
      } else {
        throw new CircuitOpenError('Circuit is OPEN');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.options.halfOpenMaxAttempts) {
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
      }
    } else {
      this.failureCount = 0;
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.options.failureThreshold) {
      this.state = CircuitState.OPEN;
    }
  }

  getState(): CircuitState { return this.state; }
}

// 사용
const paymentCircuit = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  halfOpenMaxAttempts: 3,
});

async function processPayment(data: PaymentInput) {
  try {
    return await paymentCircuit.execute(() =>
      stripeClient.charges.create(data)
    );
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      // Fallback: 큐에 넣고 나중에 재시도
      await paymentQueue.add('retry-payment', data);
      return { status: 'queued', message: 'Payment will be processed later' };
    }
    throw err;
  }
}
```

## Bulkhead Pattern

서비스 리소스를 격리하여 한 부분의 장애가 전체에 영향을 미치지 않도록.

```typescript
// 서비스별 동시 요청 수 제한
class Bulkhead {
  private active = 0;
  private queue: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];

  constructor(
    private readonly maxConcurrent: number,
    private readonly maxQueue: number = 100
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.maxConcurrent) {
      if (this.queue.length >= this.maxQueue) {
        throw new BulkheadFullError('Bulkhead queue is full');
      }
      await new Promise<void>((resolve, reject) => {
        this.queue.push({ resolve, reject });
      });
    }

    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      if (this.queue.length > 0) {
        const next = this.queue.shift()!;
        next.resolve();
      }
    }
  }
}

// 서비스별 격리
const paymentBulkhead = new Bulkhead(10);    // 결제: 최대 10개 동시
const notificationBulkhead = new Bulkhead(50); // 알림: 최대 50개 동시
```

## Timeout 전략

```typescript
// Connection timeout vs Request timeout
const httpClient = {
  async request(url: string, options?: RequestOptions) {
    const controller = new AbortController();

    // Request timeout (전체 요청 시간)
    const requestTimeout = setTimeout(
      () => controller.abort(),
      options?.timeoutMs ?? 10000
    );

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        // Connection timeout은 undici Agent에서 설정
      });
      return response;
    } finally {
      clearTimeout(requestTimeout);
    }
  },
};

// DB 쿼리 timeout
await db.execute(sql`
  SET LOCAL statement_timeout = '5s';
  SELECT * FROM heavy_query(...);
`);

// 계층별 timeout
// Client → API Gateway (30s) → Service (10s) → DB (5s)
// 안쪽이 바깥쪽보다 짧아야 함
```

## Retry with Exponential Backoff + Jitter

```typescript
interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableErrors?: (err: Error) => boolean;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const {
    maxRetries,
    baseDelayMs,
    maxDelayMs,
    retryableErrors = () => true,
  } = options;

  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;

      if (attempt === maxRetries || !retryableErrors(lastError)) {
        throw lastError;
      }

      // Exponential backoff + full jitter
      const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
      const jitter = Math.random() * exponentialDelay;
      const delay = Math.min(jitter, maxDelayMs);

      console.warn(`Retry ${attempt + 1}/${maxRetries} after ${delay.toFixed(0)}ms`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  throw lastError!;
}

// 사용
const result = await withRetry(
  () => externalApi.call(data),
  {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    retryableErrors: (err) =>
      err.message.includes('ECONNRESET') ||
      err.message.includes('timeout') ||
      (err as any).statusCode >= 500,
  }
);
```

## Graceful Shutdown

Production 서비스는 배포/스케일링 시 **진행 중 요청을 완료하고 종료**해야 한다. 갑작스러운 종료는 사용자 요청 실패, 데이터 정합성 문제를 야기한다.

### 단계

1. **Shutdown signal 수신** (SIGTERM/SIGINT)
2. **Readiness probe를 unhealthy로 전환** — LB가 새 트래픽 차단
3. **preStop grace period 대기** — LB endpoint 제거 시간 확보 (보통 10초)
4. **HTTP server close** — 새 connection 거부, 진행 중 요청 완료 대기
5. **리소스 정리** — DB pool, Redis, 외부 SDK connection
6. **프로세스 종료** — `process.exit(0)`

### 원칙

* **Deadline이 있어야 한다** — 무한정 대기하지 않고 타임아웃 (보통 30초)
* **순서가 중요하다** — HTTP close 후 DB close (역순으로 의존성 해제)
* **Idempotent** — 여러 번 호출되어도 안전해야 함
* **로깅** — 각 단계를 로그로 남겨 shutdown 과정을 추적 가능하게

### Signal Handler (framework-agnostic)

```typescript
// lib/graceful-shutdown.ts
export interface ShutdownHandler {
  name: string;
  handler: () => Promise<void>;
}

export class GracefulShutdown {
  private shuttingDown = false;
  private handlers: ShutdownHandler[] = [];

  register(name: string, handler: () => Promise<void>): void {
    this.handlers.push({ name, handler });
  }

  setup(logger: { info: (msg: string) => void; error: (msg: string, err?: unknown) => void }) {
    const shutdown = async (signal: string) => {
      if (this.shuttingDown) return;
      this.shuttingDown = true;

      logger.info(`${signal} received, starting graceful shutdown`);

      // 역순으로 정리 (나중에 등록된 것부터)
      for (const { name, handler } of this.handlers.reverse()) {
        try {
          logger.info(`Closing ${name}...`);
          await handler();
        } catch (err) {
          logger.error(`Error closing ${name}`, err);
        }
      }

      logger.info('Shutdown complete');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  isShuttingDown(): boolean {
    return this.shuttingDown;
  }
}
```

> **Fastify `fastify.close()` + `onClose` hook 통합**(signal handler에서 close 호출, plugin별 `onClose` hook으로 리소스 정리)은 [fastify/resilience.md](fastify/resilience.md#graceful-shutdown-with-fastify)에 정식 정의가 있다.
> 이 섹션은 framework 중립 graceful shutdown 이론에 집중한다.

## Health Check 패턴

### Liveness vs Readiness

```typescript
// Liveness: 프로세스가 살아있는가? (실패 시 재시작)
app.get('/health/live', async () => {
  return { status: 'ok', uptime: process.uptime() };
});

// Readiness: 요청을 처리할 준비가 되었는가? (실패 시 트래픽 제거)
app.get('/health/ready', async () => {
  const checks = await Promise.allSettled([
    checkDatabase(),
    checkRedis(),
    checkExternalDeps(),
  ]);

  const results = {
    database: checks[0].status === 'fulfilled',
    redis: checks[1].status === 'fulfilled',
    external: checks[2].status === 'fulfilled',
  };

  const allHealthy = Object.values(results).every(Boolean);

  return {
    status: allHealthy ? 'ok' : 'degraded',
    checks: results,
    timestamp: new Date().toISOString(),
  };
});

async function checkDatabase(): Promise<void> {
  await db.execute(sql`SELECT 1`);
}

async function checkRedis(): Promise<void> {
  const pong = await redis.ping();
  if (pong !== 'PONG') throw new Error('Redis ping failed');
}
```

## Chaos Engineering 기본

의도적으로 장애를 주입하여 시스템의 복원력을 검증.

```typescript
// 개발/스테이징 환경에서 장애 주입 (framework-agnostic)
export class ChaosMiddleware {
  constructor(private enabled: boolean = false) {}

  // HTTP framework에 맞게 wrapper를 두고, inject()를 호출
  async inject(): Promise<void> {
    if (!this.enabled) return;

    const random = Math.random();

    // 5% 확률로 지연
    if (random < 0.05) {
      await new Promise((r) => setTimeout(r, 3000 + Math.random() * 5000));
    }

    // 2% 확률로 에러
    if (random < 0.02) {
      throw new Error('Chaos: random failure injected');
    }
  }
}

// 스테이징에서만 활성화 — framework별로 on-request hook에 바인딩
// 예: Fastify → app.addHook('onRequest', () => chaos.inject())
```

### 테스트 시나리오

1. **네트워크 지연**: 외부 API 응답 지연 시 timeout + retry 동작 확인
2. **서비스 다운**: 의존 서비스 중단 시 circuit breaker 동작 확인
3. **DB 연결 끊김**: connection pool 재연결 확인
4. **메모리 압박**: 높은 메모리 사용 시 GC 동작, OOM 방지 확인
5. **높은 CPU**: CPU-intensive 작업 시 event loop 블로킹 확인

## 실무 가이드라인

| 패턴                | 적용 대상                         |
| ----------------- | ----------------------------- |
| Circuit Breaker   | 모든 외부 서비스 호출                  |
| Retry + Backoff   | 일시적 오류 가능한 호출 (네트워크, 외부 API)  |
| Timeout           | 모든 I/O 호출                     |
| Bulkhead          | 리소스 격리가 필요한 서비스               |
| Graceful Shutdown | 모든 프로덕션 서비스                   |
| Health Check      | 모든 서비스 (liveness + readiness) |

### 원칙

1. **Fail fast**: 느린 실패보다 빠른 실패가 낫다
2. **Timeout < Retry budget**: 재시도 가능한 시간 확보
3. **Graceful degradation**: 일부 기능이 죽어도 핵심 기능은 유지
4. **모니터링 필수**: circuit breaker 상태, retry 횟수 등 메트릭 수집

---

## Related

- [fastify/resilience.md](fastify/resilience.md) — Fastify `close()`, `onClose` hook, circuit breaker decorator
- [error-handling.md](error-handling.md) — Centralized error handling·AppError 계층
- [distributed-systems.md](distributed-systems.md) — Circuit Breaker·분산 환경 재시도
- [deployment.md](deployment.md) — Graceful Shutdown·헬스체크
- [message-queues.md](message-queues.md) — Worker graceful shutdown·재시도
