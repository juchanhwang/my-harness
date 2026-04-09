# Security

## 목차

1. [Authentication (JWT)](#1-authentication-jwt)
2. [Authorization (RBAC)](#2-authorization-rbac)
3. [Input Validation](#3-input-validation)
4. [Rate Limiting](#4-rate-limiting)
5. [CORS, CSRF, XSS 방어](#5-cors-csrf-xss-방어)
6. [Secrets 관리](#6-secrets-관리)
7. [핵심 원칙 요약](#7-핵심-원칙-요약)

## 1. Authentication (JWT)

### Access Token + Refresh Token Pattern

두 종류의 토큰을 함께 사용하여 **보안과 UX의 균형**을 맞춘다.

| 토큰 | 수명 | 저장 위치 | 용도 |
|------|------|----------|------|
| **Access Token** | 짧음 (15분) | 메모리 / localStorage | 매 요청 인증 |
| **Refresh Token** | 김 (7일) | httpOnly Cookie | Access Token 재발급 |

### 원칙

* **Access Token은 짧게** — 탈취되어도 피해 최소화
* **Refresh Token은 httpOnly Cookie** — JavaScript에서 접근 불가 (XSS 방어)
* **SameSite=Strict** — CSRF 공격 차단
* **Refresh Token 회전(rotation)** — 재발급 시 이전 refresh token 폐기

### JWT 구조

```
<header>.<payload>.<signature>
```

* **Header**: 알고리즘(HS256, RS256), 타입(JWT)
* **Payload**: `sub`(subject), `iat`(issued at), `exp`(expiration), custom claims(`userId`, `role`)
* **Signature**: `HMAC(header.payload, secret)` 또는 `RSA(header.payload, privateKey)`

### 알고리즘 선택

* **HS256** (symmetric) — 단일 서비스, 간단
* **RS256** (asymmetric) — 다중 서비스가 공개키로 검증, 더 안전

> **Fastify 구현**(`@fastify/jwt` plugin, decorator 기반 authenticate, httpOnly cookie 설정, refresh handler)은 [fastify/security.md](fastify/security.md#authentication-via-fastifyjwt)에 정식 정의가 있다.
> 이 파일은 framework 중립 인증 이론에 집중한다.

### Password Hashing (Argon2)

```typescript
import { hash, verify } from '@node-rs/argon2';

// Argon2id — bcrypt보다 안전 (메모리 하드)
const ARGON2_OPTIONS = {
  memoryCost: 65536,  // 64MB
  timeCost: 3,
  parallelism: 4,
};

async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return verify(hash, password, ARGON2_OPTIONS);
}
```

**왜 Argon2id인가**:
* OWASP 권장 — bcrypt보다 GPU/ASIC 공격에 강함
* 메모리 하드 (memory-hard) — 병렬 attack 비용 증가
* Password Hashing Competition 2015 우승자

## 2. Authorization (RBAC)

### Role-Based Access Control

사용자에게 **역할(role)**을 부여하고, 역할별로 권한을 정의한다.

```typescript
// 역할 계층 정의
const ROLE_HIERARCHY: Record<string, number> = {
  user: 1,
  admin: 2,
  super_admin: 3,
};

// 권한 검사 함수 (framework-agnostic)
function hasRequiredRole(userRole: string, requiredRole: string): boolean {
  return (ROLE_HIERARCHY[userRole] ?? 0) >= (ROLE_HIERARCHY[requiredRole] ?? Infinity);
}
```

### RBAC vs ABAC

| 모델 | 특징 | 적합 상황 |
|------|------|----------|
| **RBAC** (Role-Based) | 역할에 권한 부여 | 대부분의 SaaS |
| **ABAC** (Attribute-Based) | 속성(시간, 위치, 리소스) 기반 동적 판단 | 복잡한 정책이 필요한 엔터프라이즈 |

### Resource-level Authorization

역할 외에도 **리소스 소유권**을 검증해야 한다. 예: 자신의 프로필만 수정 가능.

```typescript
// framework-agnostic 로직
function canModifyProfile(currentUser: { id: number; role: string }, targetId: number): boolean {
  return currentUser.id === targetId || currentUser.role === 'admin';
}
```

> **Fastify decorator 기반 authorize 구현**(`fastify.decorate('authorize', ...)`, preHandler 패턴)은 [fastify/security.md](fastify/security.md#decorator-기반-authenticateauthorize)에 정식 정의가 있다.

## 3. Input Validation

### 2단계 검증 전략

| 단계 | 도구 | 목적 |
|------|------|------|
| **1차: 구조 검증** | JSON Schema (Fastify built-in) | 타입, 필수 필드, 포맷, 범위 |
| **2차: 비즈니스 검증** | Zod | 계좌 동일성, 잔고 확인 등 |

### JSON Schema 예제 (framework-agnostic 표준)

```typescript
const createUserSchema = {
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
};
```

`additionalProperties: false`는 **스키마에 없는 필드를 reject**하여 mass assignment 취약점을 방지한다.

### Zod (2차: 비즈니스 로직 검증)

```typescript
import { z } from 'zod';

const transferSchema = z.object({
  fromAccountId: z.string().uuid(),
  toAccountId: z.string().uuid(),
  amount: z.number().positive().max(10_000_000),
}).refine(
  (data) => data.fromAccountId !== data.toAccountId,
  { message: 'Cannot transfer to the same account' }
);
```

### SQL Injection 방어

```typescript
// ✅ 항상 parameterized query 사용
const user = await db.select().from(users).where(eq(users.email, email));

// ✅ Raw SQL도 template tag 사용
const result = await db.execute(sql`
  SELECT * FROM users WHERE email = ${email} AND status = ${status}
`);

// ❌ 절대 string interpolation 사용 금지
// const result = await db.execute(`SELECT * FROM users WHERE email = '${email}'`);
```

## 4. Rate Limiting

> **Rate Limiting SSOT**: 이 파일은 **애플리케이션 레벨 rate limit 전략**과 **이론**(Fixed window, Sliding window, Token bucket)을 다룬다. Fastify plugin 구현은 [fastify/security.md](fastify/security.md#fastifyrate-limit)에 있다. 인프라 레벨(Nginx `limit_req`, API Gateway, Cloudflare)은 [system-design.md](system-design.md#reverse-proxy-nginx)에서 다룬다.

### 알고리즘 비교

| 알고리즘 | 특징 | 정확도 | 비용 |
|---------|------|--------|------|
| **Fixed Window** | 시간 구간별 카운터 | 낮음 (경계 문제) | 저렴 |
| **Sliding Window** | 시간 기반 sliding | 높음 | 중간 |
| **Token Bucket** | 토큰 소비 + refill | 높음 (burst 허용) | 중간 |
| **Leaky Bucket** | 일정 속도로 처리 | 높음 (smoothing) | 중간 |

### 사용 패턴

* **전역 rate limit**: IP 기반, 분당 100회 (DDoS 방어 기본)
* **로그인 rate limit**: 이메일 기반, 15분에 5회 (brute force 방어)
* **결제/민감 API**: 사용자 기반, 엄격하게

### Multi-instance 환경

단일 인스턴스에서는 in-memory 카운터로 충분하지만, **여러 인스턴스가 있으면 Redis 등 공유 저장소**가 필요하다. 그렇지 않으면 각 인스턴스가 독립적으로 카운트하여 실질 제한이 `max × instance_count`가 된다.

## 5. CORS, CSRF, XSS 방어

### CORS 원칙

* **Whitelist only** — `origin: '*'` 절대 금지
* **credentials: true** 사용 시 `origin`은 정확한 URL이어야 함 (`*` 불가)
* **methods/allowedHeaders** 최소화
* **maxAge** — preflight 캐시로 불필요한 요청 감소

### CSRF 방어

**SameSite=Strict 쿠키**를 사용하면 대부분의 CSRF 공격을 방어할 수 있다. 별도 CSRF 토큰이 필요한 경우는 드물다.

* `SameSite=Strict` — 외부 사이트에서 발생한 요청에 쿠키 전송 안 됨
* `SameSite=Lax` — top-level navigation(a 태그)은 허용 (기본값)
* `SameSite=None; Secure` — cross-site 요청에 쿠키 전송 (HTTPS 필수)

### XSS 방어

* **Content Security Policy (CSP)** — 실행 가능한 스크립트 소스 제한
* **HttpOnly Cookie** — JavaScript에서 접근 불가
* **입력 이스케이핑** — 사용자 입력을 HTML로 렌더링할 때

```typescript
// HTML escape 유틸리티 (framework-agnostic)
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
```

> **Fastify 구현**(`@fastify/cors`, `@fastify/helmet` CSP 설정)은 [fastify/security.md](fastify/security.md#fastifycors)에 정식 정의가 있다.

## 6. Secrets 관리

### 환경 변수 검증

```typescript
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  REDIS_URL: z.string().url().optional(),
});

// 앱 시작 시 검증 — 실패하면 즉시 종료
export const env = envSchema.parse(process.env);
```

### .env 관리

```bash
# .gitignore
.env
.env.local
.env.*.local

# .env.example (커밋 — 변수명만, 값은 비움)
DATABASE_URL=
JWT_SECRET=
REDIS_URL=
```

## 7. 핵심 원칙 요약

1. **Access Token은 짧게, Refresh Token은 httpOnly cookie** — XSS로 토큰 탈취 방지
2. **Argon2id로 패스워드 해싱** — bcrypt보다 안전 (메모리 하드)
3. **Input validation은 2단계** — Schema(구조) + Zod(비즈니스)
4. **Rate limiting은 엔드포인트별** — 로그인은 더 엄격하게
5. **CORS는 whitelist** — `origin: '*'` 절대 금지
6. **환경 변수는 시작 시 검증** — 런타임 에러 방지

---

## Related

- [fastify/security.md](fastify/security.md) — `@fastify/jwt`, `@fastify/rate-limit`, `@fastify/cors`, `@fastify/helmet` 구현
- [api-design.md](api-design.md) — 입력 검증·스키마 기반 방어
- [networking.md](networking.md) — TLS·CORS·보안 헤더
- [deployment.md](deployment.md) — 시크릿 관리·환경 변수
- [system-design.md](system-design.md) — 인프라 레벨 Rate Limiting·WAF
