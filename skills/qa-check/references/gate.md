# gate — PR 게이트 역할

역할 리포트를 모아 **PR을 만들어도 되는지**를 판정한다. 이 리포트만이 "PR 생성 가능"을 말할 수 있다. 직접 검증하지 않고 역할 세션에 맡긴다. 공통 규칙은 `SKILL.md`의 「공통 규칙」을 번호로 인용한다.

## 입력

- `type=` (필수) `fe` / `be` / `config`
- 그 외 역할 입력 키(`scope`, `prd`, `figma`/`figma-snapshot`/`mockup`, `app`, `selector`, `targets`, `waivers`, `auth`)는 역할 세션으로 **그대로 전달**하기 위한 것이다
- `report-dir=`, `mode=` — 공통

## 시작 전 확인 (하나라도 걸리면 중단하고 BLOCKED, 공통 규칙 1)

- tree가 dirty다(공통 규칙 2의 `git status --porcelain -- . ':(exclude)<report-dir>'`가 비어 있지 않다) → 필요한 것: **커밋 또는 stash 후 재요청**. 역할 세션을 하나도 띄우지 않는다
- `type`이 없거나 `fe|be|config`가 아니다 → 필요한 것: `type`

## 읽을 지식 파일

없다. 이 역할은 판단하지 않고 종합만 한다. 도구는 Read, Bash(`git`, `node`), Agent(`qa` 역할 세션)만 쓴다.

## 절차

1. **역할 집합**: `fe` = review + style + acceptance, `be` = review + acceptance, `config` = review.
2. **재사용 판정**: 역할마다 `report-dir`에서 가장 최근 `<role>-*.md`를 찾아 헤더를 읽는다. 아래 조건을 **모두** 만족할 때만 재사용하고, 하나라도 어긋나면 그 역할은 새로 실행한다.
   - (a) `commit:`이 `git rev-parse HEAD`와 같다
   - (b) `tree: clean`이다
   - (c) `verdict:`가 `BLOCKED`가 아니다. BLOCKED는 입력이 바뀌면 결과가 달라지므로(예: 같은 커밋에서 호출자가 뒤늦게 `figma=`를 채웠다) 재사용하지 않고 다시 실행한다
   - (d) 헤더 `inputs:`의 검증 대상 키가 이번에 그 역할 세션에 넘길 값과 같다. 같은 커밋에서도 `selector=.btn`을 검증한 리포트는 `selector=.card` 요청의 답이 될 수 없다. `inputs:`를 `key=value` 토큰으로 읽어(값에 공백이 있으면 큰따옴표) 아래 표의 키를 하나씩 비교하고, 한쪽에만 있는 키가 있으면 다른 것으로 본다. `app`·`auth`는 비교하지 않는다
   - (e) `node <SKILL_DIR>/scripts/verdict.mjs <role>-<sha7>.findings.json` 출력이 헤더 `verdict:`와 같다

   | 역할 | 비교하는 키 | 같다고 보는 기준 |
   |---|---|---|
   | review | `scope` | 문자열이 같거나, 둘 다 git 범위(`..` 포함)이고 `git rev-parse <범위>` 출력이 같다(같은 커밋 범위를 다르게 적은 경우) |
   | style | `figma` `figma-snapshot` `mockup` `mockup-selector` `targets` `selector` `waivers` | 문자열이 같다 |
   | acceptance | `prd` | 문자열이 같다 |
3. **실행**: 재사용하지 않는 역할은 **한 메시지에서 병렬로** `Agent(subagent_type: "qa", prompt: "<SKILL_DIR>/SKILL.md의 공통 규칙과 <SKILL_DIR>/references/<role>.md를 Read하고 그대로 수행하라. 입력: <해당 역할이 쓰는 키들> mode=gate")`로 띄운다. **`name` 파라미터는 쓰지 않는다**(팀원으로 승격되지 않게). 각 세션이 돌려준 마지막 메시지 첫 줄(`QA: <verdict> <path>`)에서 리포트 경로를 얻는다
4. **집계**: 역할별 verdict를 `node <SKILL_DIR>/scripts/verdict.mjs --aggregate <verdict>...`로 집계한다. 하나라도 BLOCKED면 BLOCKED(FAIL보다 우선), 그다음 FAIL, PASS WITH MINOR, PASS 순이다
5. **리포트**: `<report-dir>/gate-<sha7>.md`(`mode: gate`, `type:`)에 역할별 verdict·리포트 경로·재사용 여부(새로 실행했다면 어긋난 조건)를 표로 쓴다. BLOCKED 역할이 있으면 각 리포트의 `## Blocked by` "필요한 것"을 **병합**해 적는다. 이 역할은 `findings.json`을 만들지 않는다
6. **마커**: 마지막 텍스트 메시지 첫 줄을 `QA: <aggregate verdict> <gate 리포트 경로>`로 시작한다. 그 아래에 PASS 계열이면 "PR 생성 가능", 그 외에는 막힌 이유를 쓴다

## 이 역할이 하지 않는 것

- 직접 코드를 읽거나 앱을 실행해 검증하는 것
- 다른 역할의 finding을 재해석하거나 severity·verdict를 바꾸는 것
- dirty tree에서 실행하는 것(BLOCKED)

## DoD

- [ ] tree가 clean임을 확인한 뒤 시작했다
- [ ] 필요한 역할이 전부 리포트(재사용 또는 새 실행)로 모였다
- [ ] 재사용한 리포트는 (a)~(e)를 모두 만족한다. BLOCKED였던 리포트와 inputs가 다른 리포트는 재사용하지 않고 새로 실행했다
- [ ] 새 실행은 한 메시지에서 병렬로 띄웠고 `name`을 쓰지 않았다
- [ ] 집계는 `verdict.mjs --aggregate` 출력이고, 리포트 `verdict` = 마커 첫 줄이다
- [ ] BLOCKED면 "필요한 것"이 병합되어 있다
