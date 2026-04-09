---
name: be
description: >
  백엔드 도메인 knowledge. Node.js/TypeScript 기반 서버 개발 — Fastify 5 또는 NestJS 11
  framework variant 지원, PostgreSQL 16+/Drizzle ORM, Redis, BullMQ, Pino, Vitest 공통 stack.
  API 설계, DB 스키마/쿼리, 인증/보안, 캐싱, 메시지 큐, 동시성, 분산 시스템, 마이크로서비스,
  성능 최적화, 장애 대응, 배포, 모니터링 시 활성화.
  사용자가 API endpoint, DB 스키마, 쿼리 최적화, 인증 플로우, 캐시 전략, 큐 처리,
  배포 파이프라인, 서버 에러를 언급하면 반드시 이 스킬을 활성화하라.
  명시적으로 '백엔드'라고 말하지 않더라도 서버 사이드 로직, 인프라,
  .controller.ts/.service.ts/.module.ts/.guard.ts/.pipe.ts/.interceptor.ts (NestJS) 또는
  Fastify plugin·setErrorHandler·app.inject (Fastify) 코드를 다루는 작업이면 활성화한다.
---

# BE Domain Knowledge

이 skill은 두 framework variant(**Fastify 5**, **NestJS 11**)를 지원한다.
모든 BE 작업은 **framework 결정 → 해당 variant 디렉토리 + 공통 파일 Read** 순서로 진행한다.

## Framework Selection (필수: 작업 시작 전 결정)

**모든 BE 작업의 첫 단계는 framework를 결정하는 것이다.** Framework가 결정되어야 어느 디렉토리의 파일을 우선 읽을지 정해진다.

### 결정 규칙

1. **기존 프로젝트 (코드베이스가 이미 존재)** — 프로젝트의 framework를 자동으로 따른다.

   판별 순서:
   1. `package.json`의 `dependencies` / `devDependencies` 검사
      - `@nestjs/core` 존재 → **NestJS**
      - `fastify` 존재 (and `@nestjs/*` 부재) → **Fastify**
      - 둘 다 존재 → 사용자에게 확인 (예: 마이그레이션 중일 수 있음)
      - 둘 다 부재 → 사용자에게 확인
   2. 파일명 패턴 확인 (보조 신호)
      - `*.module.ts`, `*.controller.ts`, `*.guard.ts`, `*.pipe.ts`, `*.interceptor.ts`, `*.filter.ts` → NestJS
      - `fastify.register(...)`, `setErrorHandler`, `app.inject(...)` 호출 → Fastify
   3. 1·2가 모순되면 사용자에게 확인 (혼합 사용 가능성)

2. **새 프로젝트 (코드베이스가 없거나 빈 상태)** — **반드시 사용자에게 물어본다.** 추측 금지.

   질문 템플릿:
   ```
   이 프로젝트는 어느 BE framework를 사용하시겠습니까?
   - Fastify 5: 가벼운 plugin 기반, 유연성 우선, 직접 구조 설계
   - NestJS 11: opinionated DI 컨테이너, 데코레이터 기반, 엔터프라이즈 패턴 내장
   ```

3. **결정 후** — 해당 framework variant 디렉토리(`fastify/` 또는 `nestjs/`)의 파일을 우선 참조하고, framework-agnostic 지식은 `be/` 루트 파일에서 가져온다. 양쪽 모두 같은 skill 내부이므로 cross-link는 상대 경로로 작동한다.

### Framework-agnostic vs Framework-specific 분류

| 카테고리 | 위치 | 비고 |
|---|---|---|
| Framework-agnostic (공통) | `be/*.md` | DB·캐시·성능·동시성·시스템 설계 등 framework와 무관한 지식 |
| Fastify variant | `be/fastify/*.md` | Plugin·setErrorHandler·app.inject 등 Fastify 고유 API |
| NestJS variant | `be/nestjs/*.md` | Module·Controller·Guard·DI 등 NestJS 고유 API |

---

## 핵심 원칙

- 시스템 철학: "견고하고 확장 가능한 시스템"
- 4대 원칙: 안정성(Reliability), 확장성(Scalability), 관찰 가능성(Observability), 보안(Security)
- 기술 스택 (공통): TypeScript strict, Node.js 22+, PostgreSQL 16+, Drizzle ORM, Redis, BullMQ, Pino, Vitest
- 기술 스택 (framework): Fastify 5 **또는** NestJS 11 (위 Framework Selection 규칙으로 결정)
- API 계약: RFC 9457 Problem Details 표준, Breaking change는 versioning
- 안티패턴: Happy path만 구현, 추측 기반 최적화, "나중에 보안 처리", 로그 없는 시스템

---

## 태스크-지식 매핑

