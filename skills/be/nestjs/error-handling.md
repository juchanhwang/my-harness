# NestJS Error Handling

> 이 파일은 **NestJS 11** 전용 구현을 다룬다.
> Framework-agnostic 에러 분류(Operational vs Programmer), `AppError` 계층 설계, Pino 로깅 패턴은 [../error-handling.md](../error-handling.md)에 정식 정의가 있다.

## 목차

1. [NestJS 에러 레이어 개요](#nestjs-에러-레이어-개요)
2. [`HttpException` 계층](#httpexception-계층)
3. [Built-in HTTP Exception 목록](#built-in-http-exception-목록)
4. [Custom Exception 설계](#custom-exception-설계)
5. [Exception Filter](#exception-filter)
6. [Global Filter 등록 (`APP_FILTER` vs `useGlobalFilters`)](#global-filter-등록)
7. [RFC 9457 Problem Details 구현](#rfc-9457-problem-details-구현)
8. [ValidationPipe 에러 포맷 커스터마이징](#validationpipe-에러-포맷-커스터마이징)
9. [Logging 통합 (Pino)](#logging-통합-pino)
10. [Sentry 통합](#sentry-통합)
11. [안티패턴](#안티패턴)
12. [Related](#related)
13. [References](#references-공식-문서)

> **에러 분류 이론**(Operational vs Programmer, `AppError` 계층, Centralized Error Handling 패턴)은 [../error-handling.md](../error-handling.md#1-centralized-error-handling-패턴)에 정식 정의가 있다.
> 이 파일은 NestJS `HttpException` + `ExceptionFilter` 통합과 RFC 9457 형식화에 집중한다.

## NestJS 에러 레이어 개요

공식 문서 인용: *"Nest comes with a built-in exceptions layer which is responsible for processing all unhandled exceptions across an application. When an exception is not handled by your application code, it is caught by this layer, which then automatically sends an appropriate user-friendly response."*

기본 동작:

- `HttpException` (또는 그 하위 클래스)이 throw 되면 → 해당 status와 body로 응답
- 그 외 예외는 500 `Internal Server Error`로 응답
- `HttpException` 계열은 **기본 로그를 남기지 않는다** (공식 인용: *"the exception filter does not log built-in exceptions like HttpException ... they are treated as part of the normal application flow"*). `IntrinsicException`을 상속하므로.

## `HttpException` 계층

```typescript
import { HttpException, HttpStatus } from '@nestjs/common';

throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
```

생성자 signature (공식):

```typescript
new HttpException(
  response: string | object, // body가 될 값
  status: number,             // HTTP status
  options?: { cause?: unknown; description?: string }, // ← 세 번째 옵션 (Node.js Error cause)
)
```

- `response`가 `string`이면 body는 `{ statusCode, message }` 형태
- `response`가 `object`면 그 객체가 그대로 body가 됨
- `cause`는 Node.js `Error.cause` 표준. 직렬화되지 않고 **로깅용**

예시 — 원본 에러를 cause로 넘기기:

```typescript
try {
  await this.repository.save(entity);
} catch (error) {
  throw new HttpException(
    { status: HttpStatus.CONFLICT, error: 'duplicate email' },
    HttpStatus.CONFLICT,
    { cause: error },
  );
}
```

## Built-in HTTP Exception 목록

공식 문서에 명시된 전체 목록 (모두 `@nestjs/common`에서 import):

| Exception | Status | 용도 |
|---|---|---|
| `BadRequestException` | 400 | 클라이언트 요청 형식 오류 |
| `UnauthorizedException` | 401 | 인증 실패 (토큰 없음/만료) |
| `ForbiddenException` | 403 | 인가 실패 (권한 부족) |
| `NotFoundException` | 404 | 리소스 없음 |
| `MethodNotAllowedException` | 405 | |
| `NotAcceptableException` | 406 | |
| `RequestTimeoutException` | 408 | |
| `ConflictException` | 409 | 중복/버전 충돌 |
| `GoneException` | 410 | |
| `HttpVersionNotSupportedException` | 505 | |
| `PayloadTooLargeException` | 413 | |
| `UnsupportedMediaTypeException` | 415 | |
| `UnprocessableEntityException` | 422 | 구문은 맞지만 의미상 처리 불가 |
| `PreconditionFailedException` | 412 | |
| `InternalServerErrorException` | 500 | |
| `NotImplementedException` | 501 | |
| `BadGatewayException` | 502 | 외부 의존성 실패 |
| `ServiceUnavailableException` | 503 | |
| `GatewayTimeoutException` | 504 | |
| `ImATeapotException` | 418 | (농담) |

```typescript
import { NotFoundException } from '@nestjs/common';

const user = await this.usersRepo.findById(id);
if (!user) {
  throw new NotFoundException(`User with id ${id} not found`);
}
```

공식 문서의 세 번째 생성자 옵션:

```typescript
throw new BadRequestException('Invalid payload', {
  cause: new Error('parse error'),
  description: 'JSON schema validation failed',
});
// → { message: 'Invalid payload', error: 'JSON schema validation failed', statusCode: 400 }
```

## Custom Exception 설계

공식 문서 인용: *"If you do need to create customized exceptions, it's good practice to create your own exceptions hierarchy, where your custom exceptions inherit from the base HttpException class."*

두 가지 접근이 있다. 프로젝트 BE skill의 `../error-handling.md#2-custom-error-classes-설계`가 정의한 **framework-agnostic `AppError` 계층**을 그대로 사용하면 프레임워크 독립적이지만, NestJS에서는 `HttpException`을 상속하는 것이 filter 자동 매핑의 이점을 얻는다.

### 권장: `HttpException` 기반 Domain Exception

```typescript
// src/common/exceptions/insufficient-balance.exception.ts
import { HttpException, HttpStatus } from '@nestjs/common';

export class InsufficientBalanceException extends HttpException {
  constructor(required: number, current: number) {
    super(
      {
        code: 'INSUFFICIENT_BALANCE',
        message: 'Insufficient balance',
        required,
        current,
      },
      HttpStatus.UNPROCESSABLE_ENTITY, // 422
    );
  }
}

// src/common/exceptions/duplicate-email.exception.ts
export class DuplicateEmailException extends HttpException {
  constructor(email: string) {
    super(
      { code: 'DUPLICATE_EMAIL', message: `Email ${email} already in use` },
      HttpStatus.CONFLICT, // 409
    );
  }
}
```

### Service에서 사용

```typescript
@Injectable()
export class OrdersService {
  async createOrder(userId: string, amount: number): Promise<Order> {
    const balance = await this.wallet.getBalance(userId);
    if (balance < amount) {
      throw new InsufficientBalanceException(amount, balance);
    }
    // ...
  }
}
```

> **Service layer에서 HTTP 예외를 throw 해도 되는가?** 엄격한 hexagonal architecture 관점에서는 Service가 HTTP를 알아선 안 된다. 실무에서는 두 가지 선택이 있다:
>
> 1. **실용주의**: Service가 `HttpException` 계열을 throw → Nest filter가 자동 매핑 (소규모 서비스에 적합)
> 2. **순수주의**: Service는 순수 domain error (`AppError` 계층)를 throw → Interceptor/Filter가 HTTP 응답으로 매핑 (도메인 재사용, GraphQL/CLI 등 multi-transport에 적합)
>
> 선택 기준은 [../error-handling.md#2-custom-error-classes-설계](../error-handling.md#2-custom-error-classes-설계)에서 다룬다. 이 파일에서는 **실용주의 패턴**을 기본으로 쓴다.

## Exception Filter

전역 JSON 포맷을 커스터마이징하려면 filter를 작성한다.

```typescript
// src/common/filters/http-exception.filter.ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter<HttpException> {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const body = exception.getResponse();

    response.status(status).json({
      ...(typeof body === 'object' ? body : { message: body }),
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
```

> **Fastify 사용 시**: 공식 경고 인용 — *"If you are using `@nestjs/platform-fastify` you can use `response.send()` instead of `response.json()`."*

### `@Catch()` decorator

- `@Catch(HttpException)` — `HttpException`과 그 하위만
- `@Catch(HttpException, RpcException)` — 여러 타입
- `@Catch()` — 모든 예외 (parameter 없음)

> **공식 경고**: *"When combining an exception filter that catches everything with a filter that is bound to a specific type, the 'Catch anything' filter should be declared first to allow the specific filter to correctly handle the bound type."*

### Catch-everything (HttpAdapterHost 활용)

플랫폼 독립적인 filter:

```typescript
// src/common/filters/all-exceptions.filter.ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();

    const httpStatus =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const path = httpAdapter.getRequestUrl(ctx.getRequest());

    // 5xx만 에러 로그 + Sentry 전송
    if (httpStatus >= 500) {
      this.logger.error(
        {
          err: exception,
          path,
          statusCode: httpStatus,
        },
        'Unhandled exception',
      );
    }

    const body = {
      statusCode: httpStatus,
      timestamp: new Date().toISOString(),
      path,
      message:
        exception instanceof HttpException
          ? exception.getResponse()
          : 'Internal Server Error',
    };

    httpAdapter.reply(ctx.getResponse(), body, httpStatus);
  }
}
```

> **`AllExceptionsFilter`는 왜 `HttpAdapterHost`를 쓰는가?** 공식 문서는 이 필터를 "platform-agnostic"하게 만들기 위해 HTTP adapter를 주입받아 `httpAdapter.reply()`를 호출한다. Express/Fastify 어느 것을 써도 동일하게 동작한다.

## Global Filter 등록

두 가지 방법이 있다. 공식 문서 인용: *"global filters registered from outside of any module (with `useGlobalFilters()`) cannot inject dependencies."*

### 1. `useGlobalFilters` (DI 불가)

```typescript
// main.ts
const app = await NestFactory.create(AppModule);
const { httpAdapter } = app.get(HttpAdapterHost);
app.useGlobalFilters(new AllExceptionsFilter({ httpAdapter } as HttpAdapterHost));
await app.listen(process.env.PORT ?? 3000);
```

문제: 다른 provider(예: Logger, Sentry client)를 주입받을 수 없다.

### 2. `APP_FILTER` provider (DI 가능 — 권장)

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

@Module({
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter }, // catch-all 먼저
    { provide: APP_FILTER, useClass: HttpExceptionFilter }, // 특정 타입 나중
  ],
})
export class AppModule {}
```

> 공식 경고: *"The 'Catch anything' filter should be declared first."* 순서가 중요하다.

## RFC 9457 Problem Details 구현

NestJS가 기본 제공하는 `{ statusCode, message }` 포맷은 RFC 9457 (Problem Details for HTTP APIs)을 따르지 않는다. 실무에서는 RFC 9457로 통일하는 것이 국제 표준에 부합한다.

> **RFC 9457 원칙과 필드 정의**는 [../api-design.md#3-rfc-9457--problem-details-for-http-apis](../api-design.md#3-rfc-9457--problem-details-for-http-apis)에 정식 정의가 있다. 요약: `type`, `title`, `status`, `detail`, `instance` 필드 + extension.

### Problem Details Filter

```typescript
// src/common/filters/problem-details.filter.ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance: string;
  [key: string]: unknown; // extension members
}

const STATUS_TITLES: Readonly<Record<number, string>> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
};

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const instance = httpAdapter.getRequestUrl(ctx.getRequest());

    const problem = this.toProblem(exception, instance);

    if (problem.status >= 500) {
      this.logger.error({ err: exception, problem }, 'Unhandled 5xx exception');
    }

    const res = ctx.getResponse();
    httpAdapter.setHeader(res, 'Content-Type', 'application/problem+json');
    httpAdapter.reply(res, problem, problem.status);
  }

  private toProblem(exception: unknown, instance: string): ProblemDetails {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const title = STATUS_TITLES[status] ?? 'Error';

      if (typeof response === 'string') {
        return {
          type: 'about:blank',
          title,
          status,
          detail: response,
          instance,
        };
      }

      // 이미 object 형태 — extension으로 병합
      const obj = response as Record<string, unknown>;
      return {
        type: typeof obj.type === 'string' ? obj.type : 'about:blank',
        title: typeof obj.title === 'string' ? obj.title : title,
        status,
        detail: typeof obj.message === 'string' ? obj.message : undefined,
        instance,
        ...obj, // code, fields 등 extension 필드 보존
      };
    }

    return {
      type: 'about:blank',
      title: STATUS_TITLES[500]!,
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: 'An unexpected error occurred',
      instance,
    };
  }
}
```

공식 `Content-Type`은 `application/problem+json` (RFC 9457 §3.1). 반드시 설정해야 한다.

## ValidationPipe 에러 포맷 커스터마이징

기본 `ValidationPipe`는 에러 메시지를 배열로 반환한다. RFC 9457 확장 필드(`errors[]`)로 세분화하려면 `exceptionFactory`를 사용한다.

```typescript
// main.ts
import { BadRequestException, ValidationError, ValidationPipe } from '@nestjs/common';

app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors: ValidationError[]) =>
      new BadRequestException({
        type: 'https://example.com/errors/validation',
        title: 'Validation Failed',
        status: 400,
        detail: 'One or more fields are invalid',
        errors: flattenErrors(errors),
      }),
  }),
);

function flattenErrors(
  errors: readonly ValidationError[],
  parentPath = '',
): Array<{ field: string; messages: string[] }> {
  const result: Array<{ field: string; messages: string[] }> = [];
  for (const error of errors) {
    const path = parentPath ? `${parentPath}.${error.property}` : error.property;
    if (error.constraints) {
      result.push({ field: path, messages: Object.values(error.constraints) });
    }
    if (error.children?.length) {
      result.push(...flattenErrors(error.children, path));
    }
  }
  return result;
}
```

응답 예시:

```json
{
  "type": "https://example.com/errors/validation",
  "title": "Validation Failed",
  "status": 400,
  "detail": "One or more fields are invalid",
  "instance": "/api/users",
  "errors": [
    { "field": "email", "messages": ["email must be an email"] },
    { "field": "password", "messages": ["password must be longer than or equal to 8 characters"] }
  ]
}
```

## Logging 통합 (Pino)

공식 문서 인용: *"the exception filter does not log built-in exceptions like HttpException ... if you want to log these exceptions, you can create a custom exception filter."*

> **Pino 로깅 원칙, 로그 레벨, 민감정보 redact, serializer**는 [../observability.md#2-structured-logging-pino](../observability.md#2-structured-logging-pino)에 정식 정의가 있다.
>
> `nestjs-pino` 통합 설정은 [./observability.md](./observability.md#nestjs-pino-설정)에서 다룬다.

Filter에서 로깅할 때 원칙:

1. **4xx는 debug/info 레벨**, **5xx는 error 레벨**
2. `err` 필드에 원본 exception을 그대로 — Pino의 `err` serializer가 stack trace 포함 직렬화
3. `requestId` 포함 (middleware에서 부여)
4. 민감 정보(body의 password, Authorization header)는 redact

```typescript
import { Inject } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

@Catch()
export class LoggingExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    @Inject(PinoLogger) private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LoggingExceptionFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const level = status >= 500 ? 'error' : 'warn';
    this.logger[level](
      {
        err: exception,
        statusCode: status,
      },
      'Request failed',
    );

    // ... 응답 처리
  }
}
```

## Sentry 통합

> **Sentry 통합 원칙**(5xx만 전송, PII 제거, breadcrumb)은 [../observability.md#5-error-tracking-sentry](../observability.md#5-error-tracking-sentry)에 정식 정의가 있다.

NestJS 11 기준 공식 Sentry SDK는 `@sentry/nestjs`를 제공한다. 공식 문서 (sentry.io/platforms/javascript/guides/nestjs/) 참조 — NestJS 버전별 설치 방법이 업데이트되므로 반드시 해당 문서를 확인해야 한다.

간단한 패턴은 기존 filter에서 `Sentry.captureException(exception)` 호출:

```typescript
import * as Sentry from '@sentry/node';

@Catch()
export class SentryExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // 5xx만 Sentry 전송 — 4xx는 정상 흐름
    if (status >= 500) {
      Sentry.captureException(exception);
    }
    // ... 응답 처리는 다른 filter에 위임
  }
}
```

> **주의**: 4xx를 Sentry에 보내지 마라. `NotFoundException`, `BadRequestException`은 정상적인 비즈니스 흐름이며, Sentry 쿼터만 낭비된다.

## 안티패턴

### 1. `try/catch`로 에러를 삼키기

```typescript
// ❌ 에러를 먹어서 filter로 전파되지 않음
async findAll(): Promise<Cat[]> {
  try {
    return await this.service.findAll();
  } catch (error) {
    console.error(error); // 로그만 찍고 빈 배열 반환
    return [];
  }
}
```

공식 문서 인용: *"Filters are only executed if any uncaught exception occurs."* `try/catch`로 잡힌 예외는 filter에 도달하지 않는다. 정말 의도적으로 복구하는 경우가 아니면 throw 하라.

### 2. 5xx를 Service에서 직접 생성

```typescript
// ❌ 예상치 못한 상황을 500으로 wrap
throw new InternalServerErrorException('Database error');
```

500은 **예상치 못한** 프로그래머 에러다. Service는 의도된 에러만 throw 하고, 나머지는 그대로 흘려보내 `AllExceptionsFilter`가 500으로 매핑하게 하라.

### 3. Global filter를 `useGlobalFilters(new ...)`로 등록하면서 DI 기대

```typescript
// ❌ SentryClient 주입 불가
app.useGlobalFilters(new SentryExceptionFilter(undefined));
```

`APP_FILTER` provider 방식 사용.

### 4. 에러 응답에 stack trace 포함

```typescript
// ❌ production에서 stack 노출
return { error: exception.stack };
```

보안 사고. stack은 로그에만, 응답에는 절대 포함하지 마라.

### 5. Filter끼리 exception 주고받기

```typescript
// ❌ 공식 경고: exceptions cannot be passed from filter to filter
@Catch(HttpException)
export class HttpExceptionFilter {
  catch(exception: HttpException) {
    throw new InternalServerErrorException(); // 다른 filter가 잡지 못함
  }
}
```

상속(`extends BaseExceptionFilter`)으로 해결한다.

### 6. `HttpException`이 아닌 일반 Error를 Service에서 던짐

```typescript
// ⚠️ 주의: 이것도 동작하지만 정보가 부족
throw new Error('User not found');
```

Nest의 기본 filter는 이를 500으로 매핑한다. 올바른 status code를 원하면 `HttpException` 계열을 써라. framework-agnostic을 원하면 `AppError`를 domain에 두고 Interceptor/Filter에서 매핑하라.

## Related

- [../error-handling.md](../error-handling.md) — Framework-agnostic 에러 분류, `AppError` 계층, Centralized Error Handling 패턴
- [../api-design.md](../api-design.md#3-rfc-9457--problem-details-for-http-apis) — RFC 9457 Problem Details 정의
- [../observability.md](../observability.md) — Pino logging, Sentry 원칙
- [./validation.md](./validation.md) — `ValidationPipe` 에러 생성
- [./request-lifecycle.md](./request-lifecycle.md#exception-filters) — filter 실행 순서 (local → global)
- [./observability.md](./observability.md) — `nestjs-pino` 설정
- [../fastify/error-handling.md](../fastify/error-handling.md) — Fastify `setErrorHandler` 비교

## References (공식 문서)

- [NestJS Docs — Exception Filters](https://docs.nestjs.com/exception-filters) — `HttpException`, built-in 예외 전체 목록, `@Catch`, `ExceptionFilter`, `ArgumentsHost`, `HttpAdapterHost`, catch-all filter, filter 순서 경고, `APP_FILTER`, `BaseExceptionFilter`, `IntrinsicException` 로깅 정책
- [RFC 9457 — Problem Details for HTTP APIs](https://datatracker.ietf.org/doc/html/rfc9457) — `type`, `title`, `status`, `detail`, `instance` 필드, `application/problem+json` content type
- [Node.js Error.cause](https://nodejs.org/en/blog/release/v16.9.0/#error-cause) — `cause` 옵션 표준
- [Sentry — NestJS Guide](https://docs.sentry.io/platforms/javascript/guides/nestjs/) — `@sentry/nestjs` 통합 (버전별 공식 문서 확인)
