# API Design

## 목차

1. [1. 리소스 중심 설계](#1-리소스-중심-설계)
2. [2. HTTP Methods & Status Codes](#2-http-methods--status-codes)
3. [3. RFC 9457 — Problem Details for HTTP APIs](#3-rfc-9457--problem-details-for-http-apis)
4. [4. Versioning 전략](#4-versioning-전략)
5. [5. Pagination, Filtering, Sorting](#5-pagination-filtering-sorting)
6. [6. API 설계 원칙 요약](#6-api-설계-원칙-요약)

## 1. 리소스 중심 설계

REST API는 **리소스(명사)**를 중심으로 설계한다. 동사가 아닌 명사로 URL을 구성한다.

```
✅ GET    /users/:id
✅ POST   /users
✅ PATCH  /users/:id
✅ DELETE /users/:id

❌ GET    /getUser
❌ POST   /createUser
❌ POST   /deleteUser
```

### 리소스 네이밍 규칙

* **복수형** 사용: `/users`, `/orders`, `/transactions`
* **케밥 케이스**: `/payment-methods`, `/bank-accounts`
* **중첩은 2단계까지**: "/users/:userId/orders" (3단계 이상은 query parameter로)
* **Action이 필요한 경우**: "/orders/:id/cancel" (RPC-style은 최소한으로)

## 2. HTTP Methods & Status Codes

### HTTP Methods

| Method | 용도        | Idempotent | Safe |
| ------ | --------- | ---------- | ---- |
| GET    | 리소스 조회    | ✅          | ✅    |
| POST   | 리소스 생성    | ❌          | ❌    |
| PUT    | 리소스 전체 교체 | ✅          | ❌    |
| PATCH  | 리소스 부분 수정 | ❌*        | ❌    |
| DELETE | 리소스 삭제    | ✅          | ❌    |

*PATCH는 설계에 따라 idempotent하게 만들 수 있다.

### Status Codes 가이드

```
2xx: 성공
  200 OK              — GET, PATCH, DELETE 성공
  201 Created         — POST로 리소스 생성 성공 (Location 헤더 포함)
  204 No Content      — DELETE 성공, 응답 body 없음

3xx: 리다이렉션
  301 Moved Permanently
  304 Not Modified

4xx: 클라이언트 에러
  400 Bad Request     — 잘못된 요청 (validation 실패)
  401 Unauthorized    — 인증 실패 (토큰 없음/만료)
  403 Forbidden       — 인가 실패 (권한 없음)
  404 Not Found       — 리소스 없음
  409 Conflict        — 충돌 (중복 생성, 버전 충돌)
  422 Unprocessable   — 문법은 맞지만 의미상 처리 불가
  429 Too Many Requests — Rate limit 초과

5xx: 서버 에러
  500 Internal Server Error — 예상치 못한 서버 에러
  502 Bad Gateway     — 업스트림 서버 에러
  503 Service Unavailable — 서비스 일시 중단
  504 Gateway Timeout — 업스트림 타임아웃
```

## 3. RFC 9457 — Problem Details for HTTP APIs

모든 에러 응답은 **RFC 9457 Problem Details** 표준을 따른다. Content-Type은 `application/problem+json`.

### 표준 필드

```typescript
interface ProblemDetails {
  type: string;       // 문제 유형 URI
  title: string;      // 사람이 읽을 수 있는 짧은 요약
  status: number;     // HTTP status code (advisory)
  detail?: string;    // 이 발생 건의 상세 설명
  instance?: string;  // 이 발생 건의 고유 URI
  // extension members
  [key: string]: unknown;
}
```

### 에러 응답 예제

```json
{
  "type": "https://api.example.com/problems/validation-error",
  "title": "Validation failed",
  "status": 422,
  "detail": "One or more fields failed validation.",
  "instance": "/errors/2026-04-09T10:15:30Z",
  "errors": [
    { "field": "email", "message": "must be a valid email address" },
    { "field": "password", "message": "must be at least 8 characters" }
  ]
}
```

### 원칙

* **type URI는 문제 유형을 식별** — 같은 종류의 에러는 같은 type을 사용
* **title은 사람이 읽을 수 있게** — 하지만 짧게
* **status는 HTTP status code와 일치** — Content-Type header와도 같은 값
* **extension members로 도메인 정보 추가** — `errors`, `currentBalance` 등
* **클라이언트가 프로그래밍적으로 처리 가능하게** — `type` 기반으로 분기

> **Custom Error Class 계층**(AppError → ProblemDetailsError → NotFoundError 등)은 [error-handling.md](error-handling.md#2-custom-error-classes-설계)에 정식 정의가 있다.
> **Fastify error class 통합**(`setErrorHandler`로 ProblemDetails 직렬화, validation error 변환)은 [fastify/api-design.md](fastify/api-design.md#problem-details-error-class-통합)와 [fastify/error-handling.md](fastify/error-handling.md)에 정식 정의가 있다.

## 4. Versioning 전략

### URL Versioning (권장 — 단순함)

```
/api/v1/users
/api/v2/users
```

### Header Versioning (유연함)

```
Accept: application/vnd.api.v2+json
```

**우리의 선택**: URL Versioning. 이유:

* 브라우저에서 직접 테스트 가능
* 캐싱이 쉬움 (URL 기반)
* 라우팅이 명확함
* 대부분의 스타트업이 선택하는 방식

> **Fastify에서 prefix 기반 version 등록**(`fastify.register(routes, { prefix: '/api/v1' })`)은 [fastify/api-design.md](fastify/api-design.md#versioning-via-prefix)에 정식 정의가 있다.

## 5. Pagination, Filtering, Sorting

### Cursor-based Pagination (권장)

Offset 기반은 대규모 데이터에서 성능 문제가 발생한다. Cursor 기반을 기본으로 사용한다.

```typescript
// Request
GET /api/v1/transactions?cursor=eyJpZCI6MTAwfQ&limit=20

// Response
{
  "data": [...],
  "pagination": {
    "nextCursor": "eyJpZCI6MTIwfQ",
    "hasMore": true,
    "limit": 20
  }
}
```

### Offset-based Pagination (간단한 경우)

```typescript
// Request
GET /api/v1/users?page=2&limit=20

// Response
{
  "data": [...],
  "pagination": {
    "page": 2,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

### Filtering & Sorting

```
GET /api/v1/transactions?status=completed&minAmount=10000&sort=-createdAt
```

* **Filtering**: query parameter로 필드명 직접 사용
* **Sorting**: "sort" parameter, "-" prefix로 내림차순
* **복수 정렬**: `sort=status,-createdAt`

> **Fastify JSON Schema로 querystring 검증**(cursor, limit, filter, sort)하는 예제는 [fastify/api-design.md](fastify/api-design.md#json-schema-기반-validation)에 정식 정의가 있다.

## 6. API 설계 원칙 요약

1. **일관성** — 모든 endpoint가 동일한 패턴을 따른다 (응답 구조, 에러 형식, 네이밍)
2. **최소 놀람 원칙** — API 소비자가 예상하는 대로 동작한다
3. **계약 우선** — shared/api-contracts.md에 FE-BE 간 계약을 먼저 정의한다
4. **하위 호환성** — Breaking change는 새 버전으로. 기존 버전은 deprecation 기간 제공
5. **Schema-first validation** — JSON Schema로 요청/응답 모두 검증
6. **에러는 정보가 풍부하게** — RFC 9457로 클라이언트가 프로그래밍적으로 처리 가능하게

---

## Related

- [fastify/api-design.md](fastify/api-design.md) — Fastify Route plugin, JSON Schema, Handler 패턴
- [architecture.md](architecture.md) — Layered architecture, Service Layer Pattern
- [error-handling.md](error-handling.md) — 에러 응답 포맷·custom error classes
- [security.md](security.md) — 인증·입력 검증·Rate Limiting (app-level)
- [testing.md](testing.md) — API endpoint 테스트 전략
