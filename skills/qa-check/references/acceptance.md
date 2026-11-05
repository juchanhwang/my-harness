# acceptance — PRD 인수 검증 역할

PRD의 인수 조건 중 **사용자가 하는 행동과 그 결과**를 시나리오로 확정하고 **실행 중인 앱**에서 검증한다. 시안 수치(색·글꼴·간격·radius·폭)는 style 역할이 판정하므로 여기서 재지 않는다. finding은 `A-n`. 공통 규칙은 `SKILL.md`의 「공통 규칙」을 번호로 인용한다.

이 문서에서 `<base>`는 리포트 파일 이름에서 `.md`를 뺀 것이다(`acceptance-<sha7>`, dirty면 `acceptance-<sha7>-w<tree7>`, 공통 규칙 2). 이 실행의 산출물은 모두 이 이름을 쓴다 — 같은 `report-dir`에 이전 실행의 spec·증거가 남아 있어도 섞이거나 지워지지 않게 하기 위해서다.

## 입력

- `prd=` (필수), `app=` (필수)
- `auth=` 로그인 방법·계정 메모 (선택), `scope=` 검증 범위를 좁힐 때 (선택)
- `rerun-of=` (선택) 같은 PRD로 돈 **직전 acceptance 리포트(`.md`) 경로**. 수정 뒤 재검증할 때 호출자(팀 리드, 또는 gate가 돌려준 명령)가 넘긴다. 옆의 `.findings.json`·`.spec.mjs`·`.config.mjs`를 함께 쓴다
- `report-dir=`, `mode=` — 공통

## 시작 전 확인 (하나라도 걸리면 중단하고 BLOCKED, 공통 규칙 1)

- `prd`가 없거나 파일이 없다 → 필요한 것: PRD 경로
- PRD에 인수 조건(acceptance criteria, Given/When/Then, 완료 조건)이 없다 → 필요한 것: PRD 인수 조건 보완(PO 산출물)
- `app`이 없거나 `curl -sf -o /dev/null <app>`이 실패한다 → 필요한 것: 앱 기동(호출자). QA는 앱 서버를 띄우지 않는다
- 이 확인에서 소스는 읽지 않는다. 리포트를 쓰기 전에 공통 규칙 2의 명령으로 `tree:` 값을 정하고, `git hash-object <prd>`로 `prd-sha:` 값을 정한다(PRD 내용 지문. 재검증 모드가 PRD가 바뀌었는지 판정하는 데 쓴다)

## 읽을 지식 파일

`<SKILL_DIR>/../qa/`의 `test-design.md`, `e2e-testing.md`, `test-planning.md`(범위 템플릿). BE(API 계약)면 `api-testing.md`도 읽는다. 재검증 모드에서는 시나리오와 spec을 새로 만들지 않으므로 `e2e-testing.md`만 읽는다.
도구는 Read, Playwright(배치 모드: 하네스 러너 `~/.claude/tools/playwright-runner`로 Bash 1회 / 단계 모드: Playwright MCP), Bash(`curl`, `cp`, `git hash-object`)를 쓴다. **프로젝트가 자체로 가진 E2E 테스트**(개발자가 커밋해 둔 것. 배치 모드의 임시 spec과는 다르다)는 CI(`.github/workflows/` 등)가 있으면 실행하지 않는다 — PR이 열리면 CI가 돌린다. **CI가 없고 자체 E2E가 있으면** 아무도 안 돌리므로 acceptance가 1회 실행해 결과를 `Checked`에 첨부한다. 자체 E2E가 없는 프로젝트는 해당 없음. 쓰기는 `report-dir` 안만(리포트·스크린샷·배치 모드의 spec·임시 config·결과 출력). 예외는 Playwright MCP가 만드는 `.playwright-mcp/`다.
Bash에 삭제 명령(`rm`·`unlink` 등)을 쓰지 않는다. 삭제 확인 훅(`~/.claude/hooks/ask-before-delete.py`)은 `rm`이 `>`·`|`와 한 명령에 섞이면 `report-dir` 안의 파일이어도 사용자 확인을 기다리고, 그동안 세션이 멈춘다(2026-11-05 W2b 실행에서 약 23분). 다시 만들 파일은 덮어쓰고(`>`), 실행 전에 비울 기록 파일은 `: > <파일>`로 비우며, 임시 파일은 `/tmp`가 아니라 `report-dir`에 쓴다.

