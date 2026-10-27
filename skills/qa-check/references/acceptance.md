# acceptance — PRD 인수 검증 역할

PRD의 인수 조건 중 **사용자가 하는 행동과 그 결과**를 시나리오로 확정하고 **실행 중인 앱**에서 검증한다. 시안 수치(색·글꼴·간격·radius·폭)는 style 역할이 판정하므로 여기서 재지 않는다. finding은 `A-n`. 공통 규칙은 `SKILL.md`의 「공통 규칙」을 번호로 인용한다.

## 입력

- `prd=` (필수), `app=` (필수)
- `auth=` 로그인 방법·계정 메모 (선택), `scope=` 검증 범위를 좁힐 때 (선택)
- `report-dir=`, `mode=` — 공통

## 시작 전 확인 (하나라도 걸리면 중단하고 BLOCKED, 공통 규칙 1)

- `prd`가 없거나 파일이 없다 → 필요한 것: PRD 경로
- PRD에 인수 조건(acceptance criteria, Given/When/Then, 완료 조건)이 없다 → 필요한 것: PRD 인수 조건 보완(PO 산출물)
- `app`이 없거나 `curl -sf -o /dev/null <app>`이 실패한다 → 필요한 것: 앱 기동(호출자). QA는 앱 서버를 띄우지 않는다
- 이 확인에서 소스는 읽지 않는다. 리포트를 쓰기 전에 공통 규칙 2의 명령으로 `tree:` 값을 정한다

## 읽을 지식 파일

`<SKILL_DIR>/../qa/`의 `test-design.md`, `e2e-testing.md`, `test-planning.md`(범위 템플릿). BE(API 계약)면 `api-testing.md`도 읽는다.
도구는 Read, Playwright(배치 모드: 하네스 러너 `~/.claude/tools/playwright-runner`로 Bash 1회 / 단계 모드: Playwright MCP), Bash(`curl`)를 쓴다. **프로젝트가 자체로 가진 E2E 테스트**(개발자가 커밋해 둔 것. 배치 모드의 임시 spec과는 다르다)는 CI(`.github/workflows/` 등)가 있으면 실행하지 않는다 — PR이 열리면 CI가 돌린다. **CI가 없고 자체 E2E가 있으면** 아무도 안 돌리므로 acceptance가 1회 실행해 결과를 `Checked`에 첨부한다. 자체 E2E가 없는 프로젝트는 해당 없음. 쓰기는 `report-dir` 안만(리포트·스크린샷·배치 모드의 spec·임시 config·결과 출력). 예외는 Playwright MCP가 만드는 `.playwright-mcp/`다.

## 절차 (순서 강제)

1. **시나리오 확정 먼저**: PRD만 Read해 인수 조건마다 시나리오 **1개**(Given/When/Then, 구체 입력값)를 만들고, 리포트 파일의 `## 시나리오` 표에 **가장 먼저 Write**한다. **실패 가능성이 있는 인수 조건**(입력 검증·권한·외부 호출·저장이 걸린 것, 또는 반대 경로를 직접 적은 것)에는 부정 경로 시나리오 1개를 더 만든다(잘못된 입력·권한 없음·응답 실패 등). 표시·이동뿐인 인수 조건은 1개다. 그 밖에 떠오르는 엣지 시나리오는 실행하지 않고 `## E2E candidates`에 제안으로만 남긴다. 색·글꼴·간격·radius·폭 같은 **시안 수치만 묻는 인수 조건은 시나리오를 만들지 않고** 표에 `style 소관`으로 적는다. 행동과 수치가 섞인 인수 조건은 행동 부분만 시나리오로 만들고 수치 부분은 `style 소관`으로 표시한다. 이 Write 전에는 앱의 소스·diff·테스트 파일을 Read·Grep·Glob하지 않는다. 코드가 기준을 오염시키는 것을 막기 위해서다. 앱 화면도 이 Write 전에는 열지 않는다.
2. **실행**: `app`에서 시나리오를 실행한다. API 시나리오는 `curl`. 브라우저 시나리오는 아래 둘 중 하나를 고르고 리포트 `## Checked`에 어느 모드였는지 적는다.
   - **배치 모드(기본)** — 하네스 러너 `~/.claude/tools/playwright-runner/`(`node_modules/.bin/playwright`가 있어야 한다)로 실행한다. 프로젝트의 Playwright는 쓰지 않는다(버전·config 간섭, 프로젝트에 흔적 금지). 브라우저 시나리오 수와 무관하게 이 모드다. 먼저 단계 모드로 시나리오 **1개**를 실행해 셀렉터·로그인·초기 상태를 확인한다(안 보고 쓴 spec은 셀렉터 오류로 가짜 FAIL이 난다). 그다음 `<SKILL_DIR>/assets/playwright.acceptance.config.template.mjs`와 `acceptance.spec.template.mjs`를 `<report-dir>/playwright.acceptance.config.mjs`·`<report-dir>/acceptance-<sha7>.spec.mjs`로 복사해 `__RUNNER__`(러너 절대 경로)·`__REPORT_DIR_ABS__`·`__APP__`을 채우고, 시나리오 전부를 그 spec **하나**에 쓴다(`test()` 하나 = 시나리오 하나, 제목은 시나리오 id, 셀렉터·대기 규칙은 `e2e-testing.md`). `~/.claude/tools/playwright-runner/node_modules/.bin/playwright test --config <report-dir>/playwright.acceptance.config.mjs`를 **1회** 실행하고 stdout을 `<report-dir>/acceptance-<sha7>.results.txt`에 저장한다. Playwright는 `test()`마다 새 브라우저 컨텍스트를 쓰므로 시나리오 독립성은 자동이다. 로그인이 필요하면 `auth=`로 한 번 로그인한 `storageState`를 `<report-dir>/auth-state.json`에 저장해 config에서 재사용한다. 이 spec·config는 **검증 산출물**이다 — 소스 트리에 두거나 커밋하지 않고, 굳힐 가치가 있으면 `## E2E candidates`에 제안한다.
   - **단계 모드(대체)** — 배치 모드를 쓸 수 없을 때(Playwright 러너 없음)만. Playwright MCP로 한 단계씩 조작한다. 판정은 `browser_evaluate`로 참/거짓·값을 물어서 하고, `browser_snapshot`은 요소를 찾을 때와 FAIL 증거를 남길 때만 쓴다(페이지 전체 트리라 무겁다). 시나리오마다 새로 로드하고 필요하면 저장소(localStorage 등)를 비운다.
