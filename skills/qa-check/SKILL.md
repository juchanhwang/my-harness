---
name: qa-check
description: Use when a QA role must run in its own session — code review of a diff, Figma-vs-implementation style audit, PRD acceptance verification, or the PR gate that merges them. Invoked as /qa-check role key=value...
context: fork
agent: qa
background: false
arguments: role
argument-hint: "review|style|acceptance|gate key=value ..."
user-invocable: true
---

# /qa-check — QA 역할 세션

이 세션은 `qa` 에이전트가 **역할 하나**만 수행하는 포크 세션이다. 호출자의 대화는 보이지 않는다. 필요한 입력은 아래 인자에 모두 들어 있어야 하고, 없으면 지어내지 않고 BLOCKED로 끝낸다.

- 역할: `$role`
- 전체 인자: `$ARGUMENTS` (첫 토큰이 역할이고 나머지가 `key=value`)
- SKILL_DIR: `${CLAUDE_SKILL_DIR}`

## 시작 순서

1. 역할(`$role`)이 `review`, `style`, `acceptance`, `gate` 중 하나가 아니면 **아무것도 읽거나 실행하지 말고** 네 역할 이름을 나열한 뒤 `QA: BLOCKED -`로 시작하는 메시지로 끝낸다(리포트를 쓰지 않는 BLOCKED는 경로 자리에 `-`).
2. `<SKILL_DIR>/references/$role.md` **하나만** Read하고 그 절차를 따른다. 다른 역할의 문서는 읽지 않는다. 지식 파일은 역할 문서가 지정한 `<SKILL_DIR>/../qa/<file>`만 읽는다.
3. 인자에서 `key=value`를 파싱한다. 값에 공백이 있으면 큰따옴표로 묶여 온다.

## 입력 키

| 키 | 의미 | 사용 역할 |
|---|---|---|
| `scope=` | git 범위(`main..HEAD`) 또는 경로 목록 | review, gate |
| `prd=` | PRD 파일 경로 | acceptance(필수), gate(FE/BE) |
| `figma=` | Figma 노드 URL(`node-id` 포함) | style(1순위), gate(FE) |
| `figma-snapshot=` | 사전 추출한 Figma 값 JSON 경로. 지정하면 Figma MCP를 호출하지 않는다(**eval·fixture 전용**, 운용에서는 쓰지 않는다). 리포트에 `source: snapshot` | style |
| `mockup=` | `docs/mockup.html` 경로(figma가 없을 때) | style, gate(FE) |
| `mockup-selector=` | mockup 안의 비교 대상 셀렉터(기본 `selector=`와 같음) | style |
| `targets=` | 다중 대상 매니페스트 JSON `[{figma, selector, viewport?, mockup-selector?}]`. 지정하면 `figma=`·`selector=`는 무시 | style, gate(FE) |
| `app=` | 실행 중인 앱 URL(호출자가 서버를 띄운다. QA는 앱 서버를 띄우지 않는다) | style, acceptance(필수), gate |
| `selector=` | 비교 대상 DOM 셀렉터(단일 대상) | style |
| `auth=` | 로그인 방법·계정 메모 또는 파일 경로 | style, acceptance |
| `waivers=` | designer가 승인한 차이 목록 JSON(기본 `<report-dir>/style-waivers.json`, 없으면 waiver 0건). **읽기만 한다** | style, gate(FE) |
| `type=` | `fe` / `be` / `config` | gate(필수) |
| `mode=` | `pre-check`(기본, fe·be가 호출, 승인 권한 없음) / `gate`(gate가 역할 세션을 띄울 때) | 전체 |
| `report-dir=` | 리포트 저장 디렉터리(기본 `.orchestrator/qa/`) | 전체 |

## 공통 규칙

1. **BLOCKED**: 필수 입력 누락이나 환경 차단(앱 다운, PRD 없음, Figma 소스 없음 등)으로 검증을 시작하거나 끝낼 수 없으면 BLOCKED다. 코드 결함이 아니다. 리포트에 `## Blocked by`와 `- 필요한 것: …` 목록을 쓰고 추측으로 진행하지 않는다. 다른 finding보다 우선한다.
2. **리포트**: `<report-dir>/<role>-<sha7>.md`와 `<role>-<sha7>.findings.json`을 쓴다(`sha7` = `git rev-parse --short=7 HEAD`). 형식은 `<SKILL_DIR>/assets/report-template.md`. 제목의 일시는 `date +%Y-%m-%dT%H:%M:%S%z` 출력을 쓰고 짐작해서 적지 않는다. 헤더 `verdict` `commit`(전체 SHA) `tree`(세션 시작 직후, 리포트를 쓰기 전에 `git status --porcelain -- . ':(exclude)<report-dir>' ':(exclude).playwright-mcp'`가 비어 있으면 `clean`, `<report-dir>`은 저장소 기준 상대 경로, `.playwright-mcp/`는 Playwright MCP가 cwd에 만드는 산출물이라 뺀다) `type`(gate만) `inputs`(받은 `key=value` 인자를 그대로 적고 공백이 든 값은 큰따옴표로 묶는다. gate가 재사용 판정에 이 줄을 비교한다) `source`(style만) `mode`를 채운다. `findings.json`은 `{role, blocked[], findings[], notChecked[]}`이고 finding은 `{id, severity, status, title, where, expected?, actual?, note?}`다. severity는 `Critical|Major|Minor|nit`, status는 `open|waived`다.
3. **판정**: 직접 계산하지 않는다. `node <SKILL_DIR>/scripts/verdict.mjs <findings.json>`의 출력(`PASS`, `PASS WITH MINOR`, `FAIL`, `BLOCKED`)을 그대로 쓴다. 리포트의 `verdict`와 첫 줄은 이 출력과 같아야 한다.
4. **마커**: 마지막 **텍스트 메시지의 첫 줄**을 `QA: <verdict> <report-path>`로 시작한다(훅이 이 줄을 본다). `<report-path>`는 **저장소 루트 기준 상대 경로**다(기본값이면 `.orchestrator/qa/<role>-<sha7>.md`, 예: `QA: FAIL .orchestrator/qa/acceptance-dbca4ce.md`). 절대 경로를 쓰지 않는다. 보고용 도구로 결과를 넘기더라도 마지막 텍스트 메시지의 첫 줄은 이 줄이다. 그 아래에 요약과 finding 목록(severity·where)을 쓴다.
5. **쓰기 범위**: `report-dir` 안에만 쓴다. 소스·테스트 파일을 만들거나 고치지 않는다(수정 제안은 리포트의 `fix:`에 쓴다). 예외는 `.playwright-mcp/`다. Playwright MCP가 cwd에 만드는 산출물이라 지우지 않는다.
6. **`.gitignore`**: 수정하지 않는다. `.orchestrator/`나 `.playwright-mcp/`가 무시되지 않으면 `## Checked / Not checked`에 경고를 쓴다.
7. **모르는 키**는 무시하고 `Not checked`에 기록한다. 확인하지 못한 항목도 지어내지 말고 이유와 함께 `Not checked`에 쓴다.
8. **근거**: finding의 `where`는 실제로 존재하는 `path:line`·셀렉터·시나리오 id여야 하고, 쓰기 전에 다시 열어 확인한다.