## 절차 (순서 강제)

`rerun-of=`가 있으면 먼저 「재검증 모드」의 (a)를 확인한다. 재검증 모드로 진행하면 아래 1·2 대신 (b)~(e)를 따르고 3~6은 그대로다.

1. **시나리오 확정 먼저**: PRD만 Read해 인수 조건마다 시나리오 **1개**(Given/When/Then, 구체 입력값)를 만들고, 리포트 파일의 `## 시나리오` 표에 **가장 먼저 Write**한다. **실패 가능성이 있는 인수 조건**(입력 검증·권한·외부 호출·저장이 걸린 것, 또는 반대 경로를 직접 적은 것)에는 부정 경로 시나리오 1개를 더 만든다(잘못된 입력·권한 없음·응답 실패 등). 표시·이동뿐인 인수 조건은 1개다. 그 밖에 떠오르는 엣지 시나리오는 실행하지 않고 `## E2E candidates`에 제안으로만 남긴다. 색·글꼴·간격·radius·폭 같은 **시안 수치만 묻는 인수 조건은 시나리오를 만들지 않고** 표에 `style 소관`으로 적는다. 행동과 수치가 섞인 인수 조건은 행동 부분만 시나리오로 만들고 수치 부분은 `style 소관`으로 표시한다. 이 Write 전에는 앱의 소스·diff·테스트 파일을 Read·Grep·Glob하지 않는다. 코드가 기준을 오염시키는 것을 막기 위해서다. 앱 화면도 이 Write 전에는 열지 않는다.
2. **실행**: `app`에서 시나리오를 실행한다. API 시나리오는 `curl`. 브라우저 시나리오는 아래 둘 중 하나를 고르고 리포트 `## Checked`에 어느 모드였는지 적는다.
   - **배치 모드(기본)** — 하네스 러너 `~/.claude/tools/playwright-runner/`(`node_modules/.bin/playwright`가 있어야 한다)로 실행한다. 프로젝트의 Playwright는 쓰지 않는다(버전·config 간섭, 프로젝트에 흔적 금지). 브라우저 시나리오 수와 무관하게 이 모드다. 먼저 단계 모드로 시나리오 **1개**를 실행해 셀렉터·로그인·초기 상태를 확인한다(안 보고 쓴 spec은 셀렉터 오류로 가짜 FAIL이 난다). 그다음 `<SKILL_DIR>/assets/playwright.acceptance.config.template.mjs`와 `acceptance.spec.template.mjs`를 `<report-dir>/<base>.config.mjs`·`<report-dir>/<base>.spec.mjs`로 복사해 `__RUNNER__`(러너 절대 경로)·`__REPORT_DIR_ABS__`·`__APP__`·`__BASE__`를 채우고, 시나리오 전부를 그 spec **하나**에 쓴다(`test()` 하나 = 시나리오 하나, 제목은 시나리오 id, 셀렉터·대기 규칙은 `e2e-testing.md`). `~/.claude/tools/playwright-runner/node_modules/.bin/playwright test --config <report-dir>/<base>.config.mjs`를 **1회** 실행하고 stdout을 `<report-dir>/<base>.results.txt`에 저장한다. config는 이번 spec만 실행하고(`testMatch`) 증거를 `<base>-results/`에 남기므로(`outputDir`), 이전 spec을 지우거나 config를 고칠 필요가 없다. Playwright는 `test()`마다 새 브라우저 컨텍스트를 쓰므로 시나리오 독립성은 자동이다. 로그인이 필요하면 `auth=`로 한 번 로그인한 `storageState`를 `<report-dir>/auth-state.json`에 저장해 config에서 재사용한다. 이 spec·config는 **검증 산출물**이다 — 소스 트리에 두거나 커밋하지 않고, 굳힐 가치가 있으면 `## E2E candidates`에 제안한다.
   - **단계 모드(대체)** — 배치 모드를 쓸 수 없을 때(Playwright 러너 없음)만. Playwright MCP로 한 단계씩 조작한다. 판정은 `browser_evaluate`로 참/거짓·값을 물어서 하고, `browser_snapshot`은 요소를 찾을 때와 FAIL 증거를 남길 때만 쓴다(페이지 전체 트리라 무겁다). 시나리오마다 새로 로드하고 필요하면 저장소(localStorage 등)를 비운다.