매핑 테이블의 참조 파일에는 프로젝트 고유의 아키텍처 결정, 검증된 패턴, 안티패턴이 담겨 있다.
이를 읽지 않으면 기존 시스템 설계와 충돌하는 코드를 작성하게 되고, 리뷰에서 반려된다.
**코드를 작성하거나 리뷰하기 전에 아래 매핑 테이블에서 태스크에 해당하는 파일을 반드시 Read하라.**

**기본 경로**: `~/.claude/skills/be/` — 아래 테이블의 파일명 앞에 이 경로를 붙여서 Read한다.
공통 파일은 그대로(`database.md`), Fastify variant는 `fastify/architecture.md`, NestJS variant는 `nestjs/architecture.md` 형태로 표기한다.

### Framework-agnostic 태스크 (framework 무관)

| 태스크 유형 | 판단 기준 | Read할 파일 |
|---|---|---|
| DB 스키마/쿼리 | 테이블 설계·마이그레이션·raw 쿼리 | `database.md` + `postgresql.md` |
| Drizzle ORM 작업 | ORM 스키마·쿼리 빌더·관계 정의 | `drizzle-orm.md` + `database.md` |
| 성능 최적화 | 응답 시간·쓰루풋·병목 해결 | `performance.md` + `nodejs-internals.md` + `postgresql.md` |
| 캐싱 | Redis·캐시 전략·무효화 정책 | `caching.md` + `performance.md` |
| 메시지 큐 (core) | BullMQ Worker·Queue·Job 정의 | `message-queues.md` + `distributed-systems.md` |
| 동시성/락 | 레이스 컨디션·트랜잭션·락 전략 | `concurrency.md` + `database.md` |
| 시스템 설계 | 대규모 아키텍처·서비스 간 통신 | `system-design.md` + `distributed-systems.md` + `microservices.md` |
| 마이크로서비스 (이론) | 서비스 분리·통신·배포 독립성 | `microservices.md` + `message-queues.md` + `distributed-systems.md` |
| 네트워킹 | HTTP·WebSocket·프로토콜 설정 | `networking.md` |
| 배포/인프라 | CI/CD·컨테이너·환경 설정 | `deployment.md` |
| 설계 리뷰 | 아키텍처 리뷰·도메인 모델 평가 | `domain-driven-design.md` + `data-patterns.md` + `technical-leadership.md` |
| 비용 최적화 | 인프라 비용·리소스 효율화 | `cost-optimization.md` + `performance.md` |
| 디버깅 | 프로덕션 장애 분석·heap snapshot | `debugging.md` + `observability.md` |

### Framework-specific 태스크 (Fastify ↔ NestJS variant 분기)

| 태스크 유형 | Fastify (Read할 파일) | NestJS (Read할 파일) |
|---|---|---|
| 프로젝트 구조/설계 | `fastify/architecture.md` | `nestjs/architecture.md` + `nestjs/providers-di.md` |
| API endpoint 설계/구현 | `fastify/api-design.md` + `fastify/error-handling.md` | `nestjs/controllers.md` + `nestjs/validation.md` + `nestjs/error-handling.md` |
| 인증/인가/보안 (구현) | `fastify/security.md` + `security.md` | `nestjs/controllers.md`(Guards 절) + `security.md` |
| 에러 처리 (구현) | `fastify/error-handling.md` + `error-handling.md` | `nestjs/error-handling.md` + `error-handling.md` |
| 로깅/관찰성 (구현) | `fastify/observability.md` + `observability.md` | `nestjs/observability.md` + `observability.md` |
| 테스트 작성 | `fastify/testing.md` + `testing.md` | `nestjs/testing.md` + `testing.md` |
| 장애 대응 (graceful shutdown) | `fastify/resilience.md` + `resilience.md` | `nestjs/lifecycle-shutdown.md` + `resilience.md` |
| Drizzle 통합 (DI) | `drizzle-orm.md` + `fastify/architecture.md`(plugin 등록) | `nestjs/drizzle-integration.md` + `drizzle-orm.md` |
| BullMQ 통합 (DI) | `message-queues.md` + `fastify/architecture.md` | `nestjs/microservices.md`(또는 별도 BullMQ 절) + `message-queues.md` |
| API 문서화 | `fastify/api-design.md`(스키마 자동) | `nestjs/swagger.md` |
| 마이크로서비스 (구현) | `microservices.md` + `fastify/architecture.md` | `nestjs/microservices.md` + `microservices.md` |
| 검증/DTO | `fastify/api-design.md`(JSON Schema) | `nestjs/validation.md` |

### 복합 태스크

여러 유형에 해당하면 관련 행의 파일을 합집합으로 읽는다.

