---
name: be
description: >
  백엔드 도메인 knowledge. Node.js/TypeScript API 설계, PostgreSQL/Drizzle ORM,
  인증/보안, 캐싱(Redis), 메시지 큐(BullMQ), 동시성, 분산 시스템, 마이크로서비스,
  성능 최적화, 장애 대응, 배포, 모니터링 시 활성화.
  서버 로직, DB 쿼리, API endpoint 작성/수정/리뷰 시, 백엔드 설계 판단이 필요할 때 사용한다.
  사용자가 API endpoint, DB 스키마, 쿼리 최적화, 인증 플로우, 캐시 전략,
  큐 처리, 배포 파이프라인, 서버 에러를 언급하면 반드시 이 스킬을 활성화하라.
  명시적으로 '백엔드'라고 말하지 않더라도 서버 사이드 로직, 인프라,
  .controller.ts/.service.ts/.module.ts/.entity.ts 파일을 다루는 작업이면 활성화한다.
---

# BE Domain Knowledge

매핑 테이블의 참조 파일에는 프로젝트 고유의 아키텍처 결정, 검증된 패턴, 안티패턴이 담겨 있다.
이를 읽지 않으면 기존 시스템 설계와 충돌하는 코드를 작성하게 되고, 리뷰에서 반려된다.
코드를 작성하거나 리뷰하기 전에 아래 매핑 테이블에서 태스크에 해당하는 파일을 반드시 Read하라.

**기본 경로**: `~/.claude/skills/be/` — 아래 테이블의 파일명 앞에 이 경로를 붙여서 Read한다.

## 핵심 원칙

- 시스템 철학: "견고하고 확장 가능한 시스템"
- 4대 원칙: 안정성(Reliability), 확장성(Scalability), 관찰 가능성(Observability), 보안(Security)
- 기술 스택: TypeScript strict, Node.js, Fastify 5, PostgreSQL 16+, Drizzle ORM, Redis, BullMQ, Pino, Vitest
- API 계약: RFC 9457 Problem Details 표준, Breaking change는 versioning
- 안티패턴: Happy path만 구현, 추측 기반 최적화, "나중에 보안 처리", 로그 없는 시스템

## 태스크-지식 매핑

| 태스크 유형 | 판단 기준 | Read할 파일 |
|---|---|---|
| API 설계/구현 | endpoint 정의·요청/응답 스키마·라우팅 | `api-design.md` + `error-handling.md` |
| DB 스키마/쿼리 | 테이블 설계·마이그레이션·raw 쿼리 | `database.md` + `postgresql.md` |
| Drizzle ORM 작업 | ORM 스키마·쿼리 빌더·관계 정의 | `drizzle-orm.md` + `database.md` |
| 프로젝트 구조/설계 | 디렉토리·모듈·레이어 구조 결정 | `architecture.md` |
| 인증/인가/보안 | 로그인·토큰·권한·암호화 | `security.md` + `api-design.md` |
| 테스트 작성 | 단위·통합·E2E 서버 테스트 | `testing.md` |
| 로깅/모니터링 | 로그 수집·메트릭·알럿·트레이싱 | `observability.md` |
| 에러 처리 | 예외 설계·에러 응답·복구 전략 | `error-handling.md` + `observability.md` |
| 성능 최적화 | 응답 시간·쓰루풋·병목 해결 | `performance.md` + `nodejs-internals.md` + `postgresql.md` |
| 배포/인프라 | CI/CD·컨테이너·환경 설정 | `deployment.md` + `architecture.md` + `observability.md` |
| 시스템 설계 | 대규모 아키텍처·서비스 간 통신 | `system-design.md` + `distributed-systems.md` + `microservices.md` |
| 캐싱 | Redis·캐시 전략·무효화 정책 | `caching.md` + `performance.md` |
| 메시지 큐 | 비동기 처리·이벤트·BullMQ | `message-queues.md` + `distributed-systems.md` |
| 동시성/락 | 레이스 컨디션·트랜잭션·락 전략 | `concurrency.md` + `database.md` |
| 네트워킹 | HTTP·WebSocket·프로토콜 설정 | `networking.md` + `api-design.md` |
| 장애 대응 | 장애 분석·복구·서킷 브레이커 | `resilience.md` + `debugging.md` + `observability.md` |
| 설계 리뷰 | 아키텍처 리뷰·도메인 모델 평가 | `domain-driven-design.md` + `data-patterns.md` + `technical-leadership.md` |
| 비용 최적화 | 인프라 비용·리소스 효율화 | `cost-optimization.md` + `performance.md` |
| 마이크로서비스 | 서비스 분리·통신·배포 독립성 | `microservices.md` + `message-queues.md` + `distributed-systems.md` |

**복합 태스크**: 여러 유형에 해당하면 관련 행의 파일을 합집합으로 읽는다.
- 새 API endpoint → api-design.md + error-handling.md + database.md + security.md + testing.md
- 서비스 간 통신 설계 → system-design.md + message-queues.md + networking.md + resilience.md

**모든 API 구현 전 필수**: shared/api-contracts.md 확인 (FE-BE 간 계약) + 기존 코드 패턴 확인
