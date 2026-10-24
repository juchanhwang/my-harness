# Unit Testing

> 참조: Robert C. Martin, *Clean Code* (Prentice Hall, 2008) Ch. 9 "Unit Tests" — FIRST 원전 · [Bill Wake — 3A: Arrange-Act-Assert](https://xp123.com/articles/3a-arrange-act-assert/) · [Martin Fowler — Mocks Aren't Stubs](https://martinfowler.com/articles/mocksArentStubs.html) · [Vitest 공식 문서](https://vitest.dev/) · [Google Testing Blog](https://testing.googleblog.com/) · Gerard Meszaros, *xUnit Test Patterns* (Addison-Wesley, 2007) — Test Factory / Builder 패턴 원전

단위 테스트 작성 규칙의 기준은 fe·be 스킬이다. fe-dev·be-dev가 그 파일대로 테스트를 쓰므로, QA가 다른 규칙으로 쓰거나 리뷰하면 컨벤션이 어긋나고 엉뚱한 지적이 나온다. 이 파일은 QA가 단위 테스트를 쓰거나 리뷰할 때 확인할 것만 담는다. 규칙이 다르면 기준 파일을 따른다. 스택은 Vitest이고, FE 컴포넌트는 RTL·MSW를 함께 쓴다.

| 알고 싶은 것 | 기준 파일 |
|---|---|
| FE 철학, 무엇을 테스트할지(§3), 대역(§5), RTL(§6), 구조 컨벤션(§7), 금지 사항(§8) | `~/.claude/skills/fe/testing.md` |
| FE Vitest 설정, 전역 mock, coverage | `~/.claude/skills/fe/testing-vitest-setup.md` |
| FE API 모킹 (MSW) | `~/.claude/skills/fe/testing-msw.md` |
| FE 컴포넌트·훅 패턴, Test Factory | `~/.claude/skills/fe/testing-component-patterns.md` |
| BE 단위 테스트(§2), 대역 전략(§4) | `~/.claude/skills/be/testing.md` |
| NestJS·Fastify 구현 | `~/.claude/skills/be/nestjs/testing.md`, `~/.claude/skills/be/fastify/testing.md` |

## 기본 구조

* FIRST: Fast(밀리초 단위), Independent(순서 무관), Repeatable(환경 무관), Self-validating(pass/fail 자동 판정), Timely(코드와 함께 작성)
* AAA: Arrange는 짧게(길면 팩토리로 추출 — `~/.claude/skills/fe/testing-component-patterns.md` §Test Factory 패턴), Act는 호출 하나, Assert는 하나의 논리적 개념이다. FE의 Given-When-Then 주석은 같은 구조다
* 이름은 구현이 아니라 행동을 설명한다. 언어는 대상 프로젝트의 기존 테스트를 따른다

## 모킹 전략

모킹은 제어할 수 없거나 느린 경계에만 한다.

| 모킹한다 | 모킹하지 않는다 |
|---|---|
| 외부 API, DB, 파일 시스템, 현재 시간, 랜덤 값 | 테스트 대상의 내부 로직, 순수 유틸리티 함수, 자식 컴포넌트 |

* 외부 API: FE는 MSW 핸들러로 응답을 정하고(`~/.claude/skills/fe/testing-msw.md`), BE는 HTTP 클라이언트 경계에서 대역을 쓴다(`~/.claude/skills/be/testing.md` §4). 어느 쪽이든 `global.fetch`를 직접 바꿔 끼우지 않는다. 호출 방식(fetch, axios 등)이 바뀌어도 테스트가 깨지지 않게 하려는 규칙이다
* 시간·랜덤: 고정한다(`vi.useFakeTimers()` + `vi.setSystemTime()`, 랜덤은 고정값 주입). 고정하지 않으면 특정 시각·값에서만 실패하는 플레이키 테스트가 된다
* 원복: 타이머·spy·전역 stub은 훅(`afterEach` 등)에서 원복한다. 테스트 본문 끝에서 하면 assertion이 실패했을 때 실행되지 않아 다음 테스트로 누설된다. 호출 기록은 `vi.clearAllMocks()` 또는 config의 `clearMocks`로 비우고(`~/.claude/skills/be/nestjs/testing.md` §안티패턴), 전역 stub은 `unstubGlobals: true`로 자동 원복한다(`~/.claude/skills/fe/testing-vitest-setup.md` §vitest.config.ts)

## 좋은 테스트 vs 나쁜 테스트

| 나쁜 테스트 | 좋은 테스트 (판별 기준) |
|---|---|
| 구현 세부사항을 검증한다: private·내부 상태(`cart._items`), state setter·내부 함수 호출, CSS 선택자, `wrapper.instance()` | 공개 인터페이스의 결과를 검증한다. 동작이 같은 리팩토링에 깨지면 나쁜 테스트다. 콜백 props나 외부 경계(메일 발송, 결제 요청, 라우터 이동)로 나가는 호출 검증은 행동이므로 해당하지 않는다 |
| 이름이 모호하다 (`it works`, `test1`) | 이름만 보고 어떤 행동이 깨졌는지 안다 |
| 과도하게 모킹한다: 설정이 본문보다 길고, 순수 함수·자식 컴포넌트까지 모킹해 검증할 것이 남지 않는다 | 외부 경계만 모킹하고 핵심 로직은 실제로 실행한다 |
| 테스트끼리 의존한다: 실행 순서, 공유 변수, 원복하지 않은 mock·타이머·전역 stub | 단독 실행하거나 순서를 바꿔도 통과한다 |
| 시간·랜덤을 고정하지 않는다: `Date.now()`, `new Date()`, `Math.random()`, `crypto.randomUUID()` 값이 assertion이나 기본 데이터에 들어간다 | 같은 입력에 언제나 같은 결과가 나온다 |
| 단위 테스트가 실제 DB·Redis·네트워크에 붙는다 | 외부 의존성을 모킹한다. 실제 연결이 필요하면 통합 테스트로 옮긴다(`~/.claude/skills/be/nestjs/testing.md` §안티패턴) |
| 쓸 필요 없는 테스트다: 순수 JSX 배치, 단순 래퍼, 스타일, 프레임워크·서드파티 내부 동작(decorator 메타데이터 등) | 분기·경계가 있는 순수 함수, 복잡한 상태의 훅, 크리티컬 패스, 버그 수정 지점에 쓴다(`~/.claude/skills/fe/testing.md` §3.2) |

FE 컴포넌트 테스트는 `~/.claude/skills/fe/testing.md` §6(쿼리 우선순위, userEvent, findBy)과 §8(금지 사항)로 대조한다.

## 커버리지 목표

* 수치 기준은 프로젝트 threshold가 원본이고 QA는 별도 수치를 두지 않는다. QA는 숫자보다 핵심 로직의 branch(if/else, try/catch, early return)가 덮였는지를 본다
* 기준값: BE는 statements·functions·lines 80, branches 75다(`~/.claude/skills/be/testing.md` §2). FE는 70이고 강제 커트라인이 아닌 경고선이며, 크리티컬 패스·도메인 로직은 90~100%, 단순 래퍼는 0%여도 무방하다(`~/.claude/skills/fe/testing.md` §3.4)
* 100%는 목표가 아니다. 숫자를 채우려고 테스트할 이유가 없는 코드까지 쓰면 assertion 없는 테스트만 늘어난다

## 단위 테스트 체크리스트

* [ ] 하나의 테스트가 하나의 행동만 검증하는가
* [ ] 이름이 행동을 설명하는가
* [ ] 리팩토링해도 동작이 같으면 통과하는가 (구현 세부사항에 결합하지 않았는가)
* [ ] 모킹이 외부 경계(API·DB·파일·시간·랜덤)에만 있는가
* [ ] API를 FE는 MSW로, BE는 HTTP 클라이언트 경계의 대역으로 대체했는가 (`global.fetch` 직접 교체 없음)
* [ ] 시간·랜덤이 고정되어 있는가
* [ ] 엣지 케이스와 에러 케이스가 있는가 (도출은 `test-design.md`)
* [ ] 독립적이고 순서 무관한가 (타이머·spy·전역 stub이 훅에서 원복되는가)
* [ ] AAA 구조가 명확한가
