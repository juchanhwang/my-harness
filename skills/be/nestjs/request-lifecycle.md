# NestJS Request Lifecycle

> 이 파일은 **NestJS 11** 전용 구현을 다룬다.
> Framework-agnostic 미들웨어 체인 개념(onion model)은 [../architecture.md](../architecture.md)에, 구조화 로깅/tracing은 [../observability.md](../observability.md)에 정식 정의가 있다.

## 목차

1. [전체 Lifecycle 다이어그램](#전체-lifecycle-다이어그램)
2. [Middleware](#middleware)
3. [Guards](#guards)
4. [Interceptors](#interceptors)
5. [Pipes](#pipes)
6. [Exception Filters](#exception-filters)
7. [실행 순서 요약 (공식)](#실행-순서-요약-공식)
8. [Global Component 등록 방식](#global-component-등록-방식)
9. [각 컴포넌트 선택 가이드](#각-컴포넌트-선택-가이드)
10. [안티패턴](#안티패턴)
11. [Related](#related)
12. [References](#references-공식-문서)

## 전체 Lifecycle 다이어그램

공식 문서 `faq/request-lifecycle`에서 정의한 전체 흐름:

```
Incoming Request
      ↓
[1] Middleware
      │  - Globally bound (app.use)
      │  - Module bound (NestModule.configure → MiddlewareConsumer)
      ↓
[2] Guards (→ CanActivate)
      │  - Global → Controller → Route
      ↓
[3] Interceptors (pre-handler)
      │  - Global → Controller → Route
      ↓
[4] Pipes
      │  - Global → Controller → Route → Route Parameter (last-to-first)
      ↓
[5] Controller method handler
      ↓
[6] Service (if any)
      ↓
[7] Interceptors (post-handler, RxJS pipe)
      │  - Route → Controller → Global  (FILO / inside-out)
      ↓
[8] Exception Filters (only if uncaught exception)
      │  - Route → Controller → Global  (lowest first)
      ↓
Server Response
```

> 공식 문서는 이 순서를 "General request lifecycle"로 명시하며, Interceptor는 Observable 기반이므로 inbound는 **outside-in**, outbound는 **inside-out**으로 resolve 된다.

## Middleware

Express/Fastify의 미들웨어와 동등하며, **경로 기반**으로 매칭되는 유일한 컴포넌트다. Controller/Handler 레벨에 적용할 수 없다.

### 작성

```typescript
// src/common/middleware/request-id.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const requestId = req.headers['x-request-id']?.toString() ?? randomUUID();
    (req as Request & { requestId: string }).requestId = requestId;
    next();
  }
}
```

### 등록

```typescript
// src/app.module.ts
import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';

@Module({ imports: [CatsModule] })
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
```

### Global Middleware (DI 불가)

```typescript
// main.ts
app.use(someMiddleware); // 함수형 미들웨어, DI 컨테이너 사용 불가
```

> **언제 middleware를 쓸까**: platform-specific API(Express `req.session`, body-parser 설정)가 필요하거나, Guard보다 더 먼저(예: request id 부여) 처리해야 할 때. 그 외에는 **Guard / Interceptor를 우선**하라.
>
> **공식 경고**: Nest는 `body-parser`를 기본 등록한다. 커스텀 body-parser를 쓰려면 `NestFactory.create(AppModule, { bodyParser: false })`로 꺼야 한다.

## Guards

**단일 책임**: 현재 요청이 handler에 도달할 자격이 있는가를 판단. 없으면 `false` 반환 → Nest가 자동으로 `ForbiddenException`을 throw.

```typescript
// src/common/guards/jwt-auth.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('Missing Bearer token');
    }

    try {
      const payload = await this.jwt.verifyAsync(token);
      (request as Request & { user: unknown }).user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }

  private extractToken(req: Request): string | undefined {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return undefined;
    return header.slice('Bearer '.length);
  }
}
```

**언제 Guard를 쓸까**: 인증/인가 (`JwtAuthGuard`, `RolesGuard`), feature flag, IP allowlist 등 **"통과/차단"** 이분법 결정. 데이터 변환이나 응답 후처리는 Interceptor의 역할.

## Interceptors

가장 강력한 컴포넌트. request/response 양방향을 모두 가로챌 수 있다. RxJS Observable 기반.

```typescript
// src/common/interceptors/timing.interceptor.ts
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';

@Injectable()
export class TimingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TimingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const start = performance.now();
    const request = context.switchToHttp().getRequest<{ method: string; url: string }>();

    return next.handle().pipe(
      tap({
        next: () => {
          const elapsed = performance.now() - start;
          this.logger.log(`${request.method} ${request.url} — ${elapsed.toFixed(2)}ms`);
        },
        error: (err) => {
          const elapsed = performance.now() - start;
          this.logger.warn(
            `${request.method} ${request.url} failed after ${elapsed.toFixed(2)}ms: ${err instanceof Error ? err.message : 'unknown'}`,
          );
        },
      }),
    );
  }
}
```

**Interceptor 용도**:
- Request/Response 변환 (`map`, `@ClassSerializerInterceptor`)
- Cross-cutting 로깅/메트릭/tracing
- Timeout (`timeout` operator)
- Cache 조회
- Exception → Domain error 변환 (`catchError`)

> **공식 인용**: *"Inbound requests will go through the standard global, controller, route level resolution, but the response side of the request (i.e., after returning from the controller method handler) will be resolved from route to controller to global."*
>
> 이는 양파 껍질(onion) 구조로, route interceptor가 가장 안쪽이다.

## Pipes

**단일 책임**: 입력값 변환 & 검증. route parameter 단위로 동작한다.

### Built-in pipes

`@nestjs/common`이 제공:

- `ValidationPipe` (class-validator 기반 — [./validation.md](./validation.md)에서 상세)
- `ParseIntPipe`, `ParseFloatPipe`, `ParseBoolPipe`
- `ParseUUIDPipe`
- `ParseArrayPipe`, `ParseEnumPipe`
- `DefaultValuePipe`

```typescript
@Get(':id')
findOne(
  @Param('id', ParseUUIDPipe) id: string,
  @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
): Promise<Cat> {
  return this.catsService.findOne(id, limit);
}
```

### Custom pipe

```typescript
import { PipeTransform, Injectable, ArgumentMetadata, BadRequestException } from '@nestjs/common';

@Injectable()
export class TrimPipe implements PipeTransform<string, string> {
  transform(value: string, metadata: ArgumentMetadata): string {
    if (typeof value !== 'string') {
      throw new BadRequestException(`${metadata.data} must be a string`);
    }
    return value.trim();
  }
}
```

> **공식 인용**: *"At a route parameter level, if you have multiple pipes running, they will run in the order of the last parameter with a pipe to the first."*
>
> 즉 파라미터가 여러 개일 때 pipe는 **뒤에서 앞으로** 실행된다.

## Exception Filters

**모든 uncaught exception**을 catch 해서 응답으로 변환한다. 자세한 구현은 [./error-handling.md](./error-handling.md)에서 다룬다.

```typescript
// src/common/filters/all-exceptions.filter.ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    response.status(status).json({
      type: 'about:blank',
      title: exception instanceof HttpException ? exception.message : 'Internal Server Error',
      status,
      instance: request.url,
    });
  }
}
```

> **공식 경고 (두 가지)**:
> 1. *"Filters are the only component that do not resolve global first. Instead, filters resolve from the lowest level possible."* — Guards/Interceptors/Pipes와 정반대.
> 2. *"Filters are only executed if any uncaught exception occurs during the request process. Caught exceptions, such as those caught with a try/catch will not trigger Exception Filters to fire."*

## 실행 순서 요약 (공식)

공식 문서 원문 그대로 (`faq/request-lifecycle.md`):

```
 1. Incoming request
 2. Middleware
    2.1. Globally bound middleware
    2.2. Module bound middleware
 3. Guards
    3.1 Global guards
    3.2 Controller guards
    3.3 Route guards
 4. Interceptors (pre-controller)
    4.1 Global interceptors
    4.2 Controller interceptors
    4.3 Route interceptors
 5. Pipes
    5.1 Global pipes
    5.2 Controller pipes
    5.3 Route pipes
    5.4 Route parameter pipes  (last parameter → first)
 6. Controller (method handler)
 7. Service (if exists)
 8. Interceptors (post-request)
    8.1 Route interceptor
    8.2 Controller interceptor
    8.3 Global interceptor
 9. Exception filters
    9.1 Route
    9.2 Controller
    9.3 Global
10. Server response
```

**주의할 비대칭**:

| 컴포넌트 | Global → Local 순서 | Local → Global 순서 |
|---|---|---|
| Middleware | — (경로 기반만) | — |
| Guards | ✅ (우선 Global) | — |
| Interceptors (inbound) | ✅ | — |
| Interceptors (outbound) | — | ✅ |
| Pipes | ✅ | — |
| Filters | — | ✅ (local이 먼저 catch 시도) |

## Global Component 등록 방식

### 1. `main.ts`에서 `useGlobal*()` (DI 불가)

```typescript
// main.ts
const app = await NestFactory.create(AppModule);
app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
app.useGlobalInterceptors(new TimingInterceptor());
app.useGlobalGuards(new JwtAuthGuard(/* ... */)); // 생성자 인자 직접 전달
app.useGlobalFilters(new AllExceptionsFilter());
```

**문제**: 해당 컴포넌트에 **DI 주입이 불가**하다. JwtService, ConfigService 등을 주입하려면 아래 방식을 사용해야 한다.

### 2. `APP_*` 토큰으로 provider 등록 (DI 가능 — 권장)

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';

@Module({
  providers: [
    { provide: APP_PIPE, useClass: ValidationPipe },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: TimingInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
```

이 방법으로 등록하면 해당 컴포넌트가 모듈의 다른 provider를 `constructor`로 주입받을 수 있다. **프로덕션에서는 이 방식이 기본**이다.

> **`ValidationPipe`의 옵션은 어떻게 넘기나?** useFactory로 인스턴스 생성:
>
> ```typescript
> {
>   provide: APP_PIPE,
>   useFactory: () =>
>     new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
> }
> ```

## 각 컴포넌트 선택 가이드

| 원하는 동작 | 사용할 컴포넌트 |
|---|---|
| Request id 부여, body parsing, helmet 같은 Express 생태계 미들웨어 | **Middleware** |
| JWT 검증, RBAC, IP allowlist, feature flag | **Guard** |
| 요청/응답 로깅, 타이밍 측정, tracing span, transform, timeout | **Interceptor** |
| 입력값 검증, type 변환 (string → number), DTO validation | **Pipe** |
| 예외 → HTTP 응답 매핑, 전역 에러 로깅, Sentry 전송 | **Exception Filter** |
| Query 필터링, Pagination 적용 | **Pipe** (custom `PaginationPipe`) 또는 DTO |
| Response 헤더 추가 (단순) | `@Header` decorator 또는 **Interceptor** |
| 캐시 lookup/set | **Interceptor** (`@CacheInterceptor`) |

## 안티패턴

### 1. Middleware로 인증 처리

```typescript
// ❌ 에러가 일어나도 ExceptionFilter가 잡지 못한다
app.use((req, res, next) => {
  if (!req.headers.authorization) {
    res.status(401).json({ error: 'Unauthorized' }); // 직접 response
    return;
  }
  next();
});
```

인증은 **Guard**의 책임이다. Middleware에서 throw 하면 ExceptionFilter가 잡을 수 있지만, 직접 `res.send()`를 호출하면 Interceptor/Filter가 개입할 수 없다.

### 2. Global component를 `main.ts`에서 등록하면서 DI를 기대

```typescript
// ❌ ConfigService가 주입되지 않음
app.useGlobalGuards(new JwtAuthGuard(undefined as unknown as JwtService));
```

`APP_GUARD` provider 방식을 쓰거나, `useFactory`로 module 내부에서 생성하라.

### 3. Interceptor에서 비즈니스 로직 실행

```typescript
// ❌ 주문 생성 로직이 interceptor에
@Injectable()
export class OrderInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      tap(async (order) => {
        await this.ordersService.sendNotification(order); // 비즈니스 로직
      }),
    );
  }
}
```

Interceptor는 cross-cutting concern 전용이다. 특정 도메인 로직은 Service에 둬라.

### 4. Filter에서 다시 throw

```typescript
// ❌ filter 끼리는 exception을 주고받을 수 없다 (공식 문서)
@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    throw new InternalServerErrorException(); // 잡히지 않음
  }
}
```

공식 인용: *"exceptions cannot be passed from filter to filter."* Filter 안에서 새 exception을 throw 해도 다른 filter가 catch 하지 않는다. 상속(`extends BaseExceptionFilter`)으로 해결한다.

### 5. 같은 책임을 여러 컴포넌트에 분산

```typescript
// ❌ 인증 로직이 middleware + guard에 나눠짐
```

한 책임은 한 컴포넌트에. 인증은 Guard, 로깅은 Interceptor, 검증은 Pipe. 혼합하면 디버깅 난이도가 폭발적으로 증가한다.

## Related

- [./controllers.md](./controllers.md) — `@UseGuards`, `@UseInterceptors`, `@UsePipes` 적용 위치
- [./validation.md](./validation.md) — `ValidationPipe` 상세 옵션
- [./error-handling.md](./error-handling.md) — `ExceptionFilter` 구현 및 RFC 9457
- [./observability.md](./observability.md) — Interceptor 기반 logging/tracing
- [../fastify/api-design.md](../fastify/api-design.md) — Fastify hook 비교 (`onRequest`/`preHandler`/`onSend`/`onError`)

## References (공식 문서)

- [NestJS Docs — Request Lifecycle (FAQ)](https://docs.nestjs.com/faq/request-lifecycle) — 전체 실행 순서, Middleware → Guards → Interceptors → Pipes → Handler → Interceptors → Filters, filter의 local-first 규칙, interceptor의 inbound/outbound 비대칭
- [NestJS Docs — Middleware](https://docs.nestjs.com/middleware) — `NestMiddleware`, `MiddlewareConsumer`, `forRoutes`, global vs module-bound, body-parser 주의
- [NestJS Docs — Guards](https://docs.nestjs.com/guards) — `CanActivate`, `ExecutionContext`, `APP_GUARD`
- [NestJS Docs — Interceptors](https://docs.nestjs.com/interceptors) — `NestInterceptor`, `CallHandler`, RxJS operators, `APP_INTERCEPTOR`
- [NestJS Docs — Pipes](https://docs.nestjs.com/pipes) — `PipeTransform`, built-in pipes, `APP_PIPE`
- [NestJS Docs — Exception Filters](https://docs.nestjs.com/exception-filters) — `ExceptionFilter`, `@Catch`, `APP_FILTER`
