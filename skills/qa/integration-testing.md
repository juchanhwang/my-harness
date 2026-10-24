# Integration Testing

> 참조: [Martin Fowler — IntegrationTest](https://martinfowler.com/bliki/IntegrationTest.html) · [Martin Fowler — TestDouble](https://martinfowler.com/bliki/TestDouble.html) (Stub, Mock, Fake, Dummy, Spy의 원전) · Gerard Meszaros, *xUnit Test Patterns* (Addison-Wesley, 2007) · [MSW 공식 문서](https://mswjs.io/docs/) · [Supertest](https://github.com/ladjs/supertest) · [Testcontainers](https://testcontainers.com/) (실제 DB 통합 테스트)

통합 테스트 작성 규칙의 기준은 fe·be 스킬이다. fe-dev·be-dev가 그 파일대로 테스트를 쓰므로, QA가 다른 규칙으로 쓰거나 리뷰하면 컨벤션이 어긋난다. 이 파일은 QA가 통합 테스트를 쓰거나 리뷰할 때 확인할 범위와 항목만 담는다. 규칙이 다르면 기준 파일을 따른다. 스택은 BE가 Vitest + `app.inject()`(Fastify) 또는 Supertest(NestJS) + PostgreSQL, FE가 Vitest + RTL + MSW다.

## 범위

통합 테스트는 "각 부품은 멀쩡한데 조립하면 안 돌아가는" 결함을 잡는다. "실제로 연결" 열의 계층을 대역으로 바꾸면 통합 테스트가 아니다.

| 대상 | 실제로 연결 | 대역 |
|---|---|---|
| API 엔드포인트·서비스·미들웨어 체인 (BE) | HTTP 스택(라우팅·검증·인증·권한·에러 핸들러) → Service → Repository → 실제 DB | 외부 서비스(결제·이메일·SMS) |
| 이벤트·큐 처리 (BE) | 이벤트 발행 → 핸들러 → 부수 효과 | 외부 서비스 |
| 컴포넌트 + 훅 + API 호출 (FE) | 실제 컴포넌트·훅·QueryClient | 네트워크 경계 (MSW) |
| 외부 API 연동 | 서비스 → HTTP 클라이언트 | FE는 MSW, BE는 HTTP 클라이언트 경계의 대역 |

* Server Component와 페이지 라우팅은 RTL로 검증할 수 없다. E2E로 검증한다(`~/.claude/skills/fe/testing-nextjs.md` §테스트 전략).
* 한꺼번에 붙이지 않고 DB → Repository → Service → API 순서로 쌓거나 기능 단위 슬라이스로 나눈다. 실패했을 때 원인 범위를 좁히기 위해서다.

## 원칙

* 실제 DB를 쓴다. 프로덕션과 같은 종류(PostgreSQL)여야 하고 인메모리 DB로 대체하지 않으며, 테스트 전용 인스턴스(`TEST_DATABASE_URL`)에 붙는다(`~/.claude/skills/be/testing.md` §3)
* 대역은 제어할 수 없는 외부 서비스에만 쓴다. 종류와 선택 기준은 `~/.claude/skills/be/testing.md` §4, FE는 `~/.claude/skills/fe/testing.md` §5를 따른다
* 앱은 프로덕션과 같은 설정으로 띄운다(`buildApp` factory, `main.ts`의 파이프·필터·버저닝). 다르면 프로덕션 버그를 테스트가 못 잡는다
* 테스트 간 데이터를 격리한다. 트랜잭션 롤백 또는 `beforeEach` clean(FK 제약 역순)을 쓴다. 롤백은 대상 코드가 자체 트랜잭션을 열면 nested transaction(SAVEPOINT)이 필요하다
* 생명주기를 지킨다. `app.ready()` 이후에 요청하고 `afterAll`에서 `app.close()`한다. 누락하면 포트 충돌·커넥션 누수가 난다
* 통합 테스트는 단위 테스트와 분리 실행해 CI 속도를 유지한다(`~/.claude/skills/be/nestjs/testing.md` §Integration 테스트)

## 작성 방법은 기준 파일에서

| 필요한 것 | 기준 파일 |
|---|---|
| Fastify `app.inject()`, buildApp, 인증 토큰 발급, Setup/Teardown, Test DB | `~/.claude/skills/be/fastify/testing.md` |
| NestJS Supertest E2E, `overrideProvider`·`overrideGuard`, DB 격리, 안티패턴 | `~/.claude/skills/be/nestjs/testing.md` |
| BE 통합 테스트 전략·검증 포인트·CI | `~/.claude/skills/be/testing.md` §3, §5 |
| FE MSW 핸들러, 에러·지연·인증 시나리오, `server.use()` 오버라이드 | `~/.claude/skills/fe/testing-msw.md` |
| FE Custom Render, QueryClient 격리 | `~/.claude/skills/fe/testing-component-patterns.md` |

상태 코드 매트릭스·계약·스키마 검증은 `api-testing.md`, 제약·마이그레이션·트랜잭션은 `database-testing.md`, 격리 전략 비교와 Testcontainers는 `test-environments.md`를 본다.

## 통합 테스트 체크리스트

* [ ] 실제 DB(프로덕션과 같은 종류, 테스트 전용 인스턴스)를 쓰는가
* [ ] 덮어야 할 계층(Service·Repository)을 대역으로 바꾸지 않았는가
* [ ] 대역이 외부 서비스에만 있는가 (FE는 MSW + `onUnhandledRequest: 'error'`, BE는 HTTP 클라이언트 경계의 대역)
* [ ] 해피 패스와 에러 케이스(400·401·403·404·409 등)를 모두 덮는가
* [ ] 인증/인가를 실제로 통과·차단하는 테스트가 있는가 (가드를 override한 테스트만 있으면 인증 플로우는 검증되지 않는다)
* [ ] 응답 status와 body 구조를 검증하는가, 민감 필드(비밀번호 해시 등)가 응답에 없는가
* [ ] DB 상태 변화(insert·update·delete)와 부수 효과(이벤트·큐 메시지)를 확인하는가
* [ ] 테스트 간 데이터가 격리되는가 (순서를 바꿔도 통과하는가)
* [ ] 앱 설정이 프로덕션과 같은가
* [ ] FE: 테스트마다 새 QueryClient를 쓰는가, MSW 핸들러의 응답 타입이 실제 API 타입과 같은가 (다르면 테스트만 통과한다)
* [ ] CI에서 안정적으로 도는가 (실제 외부 네트워크나 고정 포트에 의존하지 않는가)
