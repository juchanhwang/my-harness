# Fastify API Design

> 이 파일은 **Fastify 5** 전용 구현을 다룬다.
> Framework-agnostic REST 원칙, HTTP 메소드/상태코드, RFC 9457 Problem Details 이론은 [../api-design.md](../api-design.md)를 참조하라.

## 목차

1. [Route Plugin 패턴](#route-plugin-패턴)
2. [JSON Schema 기반 Validation](#json-schema-기반-validation)
3. [Handler 패턴](#handler-패턴)
4. [Versioning via prefix](#versioning-via-prefix)
5. [Problem Details Error Class 통합](#problem-details-error-class-통합)
6. [Related](#related)

## Route Plugin 패턴

### 파일 기반 라우팅 구조

```
src/
  routes/
    users/
      index.ts          // route 등록 (plugin)
      schema.ts         // JSON Schema 정의
      handler.ts        // request handler
    transactions/
      index.ts
      schema.ts
      handler.ts
```

### Route Plugin 예제

```typescript
// routes/users/index.ts
import { FastifyInstance } from 'fastify';
import { createUserSchema, getUserSchema, listUsersSchema } from './schema.js';
import { createUser, getUser, listUsers } from './handler.js';

export default async function userRoutes(fastify: FastifyInstance) {
  fastify.post('/', { schema: createUserSchema }, createUser);
  fastify.get('/:id', { schema: getUserSchema }, getUser);
  fastify.get('/', { schema: listUsersSchema }, listUsers);
}
```

> **Fastify Plugin 등록·encapsulation·hierarchy**는 [./architecture.md](./architecture.md#plugin-기반-아키텍처)에 정식 정의가 있다.
> 라우트를 `app.ts`에서 `register(..., { prefix })`로 마운트하는 방법, plugin 등록 순서, `fastify-plugin`으로 캡슐화 해제하는 패턴 모두 해당 문서 참조.

## JSON Schema 기반 Validation

Fastify는 **JSON Schema**를 1급 시민으로 지원한다. `schema` 옵션에 정의하면 request validation과 response serialization이 자동으로 이루어진다.

### 기본 Schema 예제

```typescript
// routes/users/schema.ts
export const createUserSchema = {
  body: {
    type: 'object',
    required: ['email', 'password', 'name'],
    additionalProperties: false,
    properties: {
      email: { type: 'string', format: 'email', maxLength: 320 },
      password: { type: 'string', minLength: 8, maxLength: 100 },
      name: { type: 'string', minLength: 2, maxLength: 100 },
    },
  },
  response: {
    201: {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            email: { type: 'string' },
            name: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  },
} as const;
```

### Pagination/Filtering Schema

```typescript
export const listTransactionsSchema = {
  querystring: {
    type: 'object',
    properties: {
      cursor: { type: 'string' },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      status: { type: 'string', enum: ['pending', 'completed', 'failed'] },
      minAmount: { type: 'number', minimum: 0 },
      sort: { type: 'string', default: '-createdAt' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: { $ref: 'transaction#' },
        },
        pagination: {
          type: 'object',
          properties: {
            nextCursor: { type: 'string', nullable: true },
            hasMore: { type: 'boolean' },
            limit: { type: 'integer' },
          },
        },
      },
    },
  },
} as const;
```

> **Pagination 전략 비교**(Cursor vs Offset), **Filtering/Sorting query parameter 컨벤션**은 [../api-design.md](../api-design.md#5-pagination-filtering-sorting)에 정식 정의가 있다.

### JSON Schema의 장점

* **Validation 자동화** — 스키마 위반 시 Fastify가 400 응답 자동 생성
* **Response serialization** — 응답 객체가 스키마에 정의된 필드만 포함하도록 자동 필터링 (민감 정보 유출 방지)
* **OpenAPI 문서 생성** — `@fastify/swagger`로 자동 문서화
* **TypeScript 통합** — `@sinclair/typebox` 사용 시 타입 자동 추론

## Handler 패턴

```typescript
// routes/users/handler.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import { NotFoundError } from '../../errors/problem-details.js';

export async function getUser(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const { id } = request.params;
  const user = await request.server.userService.findById(id);

  if (!user) {
    throw new NotFoundError('User', id);
  }

  return reply.send({ data: user });
}
```

핵심:
* **Handler는 HTTP 관심사만** — 비즈니스 로직은 `request.server.<service>` 호출
* **에러는 throw** — reply에서 에러 응답을 직접 만들지 말고 `setErrorHandler`에게 위임
* **타입 안전** — `FastifyRequest<{ Params, Body, Querystring }>` generics로 request 타입 명시

## Versioning via prefix

```typescript
// Fastify prefix로 버전 관리
fastify.register(userRoutesV1, { prefix: '/api/v1' });
fastify.register(userRoutesV2, { prefix: '/api/v2' });
```

> **API Versioning 전략 비교**(URL vs Header)와 선택 근거는 [../api-design.md](../api-design.md#4-versioning-전략)에 정식 정의가 있다.

## Problem Details Error Class 통합

RFC 9457 Problem Details를 Fastify에서 구현하는 custom error class 예제:

```typescript
// errors/problem-details.ts
export class ProblemDetailsError extends Error {
  constructor(
    public readonly type: string,
    public readonly title: string,
    public readonly status: number,
    public readonly detail?: string,
    public readonly extensions?: Record<string, unknown>,
  ) {
    super(title);
    this.name = 'ProblemDetailsError';
  }

  toJSON(): Record<string, unknown> {
    return {
      type: this.type,
      title: this.title,
      status: this.status,
      ...(this.detail && { detail: this.detail }),
      instance: `/errors/${Date.now()}`,
      ...this.extensions,
    };
  }
}

// 사전 정의된 에러들
export class NotFoundError extends ProblemDetailsError {
  constructor(resource: string, id: string) {
    super(
      'https://api.example.com/problems/not-found',
      `${resource} not found`,
      404,
      `${resource} with id '${id}' does not exist.`,
    );
  }
}

export class ValidationError extends ProblemDetailsError {
  constructor(errors: Array<{ field: string; message: string }>) {
    super(
      'https://api.example.com/problems/validation-error',
      'Validation failed',
      422,
      'One or more fields failed validation.',
      { errors },
    );
  }
}

export class ConflictError extends ProblemDetailsError {
  constructor(detail: string) {
    super(
      'https://api.example.com/problems/conflict',
      'Resource conflict',
      409,
      detail,
    );
  }
}
```

> **RFC 9457 표준 필드**(type, title, status, detail, instance) 정의와 **AppError 클래스 계층**은 [../api-design.md](../api-design.md#3-rfc-9457--problem-details-for-http-apis)와 [../error-handling.md](../error-handling.md#2-custom-error-classes-설계)에 정식 정의가 있다.
> 이 섹션은 Fastify에서 해당 이론을 구현하는 통합 패턴에 집중한다.

Error handler(`setErrorHandler`)에서 이 error class들을 어떻게 처리하는지는 [./error-handling.md](./error-handling.md)를 참조.

## Related

- [../api-design.md](../api-design.md) — REST 원칙, HTTP 컨벤션, RFC 9457 이론
- [./architecture.md](./architecture.md) — Fastify plugin 등록·hierarchy
- [./error-handling.md](./error-handling.md) — `setErrorHandler`, validation error 처리
- [./security.md](./security.md) — `preHandler` 기반 인증·JSON Schema validation
- [./testing.md](./testing.md) — `app.inject()` 기반 라우트 테스트
