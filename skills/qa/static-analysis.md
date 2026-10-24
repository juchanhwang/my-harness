# Static Analysis

> 📎 QA는 린터·포매터·훅·품질 게이트를 설정하지 않는다. 설정 기준은 `~/.claude/skills/fe/ci-cd.md` §1(CI 실행 순서)·§2(pre-commit/pre-push), `~/.claude/skills/fe/architecture.md` §4.3(ESLint 경계 규칙), `~/.claude/skills/fe/typescript.md` §6(tsconfig), `~/.claude/skills/fe/accessibility.md` 「Testing」(`jsx-a11y`)이다.

## 실행과 첨부

프로젝트의 lint·typecheck·test를 실행하고 결과를 리포트에 붙인다(절차는 `references/review.md` 4단계). 순서는 lint → typecheck → test다(빠른 것 먼저, `fe/ci-cd.md` §1).

* [ ] `test`가 watch 모드(`vitest`)면 한 번 실행하는 스크립트(`test:run`, 없으면 `vitest run`)를 쓴다. watch 모드는 끝나지 않는다 (`~/.claude/skills/fe/testing-vitest-setup.md` 「스크립트 설정」)
* [ ] scripts에 `--fix`·`--write`·`-u`(스냅샷 갱신)가 들어 있으면 그대로 실행하지 않는다. 소스를 고치면 공통 규칙 5(쓰기 범위)를 어긴다. 쓰기 없는 형태로 실행하거나 `Not checked`에 이유를 쓴다

## 실패 분류

환경 문제는 finding이 아니다. 코드 문제만 finding이 된다.

| 구분 | 신호 | 처리 |
|---|---|---|
| 코드 문제 | 오류 위치가 diff 안이거나 diff가 바꾼 심볼의 호출부다. `TS####`, lint 규칙 id, 테스트 `expected`/`received` 불일치. `Cannot find module`이 diff가 추가한 상대 경로(`./foo`)를 가리킨다 | finding. `where`는 오류가 가리키는 `path:line` |
| 환경 문제 | 코드에 닿기 전에 죽는다. `command not found`, `Cannot find module`이 패키지 이름이다(의존성 미설치), `ENOTFOUND`·`ETIMEDOUT`(네트워크), `ECONNREFUSED`(DB·서비스 미기동), `EADDRINUSE`, 필수 환경변수 없음, 권한·메모리·타임아웃 종료 | `Not checked`에 명령·종료 코드·원인 한 줄 |
| 판단 불가 | diff와 무관한 파일에서 실패하거나, 재실행하면 결과가 바뀐다(플레이키) | 한 번 더 실행한다. 그래도 diff와 이어지지 않으면 `Not checked`에 "diff 밖 실패"와 실패 내용을 쓴다 |

## diff에서 볼 항목

* [ ] **검사 비활성화 추가** — `eslint-disable`(파일 전체 `/* eslint-disable */` 포함), 커버리지 제외 주석(`istanbul ignore`·`v8 ignore`). 사유가 적혀 있고 한 줄·한 규칙으로 좁혀져 있는가. TS 억제 주석(`@ts-*`)과 tsconfig 완화는 `type-safety.md`
* [ ] **설정 완화** — ESLint 규칙을 `off`·`warn`으로 내리거나 `ignores`를 늘렸는가. `--max-warnings` 증가, 커버리지 threshold 하향
* [ ] **검사 우회** — scripts에서 lint·typecheck·test 제거, `|| true`, `--passWithNoTests`, CI의 `continue-on-error`. 테스트 `skip`·`only`·삭제는 `code-review.md` 「테스트」
* [ ] **복잡도 급증** — 한 함수에 분기·중첩이 몰렸는가. 순환 복잡도 11 이상은 높음, 21 이상은 위험이고 인지 복잡도는 함수당 15 이하다. 새 분기마다 테스트가 있는지 본다

## 품질 게이트

SonarQube·SonarCloud 같은 게이트가 CI에 있으면 결과를 리포트에 붙인다. 참고 기준은 Bugs·Vulnerabilities 0, 중복 < 3%다. 커버리지 기준값은 프로젝트 threshold가 원본이다(FE `~/.claude/skills/fe/testing-vitest-setup.md`, BE `~/.claude/skills/be/testing.md`). 숫자보다 핵심 로직의 branch가 덮였는지를 본다(`test-strategy.md` 「커버리지」).
