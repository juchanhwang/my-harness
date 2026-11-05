# gate — PR 게이트 역할

역할 리포트를 모아 **PR을 만들어도 되는지**를 판정한다. 이 리포트만이 "PR 생성 가능"을 말할 수 있다. 직접 검증하지 않고, **역할 세션도 띄우지 않는다.** 재사용할 리포트가 없는 역할은 BLOCKED로 끝내고 호출자가 그대로 실행할 명령을 돌려준다. 공통 규칙은 `SKILL.md`의 「공통 규칙」을 번호로 인용한다.

세션을 띄우지 않는 이유: gate는 포크 세션이라 background로 뜨는 하위 세션의 완료 알림을 받지 못한다. 띄우면 판정 없이 끝나 다시 호출되거나, sleep 폴링으로 하위 세션이 끝날 때까지 호출자를 묶는다(2026-10-29~11-05 실측: gate 11회 중 4회가 판정 없이 종료, 3회가 16~30분 폴링). 실행과 대기는 완료 알림을 받는 호출자(팀 리드)가 맡고, gate는 언제 불러도 1~2분 안에 판정이나 실행 목록을 돌려준다.

## 입력

- `type=` (필수) `fe` / `be` / `config`
- `prd=none` (fe·be, 선택) "이 작업에는 PRD 인수 조건이 없다"는 호출자 선언이다(PRD 없는 소규모·개인 작업). acceptance를 요구하지 않고 `n/a`로 기록한다. 선언 없이 `prd=`도 없으면 추론하지 않고 BLOCKED다
- `ui=` (fe만, 선택) `none`이면 "이 작업은 UI 변경이 없다"는 호출자 선언이다. style 산출물을 찾지 않고 `n/a`로 기록한다. 선언 없이 style 입력(`figma`/`mockup`/`targets`)도 없으면 추론하지 않고 BLOCKED다(깜빡한 경우를 잡기 위해)
- 그 외 역할 입력 키(`scope`, `prd`, `figma`/`figma-snapshot`/`mockup`, `app`, `selector`, `targets`, `waivers`, `auth`)는 재사용 판정에 비교하고, BLOCKED일 때 실행 명령에 **받은 문자열 그대로** 옮기기 위한 것이다
- `report-dir=`, `mode=` — 공통

## 시작 전 확인 (하나라도 걸리면 중단하고 BLOCKED, 공통 규칙 1)

- tree가 dirty다(공통 규칙 2의 `git status --porcelain -- . ':(exclude)<report-dir>' ':(exclude).playwright-mcp'`가 비어 있지 않다. `.playwright-mcp/`는 Playwright MCP 산출물이라 판정에서 뺀다) → 필요한 것: **커밋 또는 stash 후 재요청**
- `type`이 없거나 `fe|be|config`가 아니다 → 필요한 것: `type`

## 읽을 지식 파일

없다. 이 역할은 판단하지 않고 종합만 한다. 도구는 Read, Bash(`git`, `node`)만 쓴다. Agent·Skill로 역할 세션을 띄우지 않는다.

## 절차

