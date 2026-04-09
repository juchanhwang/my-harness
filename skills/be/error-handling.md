# Error Handling

## 목차

1. [Centralized Error Handling 패턴](#1-centralized-error-handling-패턴)
2. [Custom Error Classes 설계](#2-custom-error-classes-설계)
3. [Framework-Level Error Handler 통합](#3-framework-level-error-handler-통합)
4. [Retry & Circuit Breaker 패턴](#4-retry--circuit-breaker-패턴)
5. [Structured Logging with Pino](#5-structured-logging-with-pino)
6. [에러 처리 원칙 요약](#6-에러-처리-원칙-요약)

## 1. Centralized Error Handling 패턴

에러 처리를 각 route handler에 분산시키지 않는다. **중앙 집중식 에러 처리**로 일관성을 보장한다.

### 에러 처리 흐름

```
Route Handler → throw Error
  ↓
Framework-level Error Handler (단일 지점)
  ↓
에러 분류 → 적절한 HTTP 응답 + 로깅
```

### 원칙

* **Handler에서는 에러를 throw만 한다** — 응답 형식 변환은 error handler가 담당
* **예상된 에러 vs 예상치 못한 에러를 구분한다** — 비즈니스 에러(404, 409)와 시스템 에러(500)를 다르게 처리
* **에러 정보를 클라이언트에 절대 과다 노출하지 않는다** — stack trace, 내부 경로, DB 쿼리 등

## 2. Custom Error Classes 설계

계층적 에러 클래스로 에러 유형을 체계화한다.

```typescript
// errors/base.ts
export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly type: string;
  readonly isOperational: boolean;

  constructor(
    message: string,
    public readonly detail?: string,
    isOperational = true,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      type: this.type,
      title: this.message,
      status: this.statusCode,
      ...(this.detail && { detail: this.detail }),
    };
  }
}

// errors/http.ts
export class BadRequestError extends AppError {
  readonly statusCode = 400;
  readonly type = 'https://api.example.com/problems/bad-request';
}

export class UnauthorizedError extends AppError {
  readonly statusCode = 401;
  readonly type = 'https://api.example.com/problems/unauthorized';
}

export class ForbiddenError extends AppError {
  readonly statusCode = 403;
  readonly type = 'https://api.example.com/problems/forbidden';
}

export class NotFoundError extends AppError {
  readonly statusCode = 404;
  readonly type = 'https://api.example.com/problems/not-found';

  constructor(resource: string, id: string) {
    super(`${resource} not found`, `${resource} with id '${id}' does not exist.`);
  }
}

export class ConflictError extends AppError {
  readonly statusCode = 409;
  readonly type = 'https://api.example.com/problems/conflict';
}

export class RateLimitError extends AppError {
  readonly statusCode = 429;
  readonly type = 'https://api.example.com/problems/rate-limit-exceeded';
  constructor(retryAfter: number) {
    super('Rate limit exceeded', `Retry after ${retryAfter} seconds.`);
  }
}

// errors/domain.ts — 비즈니스 도메인 에러
export class InsufficientBalanceError extends AppError {
  readonly statusCode = 422;
  readonly type = 'https://api.example.com/problems/insufficient-balance';

  constructor(
    public readonly currentBalance: number,
    public readonly requiredAmount: number,
  ) {
    super(
      'Insufficient balance',
      `Current balance is ${currentBalance}, but ${requiredAmount} is required.`,
    );
  }

  toJSON() {
    return {
      ...super.toJSON(),
      currentBalance: this.currentBalance,
      requiredAmount: this.requiredAmount,
    };
  }
}
```

### Operational vs Programmer Errors

```typescript
// Operational Error: 예상된 에러 — 정상적인 에러 응답 반환
throw new NotFoundError('User', '123');

// Programmer Error: 버그 — 로깅 후 500 반환, 프로세스 재시작 고려
// TypeError, ReferenceError, null pointer 등
```

## 3. Framework-Level Error Handler 통합

Centralized error handling을 실제 HTTP framework에 통합하는 지점. Framework가 제공하는 global error handler에 다음 책임을 위임한다:

1. **Operational error(AppError) 분기** — `instanceof AppError`로 탐지, `statusCode`와 `toJSON()` 사용
2. **Framework validation error** — schema 위반을 400 + RFC 9457 응답으로 변환
3. **Unexpected error fallback** — 500으로 감싸고 내부 정보 숨김
4. **로깅 분기** — 5xx는 error 레벨, 4xx는 warn 레벨

동시에 framework의 **error hook**에서는 응답 생성과 별개로 사이드 이펙트(Sentry 보고, 메트릭 증가)를 처리한다.

> **Fastify `setErrorHandler` + `onError` hook + `onResponse` hook** 구현(AppError 분기, validation error 변환, Sentry 통합, 요청 로깅)은 [fastify/error-handling.md](fastify/error-handling.md)에 정식 정의가 있다.
> 이 파일은 framework 중립 에러 처리 이론(AppError 계층, Operational vs Programmer Error 분류, 중앙 집중식 원칙)에 집중한다.

## 4. Retry & Circuit Breaker 패턴

> **Circuit Breaker / Retry 패턴**은 [resilience.md](resilience.md)에 정식 정의가 있다.
> 에러 핸들러에서 장애 대응이 필요하면 `resilience.md`의 `CircuitBreaker` 클래스와 `withRetry` 함수를 참조한다.

## 5. Structured Logging with Pino

### 로깅 원칙

* **JSON 형식** — 파싱, 검색, 집계가 쉬움
* **요청별 context** — requestId, userId를 모든 로그에 포함
* **레벨 분리** — error/warn/info/debug를 적절히 사용
* **민감 정보 제거** — password, token, 카드번호 등 redact

> **Fastify + Pino logger 설정**(redact paths, serializers, genReqId)은 [observability.md](observability.md#2-structured-logging-pino)에 정식 정의가 있다.
> 에러 핸들러에서 로깅 인프라가 필요하면 `observability.md`의 logger 설정을 참조한다.

### 로그 레벨 가이드

```
fatal — 프로세스 종료가 필요한 에러 (DB 연결 불가, OOM)
error — 요청 처리 실패 (5xx), 외부 서비스 연동 실패
warn  — 비정상이지만 처리 가능 (4xx 중 의심스러운 것, deprecation)
info  — 중요 비즈니스 이벤트 (결제 완료, 유저 가입, 배포)
debug — 개발 시 디버깅용 (SQL 쿼리, 상세 flow)
trace — 매우 상세한 디버깅 (프로덕션에서 비활성화)
```

### 비즈니스 이벤트 로깅

```typescript
// 핵심 비즈니스 로직에서는 비즈니스 로그가 특히 중요
request.log.info({
  event: 'transfer.completed',
  fromAccount: transfer.fromAccountId,
  toAccount: transfer.toAccountId,
  amount: transfer.amount,
  currency: 'KRW',
  transactionId: transfer.id,
}, 'Transfer completed successfully');
```

## 6. 에러 처리 원칙 요약

1. **Fail fast** — 잘못된 입력은 가능한 한 빨리 거부한다 (validation layer)
2. **에러 전파는 throw** — return error pattern 대신 throw로 일관성 유지
3. **에러 정보는 계층적** — 내부 에러 → 외부 에러로 변환 시 내부 정보 은닉
4. **모든 에러에 context** — requestId, userId, 관련 리소스 ID 포함
5. **재시도는 신중하게** — idempotent한 작업만 재시도, 그 외는 circuit break
6. **에러 모니터링** — 에러율 급증 시 알림, Sentry로 스택 트레이스 추적

---

## Related

- [fastify/error-handling.md](fastify/error-handling.md) — Fastify `setErrorHandler`, `onError`, `onResponse` hook 구현
- [resilience.md](resilience.md) — Circuit Breaker·Retry·Graceful degradation
- [observability.md](observability.md) — 에러 로깅·Pino serializer
- [api-design.md](api-design.md) — 에러 응답 포맷·RFC 9457
- [testing.md](testing.md) — 에러 핸들러 테스트
