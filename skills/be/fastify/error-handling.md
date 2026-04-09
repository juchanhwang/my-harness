# Fastify Error Handling

> 이 파일은 **Fastify 5** 전용 구현을 다룬다.
> Framework-agnostic 에러 처리 이론(AppError 계층, Operational vs Programmer Error, 에러 처리 흐름)은 [../error-handling.md](../error-handling.md)를 참조하라.

## 목차

1. [setErrorHandler — 중앙 에러 핸들러](#seterrorhandler--중앙-에러-핸들러)
2. [Fastify Validation Error 처리](#fastify-validation-error-처리)
3. [onError Hook — Sentry 통합](#onerror-hook--sentry-통합)
4. [onResponse Hook — 요청 로깅](#onresponse-hook--요청-로깅)
5. [Related](#related)

## setErrorHandler — 중앙 에러 핸들러

Fastify의 `setErrorHandler`는 route handler에서 throw된 에러를 받아 HTTP 응답으로 변환한다. **한 곳에서 모든 에러를 처리**하여 일관성을 보장한다.

```typescript
// plugins/error-handler.ts
import fp from 'fastify-plugin';
import { AppError } from '../errors/base.js';

export default fp(async function errorHandlerPlugin(fastify) {
  fastify.setErrorHandler((error, request, reply) => {
    const requestId = request.id;

    // 1. Operational error (AppError 계열)
    if (error instanceof AppError) {
      if (error.statusCode >= 500) {
        request.log.error({ err: error, requestId }, error.message);
      } else {
        request.log.warn({ err: error, requestId }, error.message);
      }

      return reply
        .code(error.statusCode)
        .type('application/problem+json')
        .send(error.toJSON());
    }

    // 2. Fastify validation error
    if (error.validation) {
      request.log.info({ requestId, validation: error.validation }, 'Validation failed');

      return reply
        .code(400)
        .type('application/problem+json')
        .send({
          type: 'https://api.example.com/problems/validation-error',
          title: 'Request validation failed',
          status: 400,
          detail: error.message,
          errors: error.validation.map((v) => ({
            field: v.instancePath || v.params?.missingProperty,
            message: v.message,
          })),
        });
    }

    // 3. Unexpected error (Programmer error)
    request.log.error({ err: error, requestId }, 'Unhandled error');

    return reply
      .code(500)
      .type('application/problem+json')
      .send({
        type: 'https://api.example.com/problems/internal-error',
        title: 'Internal server error',
        status: 500,
        instance: `/errors/${requestId}`,
      });
  });
});
```

핵심 흐름:

1. **AppError instanceof 체크** — custom error class는 `toJSON()`으로 직접 직렬화
2. **Fastify validation error** — `error.validation` 속성 존재 시 JSON Schema 위반
3. **Fallback** — 예상치 못한 에러는 500으로 감싸고 내부 정보 숨김

> **AppError 클래스 계층 설계**(`abstract class AppError`, `statusCode`, `isOperational`, `toJSON()`)는 [../error-handling.md](../error-handling.md#2-custom-error-classes-설계)에 정식 정의가 있다.
> 이 섹션은 Fastify `setErrorHandler` 통합 패턴에 집중한다.

## Fastify Validation Error 처리

Fastify는 route schema 위반 시 `error.validation` 속성에 Ajv validation 결과 배열을 담는다. 위 `setErrorHandler`의 두 번째 분기가 이를 처리한다.

`validation` 배열의 각 항목은 다음 형태다:

```typescript
interface ValidationResult {
  instancePath: string;      // 실패한 필드 경로 (JSON Pointer)
  schemaPath: string;        // 위반된 schema rule 경로
  keyword: string;           // required, type, format 등
  params: Record<string, unknown>;
  message: string;
}
```

이를 RFC 9457 `errors` extension으로 변환하여 클라이언트가 필드별 에러를 처리할 수 있게 한다.

## onError Hook — Sentry 통합

`setErrorHandler`는 응답을 생성하는 반면, `onError` hook은 **사이드 이펙트**(Sentry 보고, 메트릭 증가 등)에 사용한다.

```typescript
// plugins/sentry.ts
import * as Sentry from '@sentry/node';
import fp from 'fastify-plugin';
import { AppError } from '../errors/base.js';

export default fp(async function sentryErrorHook(fastify) {
  fastify.addHook('onError', async (request, reply, error) => {
    // 5xx만 Sentry에 보고 (4xx 클라이언트 에러는 제외)
    if (!(error instanceof AppError) || error.statusCode >= 500) {
      Sentry.captureException(error, {
        tags: { requestId: request.id },
        extra: {
          url: request.url,
          method: request.method,
          userId: request.user?.id,
        },
      });
    }
  });
});
```

> **Sentry 일반 설정**(`Sentry.init`, sampling, PII 제거)은 [../observability.md](../observability.md#5-error-tracking-sentry)와 [./observability.md](./observability.md)에 정식 정의가 있다.

## onResponse Hook — 요청 로깅

모든 응답 완료 시점에 요청 메트릭을 로깅한다. 성공/실패 여부와 무관하게 실행된다.

```typescript
fastify.addHook('onResponse', async (request, reply) => {
  request.log.info({
    method: request.method,
    url: request.url,
    statusCode: reply.statusCode,
    responseTime: reply.elapsedTime,
    requestId: request.id,
  }, 'Request completed');
});
```

> **구조화된 로깅 원칙**(JSON, requestId, 민감 정보 redact)과 **Pino logger 설정**은 [../observability.md](../observability.md#2-structured-logging-pino)와 [./observability.md](./observability.md)에 정식 정의가 있다.

## Related

- [../error-handling.md](../error-handling.md) — AppError 계층, Operational vs Programmer Error 분류
- [../api-design.md](../api-design.md#3-rfc-9457--problem-details-for-http-apis) — RFC 9457 표준 필드
- [./api-design.md](./api-design.md#problem-details-error-class-통합) — Fastify ProblemDetailsError custom class
- [./observability.md](./observability.md) — Fastify + Pino, Sentry plugin
- [../resilience.md](../resilience.md) — Circuit Breaker, Retry (에러 핸들러에서 사용)