- **새 API endpoint (Fastify)** → `fastify/api-design.md` + `fastify/error-handling.md` + `database.md` + `fastify/security.md` + `fastify/testing.md`
- **새 API endpoint (NestJS)** → `nestjs/controllers.md` + `nestjs/validation.md` + `nestjs/error-handling.md` + `database.md` + `nestjs/testing.md`
- **서비스 간 통신 설계** (framework 무관) → `system-design.md` + `message-queues.md` + `networking.md` + `resilience.md`

**모든 API 구현 전 필수**: shared/api-contracts.md 확인 (FE-BE 간 계약, 존재 시) + 기존 코드 패턴 확인

---

## Related

### 공통 (Framework-agnostic)

#### API & Architecture
- [system-design.md](system-design.md) — 시스템 설계·Reverse Proxy·Load Balancer
- [microservices.md](microservices.md) — 마이크로서비스 패턴·API Gateway
- [distributed-systems.md](distributed-systems.md) — Consensus·Service Discovery·Idempotency

#### Data Layer
- [database.md](database.md) — Transaction·Isolation·Connection Pool
- [postgresql.md](postgresql.md) — PostgreSQL 고유 기능·인덱스·쿼리 튜닝
- [drizzle-orm.md](drizzle-orm.md) — Drizzle schema·쿼리 빌더
- [data-patterns.md](data-patterns.md) — Event Sourcing·CQRS·Saga
- [domain-driven-design.md](domain-driven-design.md) — Aggregate·Repository·Bounded Context

#### Runtime & Performance
- [nodejs-internals.md](nodejs-internals.md) — V8·Event Loop·GC
- [concurrency.md](concurrency.md) — Worker Threads·Cluster·비동기 처리
- [performance.md](performance.md) — 프로파일링·메모리 누수 진단
- [caching.md](caching.md) — Redis·CDN·Cache-aside
- [networking.md](networking.md) — HTTP/2·DNS·TLS

#### Reliability & Operations (공통 이론)
- [resilience.md](resilience.md) — Circuit Breaker·Retry 패턴 (이론)
- [error-handling.md](error-handling.md) — 에러 분류·AppError 계층 (이론)
- [observability.md](observability.md) — Pino·OpenTelemetry (이론)
- [debugging.md](debugging.md) — Heap snapshot·프로파일링
- [security.md](security.md) — 인증·XSS·Rate Limiting (이론, app-level)
- [deployment.md](deployment.md) — 배포·환경 변수·헬스체크
- [message-queues.md](message-queues.md) — BullMQ·Worker·Pub/Sub (core)

#### Process & Cost
- [testing.md](testing.md) — Vitest·테스트 전략 (이론)
- [cost-optimization.md](cost-optimization.md) — 클라우드 비용 절감·리소스 최적화

### Fastify variant (be/fastify/)

- [fastify/architecture.md](fastify/architecture.md) — Plugin 기반 아키텍처·encapsulation
- [fastify/api-design.md](fastify/api-design.md) — Route 등록·JSON Schema·hooks
- [fastify/error-handling.md](fastify/error-handling.md) — setErrorHandler·onError·onResponse
- [fastify/security.md](fastify/security.md) — @fastify/jwt·@fastify/rate-limit·@fastify/helmet
- [fastify/observability.md](fastify/observability.md) — Fastify+Pino logger 설정·request hooks
- [fastify/resilience.md](fastify/resilience.md) — Graceful shutdown·onClose hook
- [fastify/testing.md](fastify/testing.md) — `app.inject()` 통합 테스트

### NestJS variant (be/nestjs/)

- [nestjs/architecture.md](nestjs/architecture.md) — Module·DI Container·Layered structure
- [nestjs/controllers.md](nestjs/controllers.md) — `@Controller`·`@Get/Post`·Guards·Interceptors
- [nestjs/providers-di.md](nestjs/providers-di.md) — `@Injectable`·Scope·Custom Provider
- [nestjs/request-lifecycle.md](nestjs/request-lifecycle.md) — Middleware → Guard → Interceptor → Pipe → Filter
- [nestjs/error-handling.md](nestjs/error-handling.md) — `@Catch`·ExceptionFilter·HttpException
- [nestjs/validation.md](nestjs/validation.md) — class-validator·DTO·ValidationPipe
- [nestjs/testing.md](nestjs/testing.md) — `Test.createTestingModule`·E2E with `supertest`
- [nestjs/observability.md](nestjs/observability.md) — nestjs-pino·@nestjs/terminus·OpenTelemetry
- [nestjs/lifecycle-shutdown.md](nestjs/lifecycle-shutdown.md) — `OnModuleDestroy`·`enableShutdownHooks`
- [nestjs/microservices.md](nestjs/microservices.md) — `@nestjs/microservices`·Transport·Pattern
- [nestjs/drizzle-integration.md](nestjs/drizzle-integration.md) — Drizzle을 NestJS Provider로 등록
- [nestjs/swagger.md](nestjs/swagger.md) — `@nestjs/swagger`·OpenAPI 자동 생성
