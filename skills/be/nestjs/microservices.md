# NestJS Microservices

> 이 파일은 **NestJS 11** 전용 구현을 다룬다.
> Framework-agnostic 마이크로서비스 원칙(decomposition 전략, inter-service communication, service discovery)은 [../microservices.md](../microservices.md)에 정식 정의가 있다.

## 목차

1. [NestJS Microservices 개요](#nestjs-microservices-개요)
2. [Transporter 종류](#transporter-종류)
3. [Standalone Microservice 부트스트랩](#standalone-microservice-부트스트랩)
4. [Hybrid Application (HTTP + Microservice)](#hybrid-application)
5. [`@MessagePattern` vs `@EventPattern`](#messagepattern-vs-eventpattern)
6. [`ClientProxy` (Producer)](#clientproxy-producer)
7. [`ClientsModule.register` / `registerAsync`](#clientsmoduleregister--registerasync)
8. [Timeout & Retry](#timeout--retry)
9. [TLS 암호화 (TCP)](#tls-암호화-tcp)
10. [안티패턴](#안티패턴)
11. [Related](#related)
12. [References](#references-공식-문서)

> **Monolith vs Microservices 결정 기준, service decomposition, inter-service communication 패턴, Saga, Strangler Fig**는 [../microservices.md](../microservices.md)에 정식 정의가 있다.
> **Service discovery, distributed tracing, idempotency, distributed lock**은 [../distributed-systems.md](../distributed-systems.md)를 참조하라.
>
> 이 파일은 **NestJS `@nestjs/microservices` 패키지의 구현 패턴**에 집중한다.

## NestJS Microservices 개요

공식 문서 인용: *"In Nest, a microservice is fundamentally an application that uses a different **transport** layer than HTTP."*

NestJS가 제공하는 것:
- 여러 transport (TCP, Redis, NATS, RabbitMQ, Kafka, MQTT, gRPC) 지원
- request-response와 event-based 메시징 모두 추상화
- Controller/Provider/Guard/Interceptor/Pipe/Filter 재사용

설치:

```bash
npm i @nestjs/microservices
```

## Transporter 종류

공식 문서에 명시된 주요 transporter:

| Transporter | 특징 | 사용 예 |
|---|---|---|
| **TCP** (기본) | 저수준, 암호화 없음, 같은 VPC 내부 | internal service-to-service |
| **Redis** | pub/sub 기반, 이미 Redis 사용 중일 때 | simple event broker |
| **NATS** | 경량, 고성능, wildcard subscription | 실시간 이벤트 |
| **MQTT** | IoT / pub-sub 표준 | IoT device 통신 |
| **RabbitMQ** | AMQP 기반, routing/queue | 메시지 큐, DLQ |
| **gRPC** | Protocol Buffers, 엄격한 schema | 강타입 RPC |
| **Kafka** | log-based, high throughput, replay | event sourcing, stream processing |

각 transporter는 공식 문서에 별도 페이지가 있다 (아래 References 참조).

> **선택 기준**은 [../microservices.md#inter-service-communication](../microservices.md#inter-service-communication)에 정식 정의가 있다. 간단히:
> - 단순 RPC → gRPC 또는 TCP
> - 이벤트 스트리밍 → Kafka
> - 전통적 메시지 큐 → RabbitMQ
> - 경량 pub/sub → Redis 또는 NATS

## Standalone Microservice 부트스트랩

HTTP 서버 없이 순수 microservice만 실행하는 방식. 공식 예시:

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.TCP,
      options: {
        host: '0.0.0.0',
        port: 3001,
      },
    },
  );

  app.enableShutdownHooks();
  await app.listen();
}
bootstrap();
```

> 공식 Hint 인용: *"Microservices use the **TCP** transport layer by default."*

### Redis 예시

```typescript
const app = await NestFactory.createMicroservice<MicroserviceOptions>(
  AppModule,
  {
    transport: Transport.REDIS,
    options: {
      host: 'localhost',
      port: 6379,
    },
  },
);
```

### NATS 예시

```typescript
const app = await NestFactory.createMicroservice<MicroserviceOptions>(
  AppModule,
  {
    transport: Transport.NATS,
    options: {
      servers: ['nats://localhost:4222'],
      queue: 'orders_queue', // queue group 이름 — load balancing
    },
  },
);
```

### gRPC 예시

```typescript
import { join } from 'node:path';

const app = await NestFactory.createMicroservice<MicroserviceOptions>(
  AppModule,
  {
    transport: Transport.GRPC,
    options: {
      package: 'hero',
      protoPath: join(__dirname, 'hero.proto'),
      url: '0.0.0.0:50051',
    },
  },
);
```

## Hybrid Application

HTTP 서버와 microservice를 한 프로세스에서 동시에 실행. 공식 문서가 명시적으로 권장하는 패턴이다.

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule); // 일반 HTTP app

  // 1개 이상의 microservice를 추가로 연결
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.REDIS,
    options: { host: 'localhost', port: 6379 },
  });

  // 여러 transport를 동시에 연결도 가능
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: { host: '0.0.0.0', port: 3001 },
  });

  app.enableShutdownHooks();

  await app.startAllMicroservices(); // ← 모든 microservice 시작
  await app.listen(3000); // HTTP listen
}
bootstrap();
```

사용 케이스:
- HTTP API + Kafka consumer를 한 서비스에 둠 (예: 주문 API + 주문 이벤트 수신)
- internal RPC (TCP/gRPC) + external REST API 동시 노출

> **주의**: Hybrid 앱에서도 Controller는 공유되지만, 한 controller 메서드는 `@Get` 또는 `@MessagePattern` 중 하나만 붙여야 한다. 두 개를 동시에 붙이면 Nest는 어느 transport에서 호출된 것인지 구분하기 위해 `host.getType()`을 사용해야 한다 (`http` / `rpc` / `ws`).

## `@MessagePattern` vs `@EventPattern`

공식 문서의 두 가지 메시지 스타일:

### `@MessagePattern` — Request/Response

응답을 반환하는 RPC 스타일. `send()`로 호출.

```typescript
// src/modules/math/math.controller.ts
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

@Controller()
export class MathController {
  @MessagePattern({ cmd: 'sum' })
  accumulate(@Payload() data: number[]): number {
    return (data ?? []).reduce((a, b) => a + b, 0);
  }
}
```

async도 지원:

```typescript
@MessagePattern({ cmd: 'get-user' })
async getUser(@Payload() data: { id: string }): Promise<User | null> {
  return this.usersService.findById(data.id);
}
```

> 공식 인용: *"This decorator should only be used within controller classes, as they serve as the entry points for your application. Using it in providers will have no effect."*

### `@EventPattern` — Fire-and-Forget

응답 없는 이벤트 처리. `emit()`으로 발행.

```typescript
// src/modules/notifications/notifications.controller.ts
import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';

interface UserCreatedEvent {
  userId: string;
  email: string;
}

@Controller()
export class NotificationsController {
  @EventPattern('user.created')
  async handleUserCreated(@Payload() data: UserCreatedEvent): Promise<void> {
    await this.notificationsService.sendWelcomeEmail(data.userId, data.email);
  }
}
```

> 공식 Hint: *"You can register multiple event handlers for a **single** event pattern, and all of them will be automatically triggered in parallel."*

### `@Ctx` — transporter-specific context

```typescript
import { MessagePattern, Payload, Ctx, NatsContext } from '@nestjs/microservices';

@MessagePattern('time.us.*')
getDate(@Payload() data: unknown, @Ctx() context: NatsContext): string {
  console.log(`Subject: ${context.getSubject()}`); // e.g. "time.us.east"
  return new Date().toISOString();
}
```

각 transport마다 별도 context 타입이 있다 (`NatsContext`, `KafkaContext`, `RmqContext` 등).

## `ClientProxy` (Producer)

다른 서비스에 메시지를 보내는 side. 공식 문서 인용: *"A client Nest application can exchange messages or publish events to a Nest microservice using the `ClientProxy` class."*

### `send()` — cold Observable

공식 주의점: *"This method returns a **cold Observable**, which means that you have to explicitly subscribe to it before the message will be sent."*

```typescript
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';

@Injectable()
export class OrdersService {
  constructor(@Inject('MATH_SERVICE') private readonly client: ClientProxy) {}

  async calculateTotal(amounts: number[]): Promise<number> {
    // Observable을 Promise로 변환 + 5초 timeout
    return firstValueFrom(
      this.client.send<number>({ cmd: 'sum' }, amounts).pipe(timeout(5000)),
    );
  }
}
```

### `emit()` — hot Observable

공식 인용: *"This method returns a **hot Observable** (in contrast to the cold Observable returned by `send()`), meaning that regardless of whether you explicitly subscribe to the observable, the proxy will immediately attempt to deliver the event."*

```typescript
async publishUserCreated(user: User): Promise<void> {
  this.client.emit('user.created', { userId: user.id, email: user.email });
  // 구독 안 해도 전송됨. return value 필요 없음.
}
```

## `ClientsModule.register` / `registerAsync`

`ClientProxy`를 모듈에 등록하는 표준 방법.

### 동기 등록

```typescript
import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'MATH_SERVICE',
        transport: Transport.TCP,
        options: { host: 'math-service', port: 3001 },
      },
      {
        name: 'NOTIFICATIONS_SERVICE',
        transport: Transport.REDIS,
        options: { host: 'localhost', port: 6379 },
      },
    ]),
  ],
})
export class OrdersModule {}
```

주입:

```typescript
constructor(
  @Inject('MATH_SERVICE') private readonly mathClient: ClientProxy,
  @Inject('NOTIFICATIONS_SERVICE') private readonly notifClient: ClientProxy,
) {}
```

### 비동기 등록 (`ConfigService` 주입)

```typescript
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: 'MATH_SERVICE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.getOrThrow<string>('MATH_SERVICE_HOST'),
            port: config.getOrThrow<number>('MATH_SERVICE_PORT'),
          },
        }),
      },
    ]),
  ],
})
export class OrdersModule {}
```

### Lazy connection

공식 인용: *"The `ClientProxy` is **lazy**. It doesn't initiate a connection immediately. Instead, it will be established before the first microservice call."*

부트스트랩 시점에 연결을 강제하려면 `OnApplicationBootstrap`에서 `connect()`:

```typescript
@Injectable()
export class OrdersService implements OnApplicationBootstrap {
  constructor(@Inject('MATH_SERVICE') private readonly client: ClientProxy) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.client.connect(); // 실패하면 에러 throw — fail fast
  }
}
```

## Timeout & Retry

> **Circuit breaker, retry with exponential backoff + jitter, bulkhead 이론**은 [../resilience.md#circuit-breaker-pattern](../resilience.md#circuit-breaker-pattern)에 정식 정의가 있다.
> **Idempotency 설계**는 [../distributed-systems.md#idempotency-설계](../distributed-systems.md#idempotency-설계) 참조.

### Timeout — 공식 권장 방법

공식 문서 인용: *"To prevent indefinitely long waiting, you can use timeouts. ... use the `timeout` operator from rxjs within the pipe."*

```typescript
import { firstValueFrom, throwError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { RequestTimeoutException } from '@nestjs/common';

async fetchData(): Promise<Data> {
  return firstValueFrom(
    this.client.send<Data>({ cmd: 'get-data' }, {}).pipe(
      timeout(3000),
      catchError((err) => {
        if (err.name === 'TimeoutError') {
          return throwError(() => new RequestTimeoutException('Upstream timeout'));
        }
        return throwError(() => err);
      }),
    ),
  );
}
```

### Retry — `retryAttempts`, `retryDelay`

TCP transport는 내장 옵션을 제공한다 (공식 문서 TCP 옵션 표):

```typescript
ClientsModule.register([
  {
    name: 'MATH_SERVICE',
    transport: Transport.TCP,
    options: {
      host: 'math-service',
      port: 3001,
      retryAttempts: 5,
      retryDelay: 1000, // ms
    },
  },
]);
```

더 정교한 retry(exponential backoff + jitter)는 RxJS `retry` operator로 구현:

```typescript
import { retry } from 'rxjs/operators';

this.client.send(pattern, data).pipe(
  retry({
    count: 3,
    delay: (error, retryCount) => {
      const base = 100 * 2 ** retryCount; // exponential
      const jitter = Math.random() * 100;
      return timer(base + jitter);
    },
  }),
);
```

## TLS 암호화 (TCP)

공식 예시 그대로. 외부 네트워크 통신 시 필수.

```typescript
// Server
import * as fs from 'node:fs';

const key = fs.readFileSync('/secrets/server.key', 'utf8');
const cert = fs.readFileSync('/secrets/server.crt', 'utf8');

const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
  transport: Transport.TCP,
  options: {
    tlsOptions: { key, cert },
  },
});
```

```typescript
// Client
ClientsModule.register([
  {
    name: 'MATH_SERVICE',
    transport: Transport.TCP,
    options: {
      tlsOptions: {
        ca: [fs.readFileSync('/secrets/ca.crt', 'utf-8').toString()],
      },
    },
  },
]);
```

> **같은 VPC 내부 통신이면** TLS 없이 TCP만으로 충분하다 (성능/복잡도 trade-off). 외부 네트워크 경유 시엔 TLS 필수.

## 안티패턴

### 1. `@MessagePattern`을 Service에 사용

```typescript
// ❌ Provider에 붙임 — Nest runtime이 무시함
@Injectable()
export class MathService {
  @MessagePattern({ cmd: 'sum' })
  sum(data: number[]) { /* 동작 안 함 */ }
}
```

공식 인용: *"This decorator should only be used within controller classes."*

### 2. `send()` 결과를 subscribe 하지 않음

```typescript
// ❌ cold observable — 호출은 되지만 응답을 기다리지 않음
this.client.send({ cmd: 'sum' }, [1, 2, 3]);
```

항상 `firstValueFrom` 또는 `.subscribe()` 사용.

### 3. Timeout 없이 `send()` 호출

```typescript
// ❌ upstream이 멈추면 무한 대기
await firstValueFrom(this.client.send(pattern, data));
```

모든 외부 호출에 `timeout()` 적용. 5초 정도가 일반적.

### 4. Hybrid app에서 `startAllMicroservices()` 누락

```typescript
// ❌ microservice가 시작 안 됨
const app = await NestFactory.create(AppModule);
app.connectMicroservice({ transport: Transport.REDIS, /* ... */ });
await app.listen(3000); // ← startAllMicroservices() 빠짐
```

반드시 `await app.startAllMicroservices()` 먼저 호출 후 `app.listen()`.

### 5. `EventPattern`에서 에러를 삼킴

```typescript
// ❌ 처리 실패해도 broker는 성공으로 알고 ack
@EventPattern('user.created')
async handleUserCreated(@Payload() data: UserCreatedEvent) {
  try {
    await this.notifier.send(data);
  } catch (err) {
    // 로그만 찍고 끝
  }
}
```

Kafka/RabbitMQ 같은 broker는 ack 기반이다. 실패 처리는 DLQ 또는 retry policy로 설계해야 한다. 자세한 것은 [../message-queues.md](../message-queues.md)에서 다룬다.

### 6. Kafka offset 수동 관리 누락

Kafka transport는 기본적으로 auto-commit 이지만, exactly-once를 원하면 수동 commit이 필요하다. [공식 Kafka 문서](https://docs.nestjs.com/microservices/kafka) 참조.

### 7. `@nestjs/microservices`를 단순 REST API에 도입

Microservice 복잡성은 운영 비용이 크다. monolith로 충분한 경우 Microservice로 나누지 마라. 결정 기준은 [../microservices.md#monolith-vs-microservices-결정-기준](../microservices.md#monolith-vs-microservices-결정-기준)에서 다룬다.

## Related

- [../microservices.md](../microservices.md) — Monolith vs Microservices, decomposition 전략, API Gateway, service discovery
- [../distributed-systems.md](../distributed-systems.md) — Idempotency, distributed lock, CAP theorem, consensus
- [../message-queues.md](../message-queues.md) — BullMQ, RabbitMQ, Kafka, DLQ 설계
- [../resilience.md](../resilience.md) — Circuit breaker, retry, timeout 원칙
- [./lifecycle-shutdown.md](./lifecycle-shutdown.md) — hybrid app 종료
- [./controllers.md](./controllers.md) — `@Controller` + `@MessagePattern` 혼합

## References (공식 문서)

- [NestJS Docs — Microservices Basics](https://docs.nestjs.com/microservices/basics) — `NestFactory.createMicroservice`, transporter 종류, `@MessagePattern`/`@EventPattern`, `ClientProxy`, `ClientsModule.register/registerAsync`, lazy connection, timeout with rxjs, TLS, hybrid app
- [NestJS Docs — Redis Transporter](https://docs.nestjs.com/microservices/redis)
- [NestJS Docs — NATS Transporter](https://docs.nestjs.com/microservices/nats)
- [NestJS Docs — gRPC Transporter](https://docs.nestjs.com/microservices/grpc) — protobuf 설정, service class
- [NestJS Docs — Kafka Transporter](https://docs.nestjs.com/microservices/kafka) — partition, consumer group, offset
- [NestJS Docs — RabbitMQ Transporter](https://docs.nestjs.com/microservices/rabbitmq)
