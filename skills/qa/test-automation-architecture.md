# Test Automation Architecture

> 참조: Gerard Meszaros, *xUnit Test Patterns: Refactoring Test Code* (Addison-Wesley, 2007) — Test Fixture / Factory / Test Double 원전 · [xunitpatterns.com](http://xunitpatterns.com/) · [Martin Fowler — Test Smells](https://martinfowler.com/articles/test-fabrications.html) · Robert C. Martin, *Clean Code* (Prentice Hall, 2008) Ch. 9 (테스트 코드 품질) · [ISTQB Advanced Level Test Automation Engineer Syllabus](https://www.istqb.org/)

테스트 코드도 프로덕션 코드와 같은 품질 기준(DRY, 가독성, 유지보수성)으로 본다. 구조·팩토리·fixture·헬퍼의 구현 규칙은 fe·be 스킬이 기준이다. fe-dev·be-dev가 그 파일대로 테스트를 쓰므로, QA가 다른 구조를 요구하면 컨벤션이 어긋난다. 이 파일은 QA가 테스트 코드를 쓰거나 리뷰할 때 확인할 것만 담는다. 규칙이 다르면 기준 파일을 따른다. 스택은 Vitest, RTL, MSW이고 E2E는 Playwright다.

## 구현 규칙은 기준 파일에서

| 주제 | 기준 파일 |
|---|---|
| 파일 위치(co-location), 디렉토리 구조 | `~/.claude/skills/fe/testing.md` §7, `~/.claude/skills/fe/testing-vitest-setup.md` §디렉토리 구조. BE는 `~/.claude/skills/be/nestjs/testing.md`, `~/.claude/skills/be/fastify/testing.md` |
| 전역 setup (MSW lifecycle, RTL cleanup, 전역 no-op stub) | `~/.claude/skills/fe/testing-vitest-setup.md` §vitest.setup.ts |
| Custom Render, 훅 테스트 | `~/.claude/skills/fe/testing-component-patterns.md` §Custom Render Setup |
| Test Factory | `~/.claude/skills/fe/testing-component-patterns.md` §Test Factory 패턴 |
| BE 앱 생명주기, DB 격리, mock 재사용 | `~/.claude/skills/be/fastify/testing.md` §테스트 Setup/Teardown, `~/.claude/skills/be/nestjs/testing.md` §Integration 테스트·§안티패턴 |
| E2E: 인증 상태 재사용, 플레이키 방지 | `e2e-testing.md`. Page Object 구현 예시는 `~/.claude/skills/fe/testing-nextjs.md` §Playwright E2E 패턴 |
| CI 설정 (병렬·샤딩·리포트·캐시) | `ci-cd-testing.md`, `~/.claude/skills/fe/testing-vitest-setup.md` §성능 최적화 |
| 자동화율·플레이키 비율 측정 | `qa-metrics.md` |

## 테스트 코드 품질 규칙

### 구조와 재사용

* 테스트 데이터는 팩토리 함수와 `overrides` 인자로 만든다. 같은 객체 리터럴이나 mock 객체를 spec마다 복붙하지 않는다(`~/.claude/skills/be/nestjs/testing.md` §안티패턴)
* 팩토리 기본값은 결정론적이다. 고정 날짜와 카운터 ID를 쓰고, 랜덤·현재 시각은 기본값에 넣지 않는다. 넣으면 실패를 재현할 수 없다
* 빌더는 복잡한 객체에만 쓴다. 헬퍼·빌더가 입력과 기대값을 가려 테스트 의도가 안 보이면 과한 추상화다
* 공통 setup은 setup 파일 한 곳에 둔다. spec마다 MSW `listen`·`resetHandlers`·`close`를 중복 등록하지 않는다
* Custom Render는 앱의 실제 Provider 순서를 반영하고, 테스트마다 새 QueryClient(`retry: false`)를 만든다. Provider가 빠지면 context를 읽는 훅이 undefined를 반환하거나 throw한다
* E2E 로그인은 테스트마다 UI로 반복하지 않고 저장한 인증 상태를 재사용한다(`e2e-testing.md`)

### 상태 격리 (플레이키 방지)

* 테스트마다 초기화한다: QueryClient(공유하면 캐시가 오염된다), DB 상태, mock 호출 기록
* 테스트가 끝나면 원복한다: 타이머, spy, 전역 stub(`unstubGlobals: true`)
* 공유 변수, 실행 순서 의존, 실제 시간·랜덤·외부 네트워크 의존이 없다
* RTL 테스트에서 테스트 수준 병렬(`sequence.concurrent`)은 끈다. cleanup이 충돌한다(`~/.claude/skills/fe/testing-vitest-setup.md` §성능 최적화)
* E2E 플레이키(하드코딩 대기, 공유 데이터, 순서 의존)는 `e2e-testing.md`를 따른다

### 린트

테스트 파일에는 `@vitest/eslint-plugin`(구 `eslint-plugin-vitest`)의 아래 규칙을 적용한다.

| 규칙 | 수준 | 막는 것 |
|---|---|---|
| `vitest/no-focused-tests` | error | `.only`가 커밋되어 나머지 테스트가 조용히 건너뛰어짐 |
| `vitest/expect-expect` | error | assertion 없는 테스트 (항상 통과) |
| `vitest/no-identical-title` | error | 같은 이름의 테스트 (실패했을 때 구분 불가) |
| `vitest/no-disabled-tests` | warn | `.skip`이 쌓여 커버리지가 사라짐 |
| `vitest/no-conditional-tests` | warn | 조건문 안에서 정의되어 환경에 따라 실행 여부가 달라지는 테스트 |

## 체크리스트

* [ ] 테스트 파일 위치와 디렉토리가 기준 파일의 구조를 따르는가
* [ ] 팩토리/빌더로 테스트 데이터를 만들고 기본값이 결정론적인가
* [ ] 공통 설정이 setup 파일·헬퍼 한 곳에 있는가
* [ ] Custom Render가 앱의 모든 Provider를 포함하는가
* [ ] 상태가 테스트마다 격리되고 원복되는가
* [ ] 테스트 코드에도 린트 규칙이 적용되는가
* [ ] CI에서 안정적으로 도는가 (`pool: 'forks'`, 타입 체크는 `tsc --noEmit`으로 분리), 테스트 리포트가 자동 생성되는가