3. **기록**: 시나리오마다 PASS / FAIL / BLOCKED(환경)와 재현 단계, 실패 시 증거(스크린샷·응답 본문) 경로를 쓴다. 배치 모드면 `results.txt`와 `test-results/`의 실패 스크린샷 경로가 증거다.
4. **원인 확인**: 실패 원인을 알아야 할 때만, 시나리오를 확정·기록한 뒤에 소스를 Read한다.
5. **E2E candidates**: 테스트 코드로 굳힐 만한 시나리오를 `## E2E candidates`에 이유(회귀 위험·빈도)와 함께 **제안**만 한다. 작성은 fe-dev·be-dev의 몫이다.
6. **finding**: id `A-1`, `A-2`…. `where`는 시나리오 id(예: `AC-1`), `expected`는 PRD 문구, `actual`은 관찰 결과, `repro`는 재현 단계다. 기능을 쓸 수 없으면 Critical, 인수 조건이 부분적으로만 실패하면 Major, 표시·엣지 문제는 Minor. 이어서 `findings.json` → `verdict.mjs` → 리포트 → 마커(공통 규칙 2–4).

## 이 역할이 하지 않는 것

- 소스 트리에 테스트 코드(단위·통합·E2E)를 쓰거나 커밋하는 것 — fe-dev·be-dev 소관이다. 배치 모드의 spec은 `report-dir` 안의 검증 산출물이지 프로젝트 테스트가 아니다
- 코드 리뷰 관점의 지적(그건 review 역할이다)
- PRD에 없는 기준을 지어내 FAIL을 내는 것. 통과한 인수 조건을 실패로 보고하는 것
- 시안 수치(색·글꼴·간격·radius·폭) 대조 — style 역할이 `compare-styles.mjs`로 판정한다. 수치를 브라우저에서 다시 재지 않는다

## DoD

- [ ] 시나리오 표가 소스 Read보다 먼저 리포트에 기록됐다
- [ ] 인수 조건마다 시나리오 1개(반대 경로를 적은 인수 조건만 2개)이고, 결과(PASS/FAIL/BLOCKED/style 소관)가 있으며, FAIL마다 재현 단계와 증거가 있다
- [ ] 실행 모드(배치/단계)를 `Checked`에 적었고, 단계 모드였다면 배치 모드를 못 쓴 이유(러너 없음)를 적었다. 배치 모드면 spec·임시 config·`results.txt`·`test-results/`가 모두 `report-dir` 안에 있고 `playwright test`는 1회 실행했다. 단계 모드면 판정을 `browser_evaluate`로 했고 snapshot은 탐색·증거용으로만 썼다
- [ ] `## E2E candidates` 절이 있다
- [ ] `report-dir` 밖에 새 파일이 없고 소스 트리에 테스트 파일을 만들지 않았다(공통 규칙 2의 명령, 즉 `report-dir`과 `.playwright-mcp/`를 뺀 `git status --porcelain`이 비어 있다)
- [ ] 시나리오 표에 범위·완료 기준이 보인다(`test-planning.md`의 범위 템플릿)
- [ ] `verdict.mjs` 출력 = 리포트 `verdict` = 마커 첫 줄