3. **기록**: 시나리오마다 PASS / FAIL / BLOCKED(환경)와 재현 단계, 실패 시 증거(스크린샷·응답 본문) 경로를 쓴다. 배치 모드면 `<base>.results.txt`와 `<base>-results/`의 실패 스크린샷 경로가 증거다.
4. **원인 확인**: 실패 원인을 알아야 할 때만, 시나리오를 확정·기록한 뒤에 소스를 Read한다.
5. **E2E candidates**: 테스트 코드로 굳힐 만한 시나리오를 `## E2E candidates`에 이유(회귀 위험·빈도)와 함께 **제안**만 한다. 작성은 fe-dev·be-dev의 몫이다.
6. **finding**: id `A-1`, `A-2`…. `where`는 시나리오 id(예: `AC-1`), `expected`는 PRD 문구, `actual`은 관찰 결과, `repro`는 재현 단계다. 기능을 쓸 수 없으면 Critical, 인수 조건이 부분적으로만 실패하면 Major, 표시·엣지 문제는 Minor. 이어서 `findings.json` → `verdict.mjs` → 리포트 → 마커(공통 규칙 2–4).

## 재검증 모드 (`rerun-of=`)

직전 실행의 시나리오 표와 spec을 그대로 다시 쓴다. acceptance 비용의 대부분은 시나리오를 정하고 spec을 쓰는 데 들고, `playwright test` 실행은 보통 1~2분이다. 그래서 실패한 시나리오만 고르지 않고 **spec 전체를 다시 실행**한다 — 수정이 다른 인수 조건을 깨뜨린 회귀까지 같은 비용으로 잡는다. 기준(시나리오)이 실행마다 바뀌지 않으니 직전 결과와 바로 비교할 수 있다는 것도 이유다.

- (a) **전량 모드로 돌아가는 조건** — 하나라도 걸리면 재검증 모드를 쓰지 않고 절차 1부터 하며, `## Checked`에 걸린 조건을 적는다
  - 직전 리포트나 옆의 `.spec.mjs`가 없다(단계 모드였던 실행 포함)
  - 직전 `verdict:`가 BLOCKED다(시나리오 표나 spec이 끝까지 만들어지지 않았을 수 있다)
  - 직전 `inputs:`의 `prd`가 이번 `prd`와 문자열이 다르다
  - 직전 `prd-sha:`가 이번 값과 다르다 — PRD 내용이 바뀌면 시나리오도 달라져야 한다. 직전 리포트에 `prd-sha:`가 없으면(이 필드 도입 전 리포트) `git ls-files --error-unmatch <prd>`가 성공(추적되는 파일)하고 `git diff --quiet <직전 commit> HEAD -- <prd>`도 성공할 때만 "안 바뀜"으로 본다. 추적되지 않는 파일은 `git diff`가 차이를 보지 못해 늘 성공하므로 추적 여부를 먼저 확인한다. 둘 중 하나라도 실패하면 이 조건에 걸린 것으로 본다
