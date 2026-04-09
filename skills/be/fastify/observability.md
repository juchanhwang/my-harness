# Fastify Observability

> 이 파일은 **Fastify 5** 전용 구현을 다룬다.
> Framework-agnostic observability 원칙(3 pillars, Pino 로그 레벨 가이드, RED metrics, OpenTelemetry 이론, Sentry 원칙)은 [../observability.md](../observability.md)를 참조하라.

## 목차

1. [Fastify + Pino 설정](#fastify--pino-설정)
2. [Request-scoped logger](#request-scoped-logger)
3. [fastify-metrics](#fastify-metrics)
4. [OpenTelemetry Fastify instrumentation](#opentelemetry-fastify-instrumentation)
5. [Sentry plugin](#sentry-plugin)
6. [Health Check Routes](#health-check-routes)
7. [Related](#related)

## Fastify + Pino 설정

Fastify는 **Pino를 기본 logger로 통합**하고 있어 별도 설정 없이 structured logging이 가능하다.

```typescript
import Fastify from 'fastify';
import crypto from 'node:crypto';

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    // 프로덕션: JSON 출력 (ELK, Datadog 등에서 파싱)
    // 개발: pino-pretty로 가독성 확보
    transport: process.env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
    // 민감 정보 마스킹
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.body.password',
        'req.body.cardNumber',
        'req.body.ssn',
      ],
      censor: '[REDACTED]',
    },
  },
  // Request ID 생성
  genReqId: (req) => {
    return (req.headers['x-request-id'] as string) || crypto.randomUUID();
  },
});
```

핵심:
* **`logger` 옵션** — Pino 인스턴스를 자동 생성하고 `fastify.log`로 노출
* **`genReqId`** — 각 요청에 고유 ID 부여, 모든 로그에 자동 포함
* **`redact`** — password, token, 쿠키 등 민감 정보를 로그에서 마스킹
* **`transport`** — 개발 환경에서만 `pino-pretty`로 예쁘게 출력

> **Pino 로그 레벨 가이드**(fatal/error/warn/info/debug/trace)와 **구조화 로깅 원칙**은 [../observability.md](../observability.md#2-structured-logging-pino)에 정식 정의가 있다.

## Request-scoped logger

Fastify는 요청마다 `request.log`로 **requestId가 포함된 child logger**를 제공한다. Service 계층으로 logger를 전달하여 request context를 유지한다.

```typescript
// Handler에서 logger 전달
import { FastifyRequest, FastifyReply } from 'fastify';

export async function createOrder(request: FastifyRequest, reply: FastifyReply) {
  const order = await request.server.orderService.create(
    request.user.id,
    (request.body as { items: OrderItemInput[] }).items,
    request.log,  // request-scoped logger (requestId 포함)
  );
  return reply.code(201).send({ data: order });
}
```

```typescript
// Service에서 request context 유지
import pino from 'pino';

class OrderService {
  async create(userId: number, items: OrderItemInput[], logger: pino.Logger) {
    const log = logger.child({ service: 'OrderService', method: 'create' });

    log.info({ userId, itemCount: items.length }, 'Creating order');

    // ... 비즈니스 로직 ...

    log.info({ orderId: order.id }, 'Order created');
    return order;
  }
}
```

이렇게 하면 `OrderService.create` 내부에서 찍히는 모든 로그에 `requestId`, `service`, `method`가 자동으로 포함된다.

## fastify-metrics

`fastify-metrics` plugin은 `prom-client` 기반으로 Prometheus 호환 메트릭을 자동 수집한다.

```typescript
// plugins/metrics.ts
import fp from 'fastify-plugin';
import metricsPlugin from 'fastify-metrics';

export default fp(async function metrics(fastify) {
  await fastify.register(metricsPlugin, {
    endpoint: '/metrics',  // Prometheus scrape endpoint
    defaultMetrics: { enabled: true },
    routeMetrics: {
      enabled: true,
      overrides: {
        histogram: {
          name: 'http_request_duration_seconds',
          help: 'HTTP request duration in seconds',
          buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
        },
      },
    },
  });
});
```

이 plugin은 자동으로 다음 메트릭을 수집한다:
* `http_request_duration_seconds` (histogram) — 경로/method/status별 응답 시간
* `http_requests_total` (counter) — 요청 수
* Node.js 기본 메트릭 (GC, event loop lag, memory 등)

> **RED 메트릭 방법론**(Rate, Errors, Duration)과 **커스텀 비즈니스 메트릭 패턴**(Counter/Histogram/Gauge)은 [../observability.md](../observability.md#3-metrics-prometheus)에 정식 정의가 있다.

## OpenTelemetry Fastify instrumentation

OpenTelemetry는 Fastify auto-instrumentation을 제공하여 HTTP request, DB query 등을 자동으로 trace한다.

```typescript
// tracing.ts — 앱 시작 전에 초기화
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-pg': { enabled: true },
      '@opentelemetry/instrumentation-http': { enabled: true },
      '@opentelemetry/instrumentation-fastify': { enabled: true },
    }),
  ],
  serviceName: 'api-server',
});

sdk.start();
```

핵심: **`tracing.ts`를 애플리케이션 진입점보다 먼저 import**해야 instrumentation이 Fastify를 올바르게 래핑한다. 보통 `node --require ./tracing.js dist/server.js` 또는 `import './tracing.js'`를 server entry 맨 위에 둔다.

> **OpenTelemetry 수동 span 추가**(`tracer.startActiveSpan`, `span.setAttribute`, `span.recordException`)와 **distributed tracing 개념**은 [../observability.md](../observability.md#4-tracing-opentelemetry)에 정식 정의가 있다.

## Sentry plugin

Sentry로 에러를 보고하는 Fastify plugin 예제:

```typescript
// plugins/sentry.ts
import * as Sentry from '@sentry/node';
import fp from 'fastify-plugin';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  beforeSend(event) {
    // PII 제거
    if (event.request?.headers) {
      delete event.request.headers.authorization;
      delete event.request.headers.cookie;
    }
    return event;
  },
});

export default fp(async function sentryPlugin(fastify) {
  fastify.addHook('onError', async (request, reply, error) => {
    // 4xx는 보고하지 않음 (클라이언트 에러)
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode && statusCode < 500) return;

    Sentry.captureException(error, {
      tags: {
        requestId: request.id,
        url: request.url,
        method: request.method,
      },
      user: request.user ? { id: String(request.user.id) } : undefined,
    });
  });
});
```

> **Fastify error handler와 Sentry hook 분리 원칙**(`setErrorHandler`는 응답 생성, `onError`는 사이드 이펙트)은 [./error-handling.md](./error-handling.md#onerror-hook--sentry-통합)에 정식 정의가 있다.

## Health Check Routes

Kubernetes liveness/readiness probe용 health check route.

```typescript
// routes/health/index.ts
import { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';

export default async function healthRoutes(fastify: FastifyInstance) {
  // Liveness: 프로세스가 살아있는가? (Kubernetes liveness probe)
  fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Readiness: 트래픽을 받을 준비가 되었는가? (DB, Redis 연결 등)
  fastify.get('/ready', async (request, reply) => {
    const checks: Record<string, 'ok' | 'fail'> = {};

    // DB 연결 확인
    try {
      await fastify.db.execute(sql`SELECT 1`);
      checks.database = 'ok';
    } catch {
      checks.database = 'fail';
    }

    // Redis 연결 확인
    try {
      await fastify.redis.ping();
      checks.redis = 'ok';
    } catch {
      checks.redis = 'fail';
    }

    const allOk = Object.values(checks).every((v) => v === 'ok');

    return reply.code(allOk ? 200 : 503).send({
      status: allOk ? 'ready' : 'not_ready',
      checks,
      timestamp: new Date().toISOString(),
    });
  });
}
```

> **Liveness vs Readiness 구분 원칙**과 **Graceful Shutdown 패턴**은 [../observability.md](../observability.md#6-health-checks)와 [../resilience.md](../resilience.md#graceful-shutdown)에 정식 정의가 있다.
> **Fastify graceful shutdown 구현**(`fastify.close()`, `onClose` hook, signal handler)은 [./resilience.md](./resilience.md)에 정식 정의가 있다.

## Related

- [../observability.md](../observability.md) — Observability 3 pillars, Pino 레벨 가이드, RED 메트릭, OpenTelemetry 이론
- [./error-handling.md](./error-handling.md) — `setErrorHandler`, `onError`, `onResponse` hook
- [./resilience.md](./resilience.md) — Fastify graceful shutdown
- [./architecture.md](./architecture.md) — Plugin 등록 순서 (Infrastructure layer)
- [../debugging.md](../debugging.md) — 로그 기반 디버깅·trace 연계