1. **역할 집합**: `fe` = review + acceptance + **style 검산**(절차 4. `ui=none`이면 `n/a`), `be` = review + acceptance, `config` = review. `prd=none`이면 fe·be의 acceptance는 `n/a`.
2. **재사용 판정**: 역할마다 `report-dir`과 pre-check 기본 위치(`.orchestrator/qa/`)의 `<role>-*.md`를 최근 것부터 읽어, 아래 조건을 **모두** 만족하는 첫 리포트를 재사용한다. 그런 리포트가 없으면 review·acceptance는 절차 3, style은 절차 4의 BLOCKED다.
   - (a) `commit:`이 `git rev-parse HEAD`와 같다
   - (b) `tree: clean`이다
   - (f) **(a)·(b) 대신** 쓸 수 있는 조건(커밋 전에 돈 pre-check): 헤더 `tree-sha:`가 `git rev-parse HEAD^{tree}`와 같다 — 파일 내용이 지금 커밋과 같다. review는 여기에 더해 리포트의 `scope`가 경로 목록이며 그 집합이 `git diff --name-only <이번 scope>`와 같아야 한다 — review는 파일 전체를 읽으므로 내용(`tree-sha`)과 파일 집합이 같으면 같은 검토다(수정 커밋 위에서 `rerun-of`로 돈 pre-check도 여기에 해당한다). 범위(`..`)로 돈 dirty review는 커밋 안 된 파일을 읽지 않았을 수 있어 (f)로 재사용하지 않는다. `tree-sha:`가 없는 리포트는 (f)를 쓸 수 없다
   - (c) `verdict:`가 `BLOCKED`가 아니다. BLOCKED는 입력이 바뀌면 결과가 달라지므로(예: 같은 커밋에서 호출자가 뒤늦게 `figma=`를 채웠다) 재사용하지 않는다
   - (d) 헤더 `inputs:`의 검증 대상 키가 이번 gate가 받은 값과 같다. 같은 커밋에서도 `selector=.btn`을 검증한 리포트는 `selector=.card` 요청의 답이 될 수 없다. `inputs:`를 `key=value` 토큰으로 읽어(값에 공백이 있으면 큰따옴표) 아래 표의 키를 하나씩 비교하고, 한쪽에만 있는 키가 있으면 다른 것으로 본다. `app`·`auth`·`rerun-of`·`mode`·`report-dir`는 비교하지 않는다. (f)로 재사용하는 review는 `scope` 비교 대신 (f)의 조건을 쓴다
   - (e) `node <SKILL_DIR>/scripts/verdict.mjs <리포트와 같은 이름의 .findings.json>` 출력이 헤더 `verdict:`와 같다

   | 역할 | 비교하는 키 | 같다고 보는 기준 |
   |---|---|---|
   | review | `scope` | 문자열이 같거나, 둘 다 git 범위(`..` 포함)이고 `git rev-parse <범위>` 출력이 같다(같은 커밋 범위를 다르게 적은 경우) |
   | style | `figma` `figma-snapshot` `mockup` `mockup-selector` `targets` `selector` `waivers` | 문자열이 같다 |
   | acceptance | `prd` | 문자열이 같다 |
3. **실행 명령(재사용할 review·acceptance가 없을 때)**: 그 역할은 **BLOCKED**이고, 리포트의 `## Blocked by`에 호출자가 그대로 실행할 명령을 `필요한 것`으로 적는다. 값은 이번 gate가 받은 문자열을 **그대로** 옮긴다 — 재사용 판정(d)이 문자열을 비교하므로, 바꿔 적으면 실행 뒤 다시 부른 gate가 그 리포트를 재사용하지 못한다. 확인한 리포트마다 어긋난 조건((a)~(f) 중 무엇)도 함께 적는다.
   - review: `/qa-check review scope=<scope> mode=gate`
   - acceptance: `/qa-check acceptance prd=<prd> app=<app> mode=gate`(받았으면 `auth=`도). 같은 `prd`로 돈, BLOCKED가 아닌 이전 acceptance 리포트가 있고 옆에 `.spec.mjs`가 있으면 가장 최근 것을 `rerun-of=<그 리포트 .md 경로>`로 붙인다 — acceptance가 시나리오 표와 spec을 다시 쓰지 않고 재실행만 한다(`acceptance.md` 「재검증 모드」)
   - `app`이 필요한데 받지 못했으면 명령 대신 `필요한 것: app URL`을 적는다