- (b) **시나리오 표**: 직전 리포트의 `## 시나리오` 표를 결과 열만 비워 새 리포트에 **가장 먼저** Write한다. 시나리오를 추가·삭제·수정하지 않는다. 직전 리포트의 finding을 보고 빠진 경로가 떠오르면 `## E2E candidates`에 적는다 — 기준을 실행마다 바꾸면 직전 결과와 비교할 수 없다. 이 Write 전에는 소스를 읽지 않는다(절차 1과 같은 이유)
- (c) **spec·config**: 직전 `.spec.mjs`를 `<report-dir>/<base>.spec.mjs`로 `cp`한다. config는 복사하지 않고 템플릿에서 절차 2와 같이 새로 만든다. `app` 주소나 `report-dir` 위치가 직전 실행과 달라졌을 수 있고, 템플릿은 자리만 채우면 되므로 비용이 거의 없다. spec 본문은 고치지 않는다. 예외는 두 가지다. 하나는 spec에 직전 app 주소나 절대 경로가 직접 적혀 있을 때 그 값만 이번 값으로 바꾸는 것이고, 다른 하나는 (e)다. 셀렉터·로그인은 직전 실행에서 이미 확인했으므로 단계 모드 사전 확인은 하지 않는다
- (d) **실행**: 절차 2의 배치 모드 명령을 **1회** 실행하고 stdout을 `<base>.results.txt`에 저장한다
- (e) **결과 대조**: 직전 PASS였는데 이번에 FAIL인 시나리오는 회귀 후보다. 수정이 마크업을 바꿔 spec 셀렉터가 맞지 않게 된 것인지 단계 모드로 **그 시나리오만** 확인한다. spec 결함이면 그 `test()`만 고치고 `--grep "<시나리오 id>"`로 그 시나리오만 다시 실행한 뒤 고친 내용을 `## Checked`에 적는다(이것만 1회 실행 규칙의 예외다). 앱 결함이면 finding이다
- (f) **finding**: 직전 `.findings.json`의 finding을 시나리오 결과로 하나씩 판정한다. 그 시나리오가 PASS면 해소다 — 새 `findings.json`에서 빼고 `## Resolved from <직전 리포트 경로>`에 id와 한 줄 근거를 적는다. 아직 FAIL이면 같은 id로 남긴다. 새 finding은 직전 최대 번호 다음부터 매긴다
- (g) 헤더 `inputs:`에 `rerun-of=`도 그대로 적는다(gate의 재사용 비교 키는 `prd`뿐이라 영향 없다). `## Checked`에 "재검증 모드(직전 `<경로>`의 시나리오·spec 재사용)"라고 적는다

## 이 역할이 하지 않는 것

- 소스 트리에 테스트 코드(단위·통합·E2E)를 쓰거나 커밋하는 것 — fe-dev·be-dev 소관이다. 배치 모드의 spec은 `report-dir` 안의 검증 산출물이지 프로젝트 테스트가 아니다
- 코드 리뷰 관점의 지적(그건 review 역할이다)
- PRD에 없는 기준을 지어내 FAIL을 내는 것. 통과한 인수 조건을 실패로 보고하는 것
- 시안 수치(색·글꼴·간격·radius·폭) 대조 — style 역할이 `compare-styles.mjs`로 판정한다. 수치를 브라우저에서 다시 재지 않는다
- 이전 실행의 spec·config·증거를 지우거나 고치는 것 — 새 실행은 새 `<base>` 이름으로 쓴다

## DoD

- [ ] 시나리오 표가 소스 Read보다 먼저 리포트에 기록됐다
- [ ] 인수 조건마다 시나리오 1개(반대 경로를 적은 인수 조건만 2개)이고, 결과(PASS/FAIL/BLOCKED/style 소관)가 있으며, FAIL마다 재현 단계와 증거가 있다
- [ ] 실행 모드(배치/단계)를 `Checked`에 적었고, 단계 모드였다면 배치 모드를 못 쓴 이유(러너 없음)를 적었다. 배치 모드면 `<base>.spec.mjs`·`<base>.config.mjs`·`<base>.results.txt`·`<base>-results/`가 모두 `report-dir` 안에 있고 `playwright test`는 1회 실행했다(재검증 모드 (e)의 `--grep` 재실행 제외). 단계 모드면 판정을 `browser_evaluate`로 했고 snapshot은 탐색·증거용으로만 썼다
- [ ] 헤더에 `prd-sha:`가 있다
- [ ] 재검증 모드면 직전 시나리오 표를 바꾸지 않고 옮겼고, spec을 새로 쓰지 않고 복사했으며, 직전 finding마다 해소/미해소를 판정했다. 전량 모드로 돌아갔으면 걸린 조건을 `Checked`에 적었다
- [ ] `## E2E candidates` 절이 있다
- [ ] Bash 명령에 삭제 명령(`rm`·`unlink` 등)이 없다
- [ ] `report-dir` 밖에 새 파일이 없고 소스 트리에 테스트 파일을 만들지 않았다(공통 규칙 2의 명령, 즉 `report-dir`과 `.playwright-mcp/`를 뺀 `git status --porcelain`이 비어 있다)
- [ ] 시나리오 표에 범위·완료 기준이 보인다(`test-planning.md`의 범위 템플릿)
- [ ] `verdict.mjs` 출력 = 리포트 `verdict` = 마커 첫 줄
