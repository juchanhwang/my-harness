# NestJS Lifecycle Hooks & Graceful Shutdown

> 이 파일은 **NestJS 11** 전용 구현을 다룬다.
> Framework-agnostic graceful shutdown 절차(SIGTERM 처리, in-flight request 완료, connection drain)는 [../resilience.md#graceful-shutdown](../resilience.md#graceful-shutdown)에 정식 정의가 있다.

## 목차

1. [전체 Lifecycle Phase](#전체-lifecycle-phase)
2. [Hook 목록 및 호출 순서](#hook-목록-및-호출-순서)
3. [`onModuleInit` / `onApplicationBootstrap` — 초기화](#onmoduleinit--onapplicationbootstrap--초기화)
4. [`enableShutdownHooks()` — 필수 opt-in](#enableshutdownhooks--필수-opt-in)
5. [`onModuleDestroy` / `beforeApplicationShutdown` / `onApplicationShutdown`](#종료-hook)
6. [Kubernetes SIGTERM 통합](#kubernetes-sigterm-통합)
7. [실무 Graceful Shutdown 패턴](#실무-graceful-shutdown-패턴)
8. [안티패턴](#안티패턴)
9. [Related](#related)
10. [References](#references-공식-문서)

> **Graceful shutdown의 이론적 원칙**(SIGTERM 처리, load balancer draining, in-flight 완료, 재시작 시 coordination)은 [../resilience.md#graceful-shutdown](../resilience.md#graceful-shutdown)에 정식 정의가 있다.
> 이 파일은 NestJS lifecycle hook API와 Kubernetes 연동에 집중한다.

## 전체 Lifecycle Phase

공식 문서가 정의하는 세 단계:

```
┌──────────────────────────────────────────────────┐
│                                                  │
│  [1] INITIALIZING                                │
│      ├─ onModuleInit                             │
│      └─ onApplicationBootstrap                   │
│                                                  │
│  [2] RUNNING                                     │
│      └─ (app.listen → 요청 처리)                 │
│                                                  │
│  [3] TERMINATING (SIGTERM 또는 app.close)         │
│      ├─ onModuleDestroy                          │
│      ├─ beforeApplicationShutdown                │
│      │   (→ app.close() 호출)                    │
│      └─ onApplicationShutdown                    │
│                                                  │
└──────────────────────────────────────────────────┘
```

## Hook 목록 및 호출 순서

공식 문서 표 그대로:

| Hook | 호출 시점 |
|---|---|
| `onModuleInit()` | host module의 의존성이 resolve 된 직후 |
| `onApplicationBootstrap()` | **모든 모듈이 초기화된 후**, `listen` 호출 전 |
| `onModuleDestroy()` | 종료 신호 수신 후 (SIGTERM 등) |
| `beforeApplicationShutdown()` | 모든 `onModuleDestroy`가 완료된 후. 이후 `app.close()`로 connection close |
| `onApplicationShutdown()` | `app.close()`가 resolve 된 후 |

각 hook은 interface로 제공되며, 구현 클래스는 해당 interface를 `implements`한다.

```typescript
import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  BeforeApplicationShutdown,
} from '@nestjs/common';
```

> **중요 경고** (공식 인용):
> 1. *"The lifecycle hooks listed above are not triggered for request-scoped classes. Request-scoped classes are not tied to the application lifecycle."*
> 2. *"Execution order of `onModuleInit()` and `onApplicationBootstrap()` directly depends on the order of module imports, awaiting the previous hook."* — 모듈 import 순서가 hook 실행 순서를 결정한다.
> 3. *"`onModuleInit` and `onApplicationBootstrap` are only triggered if you explicitly call `app.init()` or `app.listen()`."*

## `onModuleInit` / `onApplicationBootstrap` — 초기화

두 hook의 차이:

- `onModuleInit` — 해당 모듈만 의존성 해결되면 즉시 호출. 다른 모듈의 provider가 아직 준비 안 됐을 수 있음.
- `onApplicationBootstrap` — **모든 모듈**의 초기화가 끝나야 호출. 다른 모듈의 provider를 확실히 사용할 수 있다.

### 예시: Database connection 검증

```typescript
// src/core/database/database.service.ts
import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { DATABASE_CONNECTION } from './database.tokens';
import { Inject } from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';

@Injectable()
export class DatabaseHealthCheckService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DatabaseHealthCheckService.name);

  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: NodePgDatabase,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.db.execute(sql`SELECT 1`);
      this.logger.log('Database connection verified');
    } catch (error) {
      this.logger.error({ err: error }, 'Database health check failed');
      throw error; // app 부트스트랩 실패 — fail-fast
    }
  }
}
```

공식 인용: *"Both the `OnModuleInit` and `OnApplicationBootstrap` hooks allow you to defer the application initialization process (return a `Promise` or mark the method as `async`)."*

### 예시: Cache warm-up

```typescript
@Injectable()
export class ConfigCacheService implements OnApplicationBootstrap {
  private cache: Record<string, unknown> = {};

  async onApplicationBootstrap(): Promise<void> {
    // 모든 모듈 초기화 후 DB 조회 안전
    const rows = await this.db.query.config.findMany();
    this.cache = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }
}
```

## `enableShutdownHooks()` — 필수 opt-in

공식 인용: *"Shutdown hook listeners consume system resources, so they are disabled by default. To use shutdown hooks, you **must enable listeners** by calling `enableShutdownHooks()`."*

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.enableShutdownHooks(); // ← 반드시 호출. 이거 없으면 SIGTERM에 반응하지 않는다

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

> **공식 경고 (Windows)**: *"SIGTERM will never work on Windows because killing a process in the task manager is unconditional."* Windows에서는 `SIGINT`, `SIGBREAK`만 동작한다. production은 Linux를 기준으로 설계하라.
>
> **공식 경고 (Multi-app)**: *"`enableShutdownHooks` consumes memory by starting listeners. In cases where you are running multiple Nest apps in a single Node process (e.g., parallel tests with Jest), Node may complain about excessive listener processes."*

## 종료 Hook

SIGTERM 수신 시 순서:

```
signal (SIGTERM) 수신
      ↓
1. onModuleDestroy()
      ↓ (모든 module 완료 대기)
2. beforeApplicationShutdown()
      ↓
   app.close() 호출 (HTTP server stop accepting new connections)
      ↓
3. onApplicationShutdown()
      ↓
   process exit
```

각 hook는 signal 이름(`'SIGTERM'`, `'SIGINT'`)을 첫 번째 파라미터로 받는다.

### `onModuleDestroy`

리소스 해제가 목적. DB connection close, Redis quit, job queue stop 등.

```typescript
import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { Inject } from '@nestjs/common';

@Injectable()
export class RedisLifecycleService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisLifecycleService.name);

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Closing Redis connection...');
    await this.redis.quit();
    this.logger.log('Redis connection closed');
  }
}
```

### `beforeApplicationShutdown`

`onModuleDestroy` 이후, `app.close()` 이전. HTTP server가 새 연결을 받는 동안 background task cleanup 하기 좋은 시점.

```typescript
@Injectable()
export class BackgroundJobsService implements BeforeApplicationShutdown {
  private readonly logger = new Logger(BackgroundJobsService.name);

  async beforeApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log({ signal }, 'Draining background jobs...');
    await this.bullQueue.pause(true); // 새 job 수신 중지
    await this.bullQueue.waitUntilReady();
    // in-flight job들이 완료될 때까지 대기 (timeout은 별도 설정)
    this.logger.log('Background jobs drained');
  }
}
```

### `onApplicationShutdown`

HTTP server가 완전히 닫힌 후. 최종 flush/notify용.

```typescript
@Injectable()
export class ShutdownNotifier implements OnApplicationShutdown {
  private readonly logger = new Logger(ShutdownNotifier.name);

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log({ signal }, 'Application fully shut down');
    // 예: monitoring 서비스에 shutdown 이벤트 전송
    // 예: Pino log flush (nestjs-pino는 자동 처리)
  }
}
```

## Kubernetes SIGTERM 통합

Kubernetes가 Pod을 종료할 때의 전체 흐름:

```
1. kubectl delete pod
      ↓
2. Pod을 endpoints에서 제거 (Service → 새 트래픽 차단 시작)
      ↓  (이 과정은 asynchronous)
3. container에 SIGTERM 전송
      ↓
4. terminationGracePeriodSeconds 타이머 시작 (기본 30초)
      ↓
5. NestJS가 hook 실행
      ↓
6. timer 만료 시 SIGKILL (강제 종료)
```

**문제**: 2단계와 3단계가 동시에 시작되므로, SIGTERM을 받은 직후 몇 초간은 **여전히 트래픽이 들어올 수 있다**. 이 race window를 해결하려면 `preStop` hook으로 일정 시간 sleep 한다.

### Deployment YAML 예시

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nestjs-app
spec:
  template:
    spec:
      terminationGracePeriodSeconds: 60  # NestJS hook 실행에 충분한 시간
      containers:
        - name: app
          image: my-nestjs-app:latest
          ports:
            - containerPort: 3000
          lifecycle:
            preStop:
              exec:
                command: ["/bin/sh", "-c", "sleep 10"]
                # endpoints 업데이트가 전파될 시간 확보
          readinessProbe:
            httpGet:
              path: /health/readiness
              port: 3000
            periodSeconds: 5
            failureThreshold: 3
          livenessProbe:
            httpGet:
              path: /health/liveness
              port: 3000
            periodSeconds: 10
            failureThreshold: 3
```

### Readiness vs Liveness probe

- **Readiness probe**: 트래픽을 받을 준비가 되었는가? (DB 연결 OK?)
- **Liveness probe**: 살아있는가? (dead lock 아닌가?)

NestJS 측 구현은 [./observability.md](./observability.md#nestjsterminus-health-check)에서 `@nestjs/terminus`로 다룬다.

## 실무 Graceful Shutdown 패턴

공식 문서에 명시되지 않았지만 실무에서 자주 쓰이는 패턴들.

### 1. Shutdown flag로 readiness 응답 바꾸기

SIGTERM 수신 시 readiness 응답이 false가 되면 load balancer가 트래픽을 끊는다.

```typescript
// src/core/health/shutdown-state.service.ts
import { Injectable, BeforeApplicationShutdown } from '@nestjs/common';

@Injectable()
export class ShutdownStateService implements BeforeApplicationShutdown {
  private shuttingDown = false;

  isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  async beforeApplicationShutdown(): Promise<void> {
    this.shuttingDown = true;
  }
}
```

Health controller:

```typescript
@Controller('health')
export class HealthController {
  constructor(private readonly shutdownState: ShutdownStateService) {}

  @Get('readiness')
  readiness(): { status: string } {
    if (this.shutdownState.isShuttingDown()) {
      throw new ServiceUnavailableException({ status: 'shutting-down' });
    }
    return { status: 'ok' };
  }
}
```

### 2. BullMQ worker 정리

```typescript
@Injectable()
export class OrderProcessorWorker
  implements OnModuleInit, BeforeApplicationShutdown
{
  private worker!: Worker;

  async onModuleInit(): Promise<void> {
    this.worker = new Worker('orders', this.processOrder.bind(this), {
      connection: this.redisOptions,
    });
  }

  async beforeApplicationShutdown(): Promise<void> {
    // 새 job 수신 차단 + 현재 job 완료 대기 (공식 BullMQ API)
    await this.worker.close();
  }

  private async processOrder(job: Job): Promise<void> {
    // ...
  }
}
```

### 3. HTTP keep-alive 연결 drain

Node.js HTTP server는 기본적으로 keep-alive 연결을 무기한 유지하므로, `app.close()`가 즉시 끝나지 않을 수 있다. `server.closeAllConnections()`(Node 18.2+)로 강제 종료하거나, Fastify의 경우 `forceCloseConnections: true` 옵션을 사용한다.

자세한 내용은 [../resilience.md#graceful-shutdown](../resilience.md#graceful-shutdown) 참조.

## 안티패턴

### 1. `enableShutdownHooks()` 누락

```typescript
// ❌ SIGTERM에 반응하지 않음 — hook이 절대 실행되지 않는다
const app = await NestFactory.create(AppModule);
await app.listen(3000);
```

`app.enableShutdownHooks()`를 반드시 호출하라. Kubernetes에서 가장 흔한 데이터 손실 원인.

### 2. `onModuleInit`에 cross-module 의존성 기대

```typescript
// ❌ 모듈 import 순서에 따라 CatsService가 아직 준비 안 됐을 수 있음
@Injectable()
export class OrdersService implements OnModuleInit {
  constructor(private catsService: CatsService) {}

  async onModuleInit() {
    const cats = await this.catsService.findAll(); // 위험
  }
}
```

cross-module 의존성이 필요하면 `onApplicationBootstrap`을 써라. 공식 문서 인용: *"`onApplicationBootstrap` is called once all modules have been initialized."*

### 3. Request-scoped provider에 lifecycle hook

```typescript
// ❌ 공식 경고: 이 hook들은 호출되지 않는다
@Injectable({ scope: Scope.REQUEST })
export class MyService implements OnModuleInit {
  onModuleInit() { /* 절대 실행 안 됨 */ }
}
```

### 4. Shutdown hook에서 새로운 request에 의존

```typescript
// ❌ beforeApplicationShutdown에서 DB write 시도
async beforeApplicationShutdown() {
  await this.db.insert(auditLog).values({ event: 'shutdown' });
  // 이미 DB connection이 닫혔을 수도 있음
}
```

Shutdown 순서를 명확히 이해하고 의존성을 고려해야 한다. DB connection close는 `onModuleDestroy`에서 하되, audit log는 그 이전에 남겨야 한다.

### 5. `terminationGracePeriodSeconds`가 너무 짧음

```yaml
# ❌ 기본값(30초)보다 짧게 줄임
terminationGracePeriodSeconds: 10
```

BullMQ job이 실행 중이거나 HTTP request가 처리 중이면 10초는 부족하다. 60~120초 정도 여유 있게 설정하라.

### 6. `process.exit()` 직접 호출

```typescript
// ❌ lifecycle hook 실행 안 되고 즉시 종료
process.on('SIGTERM', () => process.exit(0));
```

이 코드가 있으면 Nest의 `enableShutdownHooks`가 무효가 된다. 절대 추가하지 마라.

## Related

- [../resilience.md](../resilience.md#graceful-shutdown) — Graceful shutdown 이론, in-flight 관리, deployment coordination
- [./observability.md](./observability.md#nestjsterminus-health-check) — `@nestjs/terminus` 기반 health check
- [./drizzle-integration.md](./drizzle-integration.md) — DB connection close on shutdown
- [./microservices.md](./microservices.md) — Hybrid app 종료
- [../deployment.md](../deployment.md) — Kubernetes, Railway 배포
- [../fastify/resilience.md](../fastify/resilience.md) — Fastify `onClose` hook 비교

## References (공식 문서)

- [NestJS Docs — Lifecycle Events](https://docs.nestjs.com/fundamentals/lifecycle-events) — `OnModuleInit`, `OnApplicationBootstrap`, `OnModuleDestroy`, `BeforeApplicationShutdown`, `OnApplicationShutdown` interface와 실행 순서, `enableShutdownHooks()` opt-in, Windows 플랫폼 제약, multi-app listener 경고, request-scoped 제외 경고
- [Node.js Process Signal Events](https://nodejs.org/api/process.html#process_signal_events) — SIGTERM, SIGINT, SIGBREAK 동작
- [Kubernetes — Termination of Pods](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#pod-termination) — `terminationGracePeriodSeconds`, `preStop` hook