4. **style 검산**(`type=fe`, `ui=none`이 아닐 때): 절차 2로 고른 style 리포트의 헤더 `design-values:`·`actual-values:` 파일로 `node <SKILL_DIR>/scripts/compare-styles.mjs --design <design> --actual <actual> [--waivers <리포트 inputs의 waivers 또는 report-dir의 style-waivers.json>]`를 다시 돌리고, 그 출력에 `verdict.mjs`를 돌린 결과가 리포트 `verdict:`와 같아야 한다. 또 리포트 `inputs:`의 `targets`/`figma`/`selector`가 이번 gate에 넘어온 값과 같아야 한다(절차 2-(d)). 둘 다 맞으면 그 verdict를 style의 verdict로 쓴다. 절차 2를 만족하는 style 리포트가 없거나(최종 코드에서 잰 리포트 없음) 검산이 어긋나면 style은 **BLOCKED**이고 필요한 것은 "fe-dev가 현재 커밋(tree-sha)에서 `/qa-check style`을 다시 실행"이다. 이 단계는 Figma·브라우저를 쓰지 않는다 — 스크립트 재계산이라 판단이 아니다
5. **집계**: 역할별 verdict를 `node <SKILL_DIR>/scripts/verdict.mjs --aggregate <verdict>...`로 집계한다. 하나라도 BLOCKED면 BLOCKED(FAIL보다 우선), 그다음 FAIL, PASS WITH MINOR, PASS 순이다
6. **리포트**: `<report-dir>/gate-<sha7>.md`(`mode: gate`, `type:`)에 역할별 verdict·리포트 경로·재사용 여부(재사용이면 (a)·(b)인지 (f)인지, 재사용하지 못했으면 어긋난 조건, style이면 `검산 일치`/`n/a (ui=none)`/`BLOCKED`, acceptance가 `prd=none`이면 `n/a (prd=none)`)를 표로 쓴다. BLOCKED 역할이 있으면 절차 3·4의 명령과 각 리포트의 `## Blocked by` "필요한 것"을 **병합**해 적는다. 이 역할은 `findings.json`을 만들지 않는다
7. **마커**: 마지막 텍스트 메시지 첫 줄을 `QA: <aggregate verdict> <gate 리포트 경로>`로 시작한다. 그 아래에 PASS 계열이면 "PR 생성 가능"을 쓴다. BLOCKED면 실행할 명령을 한 줄에 하나씩 그대로 나열하고, 서로 독립이라 병렬로 실행해도 된다고 적는다. 재사용한 리포트 중 FAIL이 있으면 그 finding도 함께 적는다 — 호출자가 실행과 수정을 동시에 시작할 수 있게

## 이 역할이 하지 않는 것

- 직접 코드를 읽거나 앱을 실행해 검증하는 것(style 검산의 스크립트 재실행은 판단이 아니라 재계산이므로 예외)
- review·acceptance·style 역할 세션을 띄우는 것(Agent·Skill 호출), sleep·폴링으로 다른 세션의 결과를 기다리는 것 — 실행과 대기는 호출자가 한다
- 다른 역할의 finding을 재해석하거나 severity·verdict를 바꾸는 것
- dirty tree에서 실행하는 것(BLOCKED)

## DoD

- [ ] tree가 clean임을 확인한 뒤 시작했다
- [ ] Agent·Skill 호출이 0회다
- [ ] 필요한 역할이 전부 리포트(재사용, style은 검산 또는 `n/a`)로 모였거나, 모이지 않은 역할은 BLOCKED이고 실행 명령(받은 값 그대로, 해당하면 `rerun-of=`)이 필요한 것에 있다
- [ ] `prd=none`이면 acceptance를 요구하지 않고 `n/a`로 적었다. 선언 없이 `prd`가 없으면 BLOCKED로 끝냈다
- [ ] style 검산은 `design-values:`·`actual-values:` 파일로 스크립트를 다시 돌려 verdict가 일치했다(또는 `ui=none`으로 `n/a`)
- [ ] 재사용한 리포트는 (a)·(b) 또는 (f), 그리고 (c)~(e)를 만족한다. BLOCKED였던 리포트와 inputs가 다른 리포트는 재사용하지 않았다
- [ ] 집계는 `verdict.mjs --aggregate` 출력이고, 리포트 `verdict` = 마커 첫 줄이다
- [ ] BLOCKED면 "필요한 것"이 병합되어 있다
