# NestJS Observability

> 이 파일은 **NestJS 11** 전용 구현을 다룬다.
> Framework-agnostic observability 3대 축(logs/metrics/traces), Pino 원칙, Sentry 원칙, OpenTelemetry 기본은 [../observability.md](../observability.md)에 정식 정의가 있다.

## 목차

1. [Logging: `nestjs-pino` 설정](#logging-nestjs-pino-설정)
2. [Logger 사용 패턴](#logger-사용-패턴)
3. [Request ID 전파 & Auto request/response logging](#request-id-전파--auto-requestresponse-logging)
4. [민감정보 Redact](#민감정보-redact)
5. [Health Check: `@nestjs/terminus`](#nestjsterminus-health-check)
6. [Custom Health Indicator](#custom-health-indicator)
7. [Metrics (Prometheus)](#metrics-prometheus)
8. [Distributed Tracing (OpenTelemetry)](#distributed-tracing-opentelemetry)
9. [Sentry 통합](#sentry-통합)
10. [안티패턴](#안티패턴)
11. [Related](#related)
12. [References](#references-공식-문서)

> **Pino 로깅 원칙, structured logging, 로그 레벨, redaction 정책, metric/trace 3대 축**은 [../observability.md](../observability.md)에 정식 정의가 있다.
> 이 파일은 NestJS 통합 구현에 집중한다.

## Logging: `nestjs-pino` 설정

공식 `@nestjs/common`의 `Logger`는 단순 console logger이며 production에 부족하다. `nestjs-pino`가 사실상 표준이다.

설치:

```bash
npm i nestjs-pino pino pino-http
npm i -D pino-pretty  # dev 전용
```

### `main.ts` 부트스트랩

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true, // ← Nest 초기 로그를 buffer 해두었다가 useLogger 이후 flush
  });
  app.useLogger(app.get(Logger)); // ← NestFactory의 기본 Logger를 nestjs-pino로 교체
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

> **공식 nestjs-pino README 인용**: *"Secondly, set up app logger"* 의 코드 블록과 위 예시가 일치한다. `bufferLogs: true` + `useLogger` 패턴이 권장된다.

### `LoggerModule.forRootAsync`

`ConfigService`로부터 환경 변수를 주입받는 비동기 설정:

```typescript
// src/core/logger/logger.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.get<string>('LOG_LEVEL') ?? 'info',
          // Dev: pino-pretty, Prod: raw JSON
          transport:
            config.get<string>('NODE_ENV') !== 'production'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
          // Request id 전파
          genReqId: (req: IncomingMessage) => {
            const fromHeader = req.headers['x-request-id'];
            return typeof fromHeader === 'string' ? fromHeader : randomUUID();
          },
          customLogLevel: (_req, res, err) => {
            if (err || res.statusCode >= 500) return 'error';
            if (res.statusCode >= 400) return 'warn';
            return 'info';
          },
          // 민감정보 redact
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.body.password',
              'req.body.passwordConfirm',
              'req.body.token',
              'res.headers["set-cookie"]',
            ],
            censor: '[REDACTED]',
          },
        },
      }),
    }),
  ],
})
export class LoggerModule {}
```

**중요 필드 (공식 `pino-http` API 참조)**:

- `genReqId`: 모든 요청에 uniqueID 부여. 헤더 `x-request-id`가 있으면 그대로 사용 (distributed tracing friendly).
- `customLogLevel`: status code 기반 로그 레벨 자동 결정. 4xx는 warn, 5xx는 error.
- `redact`: 민감 필드 자동 마스킹. 공식 pino 옵션.

## Logger 사용 패턴

### 1. `Logger` (NestJS 표준 인터페이스)

```typescript
import { Logger } from '@nestjs/common';

@Injectable()
export class CatsService {
  private readonly logger = new Logger(CatsService.name);

  async findAll(): Promise<Cat[]> {
    this.logger.log('Fetching all cats');
    return this.repo.findAll();
  }
}
```

`nestjs-pino`가 `useLogger`로 교체되면 이 `Logger`도 내부적으로 pino를 쓴다. 기존 코드 변경 없이 동작한다.

### 2. `PinoLogger` (pino 네이티브 API)

```typescript
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino';

@Injectable()
export class OrdersService {
  constructor(
    @InjectPinoLogger(OrdersService.name)
    private readonly logger: PinoLogger,
  ) {}

  async createOrder(userId: string, amount: number): Promise<Order> {
    this.logger.info({ userId, amount }, 'Creating order');
    try {
      return await this.repo.create({ userId, amount });
    } catch (error) {
      this.logger.error({ err: error, userId, amount }, 'Failed to create order');
      throw error;
    }
  }
}
```

`PinoLogger`는 pino의 full API(trace/debug/info/warn/error/fatal)를 제공한다. `err` 필드에 원본 Error를 넣으면 stack trace가 자동 포함된다.

> **언제 어느 것을 쓸까**:
> - 기존 NestJS 코드는 `Logger`를 유지 (일관성)
> - 새 코드 또는 pino의 structured field를 적극 사용할 곳은 `PinoLogger`

## Request ID 전파 & Auto request/response logging

`nestjs-pino`(정확히는 `pino-http`)는 **자동으로** 모든 요청/응답을 로깅한다. 추가 설정 불필요.

```
{
  "level": 30,
  "time": 1712680000123,
  "req": {
    "id": "01HV8...",
    "method": "POST",
    "url": "/api/orders",
    "headers": { ... (redacted) },
    "remoteAddress": "10.0.0.5"
  },
  "res": { "statusCode": 201 },
  "responseTime": 47,
  "msg": "request completed"
}
```

또한 **AsyncLocalStorage** 기반으로 request context가 자동 바인딩되어, 서비스 내부의 모든 로그에도 `req.id`가 자동 포함된다 (공식 README 인용: *"to bind request data to the logs automatically from any service on any application layer without passing request context"*).

## 민감정보 Redact

기본으로 redact 해야 하는 경로 (보안 필수):

```typescript
redact: {
  paths: [
    // 인증 헤더
    'req.headers.authorization',
    'req.headers.cookie',
    'req.headers["x-api-key"]',
    // 요청 body의 비밀번호/토큰
    'req.body.password',
    'req.body.passwordConfirm',
    'req.body.oldPassword',
    'req.body.newPassword',
    'req.body.token',
    'req.body.refreshToken',
    'req.body.accessToken',
    'req.body.secret',
    // 결제/개인정보
    'req.body.cardNumber',
    'req.body.cvv',
    'req.body.ssn',
    // 응답 헤더의 Set-Cookie
    'res.headers["set-cookie"]',
  ],
  censor: '[REDACTED]',
}
```

> **PII 제거 원칙**은 [../observability.md#2-structured-logging-pino](../observability.md#2-structured-logging-pino)에서 자세히 다룬다. GDPR/CCPA 준수를 위해 이메일, 전화번호, 주민번호 등도 redact 대상이다.

## `@nestjs/terminus` Health Check

공식 recipe: `@nestjs/terminus`. Kubernetes readiness/liveness probe에 사용.

```bash
npm i @nestjs/terminus
```

### 기본 설정

```typescript
// src/core/health/health.module.ts
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HttpModule } from '@nestjs/axios';
import { HealthController } from './health.controller';

@Module({
  imports: [TerminusModule, HttpModule],
  controllers: [HealthController],
})
export class HealthModule {}
```

### HealthController — readiness + liveness 분리

```typescript
// src/core/health/health.controller.ts
import { Controller, Get } from '@nestjs/common';
import {
  DiskHealthIndicator,
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
} from '@nestjs/terminus';
import { DatabaseHealthIndicator } from './indicators/database.indicator';
import { RedisHealthIndicator } from './indicators/redis.indicator';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly disk: DiskHealthIndicator,
    private readonly database: DatabaseHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  @Get('liveness')
  @HealthCheck()
  checkLiveness() {
    // 단순히 "살아있는가" — 메모리/디스크만 체크
    return this.health.check([
      () => this.memory.checkHeap('memory_heap', 200 * 1024 * 1024), // 200MB
      () => this.disk.checkStorage('disk', { path: '/', thresholdPercent: 0.9 }),
    ]);
  }

  @Get('readiness')
  @HealthCheck()
  checkReadiness() {
    // "트래픽 받을 준비가 되었는가" — 외부 의존성 체크
    return this.health.check([
      () => this.database.isHealthy('database'),
      () => this.redis.isHealthy('redis'),
    ]);
  }
}
```

> **공식 Hint** 인용: *"It is highly recommended to enable shutdown hooks in your application. Terminus integration makes use of this lifecycle event if enabled."* 이미 [./lifecycle-shutdown.md](./lifecycle-shutdown.md#enableshutdownhooks--필수-opt-in)에서 `enableShutdownHooks()`를 강조했다.
>
> `HealthCheckResult`의 `status` 필드는 `'ok' | 'error' | 'shutting_down'` 중 하나다. `shutting_down` 상태는 Terminus가 lifecycle hook 감지 시 자동 설정한다.

## Custom Health Indicator

### Drizzle DB Indicator

```typescript
// src/core/health/indicators/database.indicator.ts
import { Inject, Injectable } from '@nestjs/common';
import {
  HealthIndicatorResult,
  HealthIndicatorService,
} from '@nestjs/terminus';
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../../database/database.tokens';

@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    private readonly indicatorService: HealthIndicatorService,
    @Inject(DATABASE_CONNECTION) private readonly db: NodePgDatabase,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.indicatorService.check(key);
    try {
      const start = performance.now();
      await this.db.execute(sql`SELECT 1`);
      const elapsedMs = Math.round(performance.now() - start);
      return indicator.up({ elapsedMs });
    } catch (error) {
      return indicator.down({
        message: error instanceof Error ? error.message : 'unknown',
      });
    }
  }
}
```

> **Note**: `@nestjs/terminus` 11 이상은 `HealthIndicatorService`의 `check(key).up()`/`down()` 패턴을 권장한다. 이전 버전의 `HealthIndicator` 상속 방식은 deprecated. 정확한 API는 공식 recipes/terminus 문서를 해당 시점에 확인.

### Redis Indicator

```typescript
// src/core/health/indicators/redis.indicator.ts
import { Inject, Injectable } from '@nestjs/common';
import { HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.tokens';

@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly indicatorService: HealthIndicatorService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.indicatorService.check(key);
    try {
      const result = await this.redis.ping();
      if (result !== 'PONG') {
        return indicator.down({ message: `Unexpected PING result: ${result}` });
      }
      return indicator.up();
    } catch (error) {
      return indicator.down({
        message: error instanceof Error ? error.message : 'unknown',
      });
    }
  }
}
```

### Built-in Indicators

공식 문서에서 제공하는 built-in indicator:

- `HttpHealthIndicator` — 외부 HTTP 엔드포인트 ping (`@nestjs/axios` 필요)
- `TypeOrmHealthIndicator`, `MongooseHealthIndicator`, `SequelizeHealthIndicator`, `MikroOrmHealthIndicator`, `PrismaHealthIndicator`
- `MemoryHealthIndicator`: `checkHeap`, `checkRSS`
- `DiskHealthIndicator`: `checkStorage`
- `MicroserviceHealthIndicator`, `GRPCHealthIndicator`

## Metrics (Prometheus)

NestJS에는 공식 Prometheus integration이 없다. Community 패키지 중 `@willsoto/nestjs-prometheus`가 가장 널리 사용된다.

> **NestJS 공식 문서에 없는 부분이므로 선택은 신중하게**. Community 패키지는 관리 상태와 버전 호환성을 확인해야 한다. 원칙은 [../observability.md#3-metrics-prometheus](../observability.md#3-metrics-prometheus)에서 framework-agnostic하게 다룬다.

간단한 패턴: `prom-client`를 직접 provider로 등록.

```typescript
// src/core/metrics/metrics.module.ts
import { Global, Module } from '@nestjs/common';
import { Counter, Histogram, register } from 'prom-client';

export const HTTP_REQUEST_COUNTER = Symbol('HTTP_REQUEST_COUNTER');
export const HTTP_REQUEST_DURATION = Symbol('HTTP_REQUEST_DURATION');

@Global()
@Module({
  providers: [
    {
      provide: HTTP_REQUEST_COUNTER,
      useFactory: () =>
        new Counter({
          name: 'http_requests_total',
          help: 'Total HTTP requests',
          labelNames: ['method', 'route', 'status'],
        }),
    },
    {
      provide: HTTP_REQUEST_DURATION,
      useFactory: () =>
        new Histogram({
          name: 'http_request_duration_seconds',
          help: 'HTTP request duration',
          labelNames: ['method', 'route', 'status'],
          buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
        }),
    },
  ],
  exports: [HTTP_REQUEST_COUNTER, HTTP_REQUEST_DURATION],
})
export class MetricsModule {}
```

`/metrics` 엔드포인트는 controller로 노출:

```typescript
@Controller('metrics')
export class MetricsController {
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getMetrics(): Promise<string> {
    return register.metrics();
  }
}
```

> **주의**: `/metrics`는 공개되면 민감한 운영 정보가 노출될 수 있다. internal network 또는 인증 뒤에 두어라.

## Distributed Tracing (OpenTelemetry)

NestJS + OpenTelemetry는 공식 문서에 별도 페이지가 없고, OpenTelemetry JS SDK의 auto-instrumentation에 의존한다.

### 기본 setup

```bash
npm i @opentelemetry/api \
  @opentelemetry/sdk-node \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-http
```

```typescript
// src/tracing.ts  (main.ts보다 먼저 import 되어야 함)
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

const sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'nestjs-app',
  }),
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318/v1/traces',
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

process.on('SIGTERM', () => {
  sdk.shutdown().catch(console.error);
});
```

```typescript
// main.ts의 첫 줄
import './tracing'; // ← Nest 임포트보다 먼저
import { NestFactory } from '@nestjs/core';
// ...
```

> **주의**: `./tracing`은 반드시 `NestFactory` import보다 **먼저** 실행되어야 한다. OpenTelemetry의 instrumentation은 module hooking 방식이기 때문에 나중에 로드하면 일부 module이 instrument 되지 않는다.
>
> OpenTelemetry JS SDK API는 버전업이 잦다. 정확한 import 경로는 해당 시점 공식 문서를 반드시 확인하라.

## Sentry 통합

`@sentry/nestjs` (NestJS 11용 공식 SDK)을 사용한다. 설정 방식이 버전별로 달라지므로 [Sentry 공식 NestJS 가이드](https://docs.sentry.io/platforms/javascript/guides/nestjs/)를 참조한다.

> **Sentry 원칙**(5xx만 전송, 4xx 제외, PII scrub, breadcrumb, source map)은 [../observability.md#5-error-tracking-sentry](../observability.md#5-error-tracking-sentry)에 정식 정의가 있다.

기본 패턴:

```typescript
// main.ts (Nest import 전)
import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  profilesSampleRate: 0.1,
  integrations: [nodeProfilingIntegration()],
  beforeSend(event) {
    // 4xx는 제외
    const status = event.contexts?.response?.status_code;
    if (typeof status === 'number' && status < 500) {
      return null;
    }
    return event;
  },
});
```

Exception filter 통합은 [./error-handling.md](./error-handling.md#sentry-통합) 참조.

## 안티패턴

### 1. `console.log` 사용

```typescript
// ❌
console.log('user created', userId);
```

Pino를 써라. 구조화되지 않은 로그는 grep 외에는 분석 불가능하다.

### 2. Error 객체를 string으로 변환

```typescript
// ❌ stack trace 소실
this.logger.error(`error: ${error.message}`);
```

```typescript
// ✅ err 필드에 그대로 — pino가 자동으로 stack 포함
this.logger.error({ err: error }, 'Request failed');
```

### 3. Health check에서 무거운 연산

```typescript
// ❌ full DB scan
@Get('readiness')
async readiness() {
  const count = await this.db.query.users.count();
  return { count };
}
```

readiness/liveness probe는 1초 이내에 끝나야 한다. `SELECT 1` 정도만 써라.

### 4. Liveness 체크에 외부 의존성 포함

```typescript
// ❌ DB down → Pod restart loop
@Get('liveness')
async liveness() {
  return this.health.check([() => this.database.isHealthy('db')]);
}
```

liveness는 "내가 살아있는가"이고, readiness는 "트래픽 받을 준비가 되었는가"다. DB down은 readiness만 실패하게 해서 **트래픽만 끊고 Pod는 유지**해야 한다. 그래야 DB 복구 시 자동 복귀한다.

### 5. 민감정보 redact 누락

```typescript
// ❌ Authorization 헤더가 그대로 로그에 찍힘
LoggerModule.forRoot({ pinoHttp: { level: 'debug' } })
```

최소한 `req.headers.authorization`, `req.headers.cookie`, `req.body.password`는 필수 redact.

### 6. Metrics endpoint 공개 노출

```typescript
// ❌ /metrics를 인증 없이 public에 노출
@Controller('metrics')
export class MetricsController {}
```

Internal network + auth 필요.

## Related

- [../observability.md](../observability.md) — 3대 축(Logs/Metrics/Traces), Pino 원칙, Sentry 원칙, OpenTelemetry 기본, Prometheus
- [./error-handling.md](./error-handling.md#logging-통합-pino) — Filter에서 pino 사용
- [./lifecycle-shutdown.md](./lifecycle-shutdown.md) — `enableShutdownHooks`와 Terminus 연동
- [./drizzle-integration.md](./drizzle-integration.md) — DB health indicator와 연결
- [../resilience.md#health-check-패턴](../resilience.md#health-check-패턴) — readiness vs liveness 설계 원칙
- [../fastify/observability.md](../fastify/observability.md) — Fastify 네이티브 pino 비교

## References (공식 문서)

- [NestJS Docs — Terminus Recipe](https://docs.nestjs.com/recipes/terminus) — `TerminusModule`, `HealthCheckService`, built-in indicator 목록, `HealthCheckResult` 인터페이스, shutdown hook 연동
- [NestJS Docs — Logger](https://docs.nestjs.com/techniques/logger) — 기본 `Logger`, `useLogger`, `bufferLogs`
- [nestjs-pino (GitHub)](https://github.com/iamolegga/nestjs-pino) — `LoggerModule.forRoot`/`forRootAsync`, `PinoLogger`, `InjectPinoLogger`, auto request/response logging, AsyncLocalStorage 기반 request context, `pinoHttp` 옵션
- [pino-http](https://github.com/pinojs/pino-http) — `genReqId`, `customLogLevel`, `redact`, `serializers`
- [pino Options](https://github.com/pinojs/pino/blob/main/docs/api.md#options) — 전체 옵션
- [OpenTelemetry JS — Getting Started](https://opentelemetry.io/docs/languages/js/getting-started/nodejs/) — auto-instrumentation, OTLP exporter
- [Sentry — NestJS Guide](https://docs.sentry.io/platforms/javascript/guides/nestjs/) — `@sentry/nestjs` 버전별 설정
