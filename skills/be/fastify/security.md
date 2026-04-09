# Fastify Security

> 이 파일은 **Fastify 5** 전용 구현을 다룬다.
> Framework-agnostic 보안 이론(JWT 구조, RBAC vs ABAC, password hashing 원칙, CSRF/XSS/SQL injection 방어, Rate Limiting 전략)은 [../security.md](../security.md)를 참조하라.

## 목차

1. [Authentication via @fastify/jwt](#authentication-via-fastifyjwt)
2. [Decorator 기반 authenticate/authorize](#decorator-기반-authenticateauthorize)
3. [Route에 인증 적용](#route에-인증-적용)
4. [@fastify/rate-limit](#fastifyrate-limit)
5. [@fastify/cors](#fastifycors)
6. [@fastify/helmet](#fastifyhelmet)
7. [Related](#related)

## Authentication via @fastify/jwt

`@fastify/jwt` plugin으로 Fastify 인스턴스에 JWT sign/verify 기능을 추가한다.

```typescript
// plugins/auth.ts
import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';

export default fp(async function authPlugin(fastify) {
  fastify.register(fastifyJwt, {
    secret: process.env.JWT_SECRET!,
    sign: { expiresIn: '15m' }, // Access Token: 15분
  });

  // Access Token 생성
  fastify.decorate('generateTokens', (user: { id: number; role: string }) => {
    const accessToken = fastify.jwt.sign(
      { userId: user.id, role: user.role },
      { expiresIn: '15m' }
    );

    const refreshToken = fastify.jwt.sign(
      { userId: user.id, type: 'refresh' },
      { expiresIn: '7d' }
    );

    return { accessToken, refreshToken };
  });

  // 인증 미들웨어
  fastify.decorate('authenticate', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.code(401).send({
        type: 'https://api.example.com/problems/unauthorized',
        title: 'Authentication required',
        status: 401,
      });
    }
  });
});
```

> **Access Token + Refresh Token 패턴 설계 이유**(짧은 만료, httpOnly 쿠키, XSS 방어)는 [../security.md](../security.md#1-authentication-jwt)에 정식 정의가 있다.

### Refresh Token via httpOnly Cookie

```typescript
// routes/auth/handler.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import { UnauthorizedError } from '../../errors/http.js';

export async function login(request: FastifyRequest, reply: FastifyReply) {
  const { email, password } = request.body as LoginInput;

  const user = await request.server.userService.verifyCredentials(email, password);
  if (!user) {
    throw new UnauthorizedError('Invalid credentials');
  }

  const { accessToken, refreshToken } = request.server.generateTokens(user);

  // Refresh token을 httpOnly cookie로 설정
  reply.setCookie('refreshToken', refreshToken, {
    httpOnly: true,     // JavaScript 접근 불가 (XSS 방어)
    secure: true,       // HTTPS만
    sameSite: 'strict', // CSRF 방어
    path: '/api/v1/auth/refresh',
    maxAge: 7 * 24 * 60 * 60, // 7일
  });

  return reply.send({ accessToken });
}

export async function refresh(request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies.refreshToken;
  if (!token) throw new UnauthorizedError('No refresh token');

  try {
    const decoded = request.server.jwt.verify(token) as { userId: number; type: string };
    if (decoded.type !== 'refresh') throw new Error('Invalid token type');

    const user = await request.server.userService.findById(decoded.userId);
    const { accessToken, refreshToken } = request.server.generateTokens(user);

    reply.setCookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/api/v1/auth/refresh',
      maxAge: 7 * 24 * 60 * 60,
    });

    return reply.send({ accessToken });
  } catch {
    throw new UnauthorizedError('Invalid refresh token');
  }
}
```

`@fastify/cookie` plugin이 별도 등록되어 있어야 `reply.setCookie`와 `request.cookies`를 사용할 수 있다.

## Decorator 기반 authenticate/authorize

RBAC(Role-Based Access Control)을 `fastify.decorate`로 등록하여 route preHandler에서 재사용한다.

```typescript
// plugins/authorize.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import { ForbiddenError } from '../errors/http.js';

const ROLE_HIERARCHY: Record<string, number> = {
  user: 1,
  admin: 2,
  super_admin: 3,
};

fastify.decorate('authorize', (requiredRole: string) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userRole = request.user.role;

    if ((ROLE_HIERARCHY[userRole] ?? 0) < (ROLE_HIERARCHY[requiredRole] ?? Infinity)) {
      throw new ForbiddenError(`Role '${requiredRole}' required`);
    }
  };
});
```

> **RBAC vs ABAC 선택 기준**과 **Resource-level Authorization** 이론은 [../security.md](../security.md#2-authorization-rbac)에 정식 정의가 있다.

## Route에 인증 적용

```typescript
// routes/users/index.ts
import { FastifyInstance } from 'fastify';

export default async function userRoutes(fastify: FastifyInstance) {
  // 인증 필요
  fastify.get('/me', { preHandler: [fastify.authenticate] }, getProfile);

  // 인증 + 관리자 권한
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.authorize('admin')],
  }, listUsers);
}
```

`preHandler`는 Fastify lifecycle hook으로, route handler 실행 전에 validation, authentication, authorization 등을 수행한다.

## @fastify/rate-limit

`@fastify/rate-limit` plugin으로 라우트 단위 rate limiting을 구현한다.

> **Rate Limiting SSOT**: 이 섹션은 **애플리케이션 레벨 rate limit** (`@fastify/rate-limit`)을 다룬다. 인프라 레벨(Nginx `limit_req`, API Gateway, Cloudflare)은 [../system-design.md](../system-design.md#reverse-proxy-nginx)에서, **전략 이론**(Fixed window, Sliding window, Token bucket)은 [../security.md](../security.md#4-rate-limiting)에서 다룬다.

```typescript
import rateLimit from '@fastify/rate-limit';

// 전역 rate limit
await fastify.register(rateLimit, {
  max: 100,          // 분당 100회
  timeWindow: '1 minute',
  keyGenerator: (request) => request.ip,
});

// 엔드포인트별 rate limit
fastify.post('/api/v1/auth/login', {
  config: {
    rateLimit: {
      max: 5,                // 15분에 5회
      timeWindow: '15 minutes',
      keyGenerator: (request) => {
        const body = request.body as { email?: string };
        return body?.email ?? request.ip; // 이메일 기반 제한
      },
    },
  },
}, login);
```

프로덕션에서는 Redis 저장소를 사용하여 multi-instance 간 rate limit을 공유한다:

```typescript
import Redis from 'ioredis';

await fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  redis: new Redis(process.env.REDIS_URL!),
});
```

## @fastify/cors

`@fastify/cors` plugin으로 CORS preflight/response 헤더를 관리한다.

```typescript
import cors from '@fastify/cors';

await fastify.register(cors, {
  origin: [
    'https://example.com',
    'https://app.example.com',
    ...(process.env.NODE_ENV === 'development' ? ['http://localhost:3000'] : []),
  ],
  credentials: true,  // 쿠키 허용
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,       // Preflight 캐시 24시간
});
```

> **CORS 원칙**(whitelist only, credentials 주의점), **SameSite 쿠키와 CSRF 방어 관계**는 [../security.md](../security.md#5-cors-csrf-xss-방어)에 정식 정의가 있다.

## @fastify/helmet

`@fastify/helmet` plugin으로 보안 관련 HTTP 헤더(CSP, HSTS, X-Frame-Options 등)를 설정한다.

```typescript
import helmet from '@fastify/helmet';

// Content Security Policy 등 보안 헤더 설정
await fastify.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
});
```

## Related

- [../security.md](../security.md) — 인증/인가 이론, JWT 구조, Password hashing, CSRF/XSS 방어
- [./architecture.md](./architecture.md) — Plugin 등록 순서 (Utility layer)
- [./api-design.md](./api-design.md) — JSON Schema validation (1차 방어)
- [./error-handling.md](./error-handling.md) — `UnauthorizedError`, `ForbiddenError` 응답 처리
- [../system-design.md](../system-design.md) — 인프라 레벨 Rate Limiting, WAF
