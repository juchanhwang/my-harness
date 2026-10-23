# QA 에이전트 역할 분리 설계

- 작성일: 2026-10-23
- 상태: 빌더 검토 반영 완료 (Q1~Q8 → D18~D27), 외부 출처 검증 반영 완료. **사용자 승인 대기**
- 대상: `my-harness` 저장소의 `agents/qa.md`, `skills/qa/`, 신규 `skills/qa-check/`, 관련 에이전트·훅·문서
- 적용 위치: 저장소에서 작업 → 브랜치/PR → 머지 후 `~/.claude/`로 수동 복사 (현재 동기화 스크립트 없음)

---

## 1. 의도와 이유

현재 QA는 `agents/qa.md` 하나가 한 세션 안에서 코드 리뷰·보안·접근성·E2E·테스트 전략·메트릭을 전부 수행한다. 한 세션에 검증 관점이 많아질수록 집중이 흩어지고 존재하지 않는 문제를 지적하는(할루시네이션) 확률이 올라간다 — 사람 QA가 한 번에 너무 많은 것을 보면 놓치는 것과 같은 원리다.

이 설계는 **에이전트 정의는 하나(`qa`)로 유지하고, 그 에이전트가 수행하는 일을 "역할(role)"로 나눈다.** 역할마다 별도 세션을 띄워 컨텍스트를 격리하고, 필요한 역할만 호출한다. 동시에 지금까지 없던 두 가지를 추가한다: (1) Figma 시안과 구현 CSS를 토큰 수준으로 대조하는 **style 역할**, (2) PRD 인수 조건에서 출발하는 **acceptance 역할**. 그리고 QA 호출 경로를 orchestrator 단일에서 **orchestrator + fe-dev + be-dev**로 넓힌다.

## 2. 목표 / 비목표 / 안티목표

**목표**
- G1. QA 세션 하나가 **하나의 역할**만 수행한다. 역할 = 입력 아티팩트·도구 세트·결과 소비자가 같은 묶음.
- G2. Figma 시안 ↔ 구현의 **토큰 값 오차 0** 검수 단계가 존재한다.
- G3. PRD 인수 조건 → 시나리오 → 실행의 **acceptance 역할**이 존재하며, PRD 없이는 시작하지 않는다.
- G4. fe-dev·be-dev가 구현 직후 **스스로 QA(pre-check)를 호출**하고, 호출 누락은 **훅이 차단**한다.
- G5. 모든 역할이 **같은 리포트 계약**을 따르고, gate 역할이 이를 종합해 PR 생성 가능 여부를 판정한다.
- G6. 역할 분리가 실제로 품질을 올리는지 **실측으로 확인**한 뒤 채택한다 (스파이크 + eval).

**비목표**
- 역할별로 다른 모델·도구 권한을 주는 것 (→ 별도 에이전트가 필요해지는 순간의 분리 기준으로만 남긴다, §9)
- PO/designer(PD)가 QA를 호출하는 경로 (사용자 결정: 넣지 않음. PD는 style 리포트의 "의도된 차이" 판정 리뷰어, PO는 acceptance 리포트 수신자)
- ATDD(구현 전 인수 테스트 작성) — 구현 완료 후 검증으로 확정 (사용자 결정)
- 스크린샷 픽셀 diff의 오차 0 — 폰트 렌더링 차이로 불가능. 스크린샷은 증거 첨부용
- `skills/qa/` 기존 25개 지식 파일의 내용 개편 (참조 구조만 바꾼다)

**안티목표 (이게 되면 실패)**
- 역할을 나눴는데 fe-dev가 QA 프롬프트를 자유 작성해서 자기 가정을 그대로 넘기는 것 → 진입점을 고정 템플릿(스킬)으로 강제한다
- 훅이 트리비얼 작업(파일 읽기만 한 fe-dev)까지 막아 작업 흐름을 깨는 것 → `QA: N/A — <이유>` 탈출구를 둔다
- gate가 pre-check와 같은 검증을 전부 다시 돌려 토큰이 2배가 되는 것 → commit SHA 일치 시 재실행 생략
- 5인 팀 구성(PO/PD/FE/BE/QA)이 바뀌는 것 → QA 팀원은 여전히 `qa` 하나

## 3. 제약 (플랫폼 사실)

출처는 모두 code.claude.com 공식 문서. `claude-code-guide` 에이전트의 WebFetch 요약 기준이며 원문 전체 대조는 하지 않았다.

| # | 사실 | 설계 영향 | 출처 |
|---|---|---|---|
| C1 | 서브에이전트는 서브에이전트를 부를 수 있다. 기본 깊이 3 (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`) | orch → fe-dev → qa 는 깊이 2. 여유 있음 | https://code.claude.com/docs/en/sub-agents |
| C2 | 서브에이전트 frontmatter `skills:`는 나열한 스킬 전체 내용을 시작 시 주입한다. **팀원으로 쓰일 때는 적용되지 않는다** | 팀 모드에서는 `Skill("qa")` 직접 호출 폴백 필수 (현재 qa.md에 이미 있음) | 같은 문서 + https://code.claude.com/docs/en/agent-teams |
| C3 | 팀원은 팀원을 만들 수 없다. 팀원끼리 `SendMessage` 가능. 팀원은 자기 서브에이전트를 부를 수 있다(foreground) | 팀 모드: FE 팀원 → QA 팀원 DM → QA 팀원이 `qa` 타입 서브에이전트를 역할별로 띄움 | https://code.claude.com/docs/en/agent-teams |
| C4 | `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`(현재 설정)이면 `name`을 붙여 부른 서브에이전트가 팀원으로 시작된다 | QA 역할 호출에서 `name` 사용 금지 | 같은 문서 |
| C5 | 스킬 frontmatter `context: fork` + `agent: <커스텀 서브에이전트명>`: 스킬 본문이 그 서브에이전트의 프롬프트가 되고 대화 기록은 보지 않는다. 모델·도구·권한은 에이전트 정의를 따른다 | `/qa-check` 진입점의 구현 메커니즘 | https://code.claude.com/docs/en/skills |
| C6 | 스킬 목록의 description + when_to_use 합계 1,536자에서 잘림. 서브에이전트 description 전체 예산 15,000 토큰 | 새 스킬은 1개(`qa-check`)만 추가. description 짧게 | 같은 문서 / sub-agents |
| C7 | `SubagentStop` 훅: matcher = 에이전트 타입명, exit 2 또는 JSON `decision: "block"`으로 종료 차단 + 사유 전달. 입력에 `agent_id`, `agent_type`, `last_assistant_message`. 서브에이전트 frontmatter의 `Stop` 훅은 `SubagentStop`으로 실행된다 | fe-dev/be-dev frontmatter에 훅을 두면 settings.json 수정 없이 subagent 모드 강제 가능 | https://code.claude.com/docs/en/hooks |
| C8 | `TeammateIdle` 훅: matcher 없음, exit 2로 계속 작업시킴. `TaskCreated`/`TaskCompleted` 훅: exit 2로 생성·완료 차단 가능 | 팀 모드 강제는 `TaskCompleted`로(D19 — `TeammateIdle`은 QA 회신 대기 중 오차단). settings.json 수정 필요(사용자 승인) | 같은 문서 |
| C9 | 훅은 셸 명령 — Agent 도구를 직접 부를 수 없다 | 훅은 "차단 + 사유"만. QA 호출 자체는 fe-dev/be-dev 본문 지시 | 같은 문서 |
| C10 | Figma MCP: 현재 계정은 개인 팀 View 시트(starter) + 회사 팀 Dev 시트(pro). `get_metadata`·`get_variable_defs`·`get_screenshot` 읽기 성공 확인(2026-10-23). 쓰기(`use_figma`)는 미확인(권한상 불가 추정) | style 역할은 읽기만 사용. fixture의 구현 쪽은 HTML로 직접 작성 | `whoami` 실측 |
| C11 | Figma MCP 레이트 리밋은 플랜·시트별. **View/Collab 시트 = 월 20회**(모든 플랜), Full/Dev 시트 = Pro 200/일 + 10/분. 읽기 도구에 적용, `whoami`는 면제. "Figma may change rate limits at any time." | 개인 drafts(View 시트)의 fixture를 매 eval마다 라이브로 읽으면 한 달 한도를 하루에 소진 → **eval은 Figma 스냅샷 파일**로 돈다(§6.3). 실제 운용은 회사 파일(Dev 시트 200/일) | https://developers.figma.com/docs/figma-mcp-server/rate-limits-access/ |
| C12 | `get_design_context`는 **코드 문자열**(기본 React + Tailwind, 프롬프트로 다른 프레임워크 요청 가능)과 자산 URL JSON을 반환한다. padding·radius 같은 필드 단위 구조화 값은 문서에 없다. `get_variable_defs`는 이름→값 맵("colors, spacing, and typography") | style 역할은 `get_design_context`에 **CSS 형식 출력**을 요청해 `padding: 16px`처럼 확정 숫자를 파싱한다(Tailwind 클래스는 프로젝트 테마에 따라 값이 달라 그대로 못 쓴다). **구현 스택과는 무관** — 구현이 Tailwind여도 비교 대상은 computed style(D27). 토큰 값은 `get_variable_defs`를 1차 소스로 | https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/ |
| C13 | `context: fork` 스킬은 **기본 백그라운드 실행**(v2.1.218+). 결과를 기다리려면 `background: false`. 백그라운드 fork는 좁은 도구 세트로 실행된다. `arguments:` 필드로 `$name` 치환 가능, `$ARGUMENTS`는 전체 | `/qa-check`는 `background: false` 필수(호출자가 리포트를 받아야 하고, style은 MCP 도구가 필요) | https://code.claude.com/docs/en/skills |
| C14 | `SubagentStop` stdin: `stop_hook_active`, `agent_id`, `agent_type`, `agent_transcript_path`, `last_assistant_message`. `decision: "block"` + `reason` → 서브에이전트가 계속 작업, 연속 continuation 상한 8회. v2.1.271+ `SubagentHandback`으로 보고하면 `last_assistant_message`에는 마지막 텍스트만 담김 | 무한 차단 방지는 `stop_hook_active`로. `QA:` 라인은 **마지막 텍스트 메시지**에 있어야 함 | https://code.claude.com/docs/en/hooks#subagentstop |
| C15 | `TeammateIdle` stdin: `teammate_name`, `agent_id`(v2.1.290+). **`last_assistant_message` 없음.** exit 2 → stderr가 피드백으로 전달되고 계속 작업. `{"continue": false, "stopReason"}`로 완전 중단 | 팀 모드 훅은 메시지를 볼 수 없으므로 **마커 파일**을 검사한다(§5.7) | https://code.claude.com/docs/en/hooks#teammateidle |
| C16 | Playwright `expect(locator).toHaveCSS(name, value)`: computed style 기준, `value`는 문자열 **완전 일치** 또는 RegExp. `locator.evaluate`로 `getComputedStyle` 호출은 두 API 조합(공식 레시피 아님). computed 색상은 `rgb()`로 나온다 | 정규화(§5.8 4항) 없이는 hex↔rgb 비교 불가 | https://playwright.dev/docs/api/class-locatorassertions#locator-assertions-to-have-css · https://playwright.dev/docs/api/class-locator#locator-evaluate |
| C17 | **effort**: 값 `low/medium/high/xhigh/max`. 생략 시 모델 기본값(5.5 세대 = `medium`, 그 외 `high`). 미지원 값은 그 이하 최고 레벨로 하향. 우선순위 `CLAUDE_CODE_EFFORT_LEVEL` env > Agent 호출 `effort` 파라미터(**fork 아닌 서브에이전트만**, v2.1.292+) > frontmatter `effort`. effort는 "adaptive reasoning"의 사고량 조절 — 높을수록 "tested more edge cases and verified more of its work", `max`는 "prone to overthinking, so test before adopting it broadly" | gate가 `Agent(qa, …)`로 역할을 띄울 때 **역할별 effort를 파라미터로** 줄 수 있다. 스킬 fork(pre-check) 경로는 파라미터 불가 → frontmatter/스킬 effort만 | https://code.claude.com/docs/en/model-config · https://code.claude.com/docs/en/sub-agents |
| C18 | **model** 우선순위: Agent 호출 `model` 파라미터 > frontmatter `model`(`inherit`=메인 모델) > `CLAUDE_CODE_SUBAGENT_MODEL` > 메인 세션 모델. `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1`이면 둘 다 무시. 공식 가이드: sonnet = "daily coding tasks", opus = "complex reasoning tasks"; "Reserve Opus for complex architectural decisions or multi-step reasoning", 팀원은 "Use Sonnet for teammates" | gate의 역할별 `model` 파라미터 지정 가능. 기본은 sonnet(D14) | https://code.claude.com/docs/en/sub-agents · https://code.claude.com/docs/en/costs |
| C19 | **토큰 측정**: 포그라운드 Agent 완료 시 PostToolUse `tool_response`의 `totalTokens`/`usage`는 **마지막 API 요청만** 포함("isn't a total across the whole run"). 백그라운드 완료 알림에는 usage 필드 미문서화. 실행 전체 롤업은 OpenTelemetry `claude_code.token.usage`/`claude_code.cost.usage`를 `query_source="subagent"`로 필터. 커스텀 에이전트 이름은 `agent.name`에 "custom"으로 뭉개지며 `OTEL_LOG_TOOL_DETAILS=1`일 때만 실제 이름. `resolvedModel`로 실제 실행 모델 확인 가능 | §6.1의 "태스크 알림 total_tokens 저장"은 **전체 비용이 아니다** → A/B 비용 비교는 OTel 또는 서브에이전트 트랜스크립트(`~/.claude/projects/{project}/{sessionId}/subagents/agent-{agentId}.jsonl`) 합산으로. 모델 A/B는 별칭(`sonnet`) 대신 **전체 모델 ID 고정** | https://code.claude.com/docs/en/hooks · https://code.claude.com/docs/en/monitoring-usage · https://code.claude.com/docs/en/costs |
| C20 | **같은 이름 우선순위가 에이전트와 스킬에서 반대**다. 에이전트: managed > `--agents` CLI > 프로젝트 `.claude/agents/` > 사용자 `~/.claude/agents/` > plugin. 스킬: "Enterprise over personal, and personal over project." | eval sandbox의 프로젝트 오버레이로 **새 `qa` 에이전트는 시험 가능**. 같은 이름의 `qa` 스킬은 개인 것이 이겨 사전 주입은 구버전 매핑 표가 된다 — 역할 문서가 지식 파일을 경로로 읽으므로 eval 동작에는 영향 없음. 새 스킬 이름(`qa-check`)은 겹치지 않는다 | https://code.claude.com/docs/en/sub-agents · https://code.claude.com/docs/en/skills |
| C21 | 스킬 본문 치환 변수: `$ARGUMENTS`, `$ARGUMENTS[N]`, `$N`, `$name`, `${CLAUDE_SESSION_ID}`, `${CLAUDE_EFFORT}`, `${CLAUDE_SKILL_DIR}`("The directory containing the skill's SKILL.md file"), `${CLAUDE_PROJECT_DIR}` 등. 적용 범위는 본문과 `allowed-tools`의 Bash 규칙. `context: fork` 서브에이전트는 "the skill content as its prompt"를 받으며 기본 디렉터리를 따로 받는다는 문구는 없다 | 역할 문서 경로는 `${CLAUDE_SKILL_DIR}/references/<role>.md`로 쓴다(치환 실동작은 스파이크 P2로 확인) | https://code.claude.com/docs/en/skills |
| C22 | headless: "User-invoked skills and custom commands work. Include `/skill-name` in the prompt string". `-p "/<skill>"`로 시작한 포크 스킬의 메시지에는 `forked-command-` 값이 붙는다 | eval은 `claude -p "/qa-check …"`로 진입점을 그대로 시험한다 | https://code.claude.com/docs/en/headless |
| C23 | 결과 JSON(SDK 결과 메시지): `session_id`, `duration_ms`, `num_turns`, `total_cost_usd`, `usage`, `modelUsage`, `permission_denials`, `result` 등. `total_cost_usd`·`modelUsage`는 서브에이전트 포함, `usage`는 최상위 루프만. 비용은 "client-side estimates, not authoritative billing data". CLI JSON이 이 객체와 같다는 명시와 포크 스킬 포함 여부는 미확인(U10) | 비용 비교는 `total_cost_usd`(추정치임을 명시), 권한 거부는 `permission_denials`로 기록 | https://code.claude.com/docs/en/agent-sdk/cost-tracking · https://code.claude.com/docs/en/agent-sdk/typescript |
| C24 | 프로젝트 에이전트의 frontmatter 훅은 "run only after you accept the workspace trust dialog" — `-p`에는 신뢰 대화상자가 없다. `~/.claude/agents/`와 `--agents`의 훅은 이 단계가 필요 없다. 설정 간 훅은 덮어쓰지 않고 병합되며 같은 핸들러는 한 번만 실행된다. `disableAllHooks`가 frontmatter 훅까지 끄는지는 문서에 없다 | sandbox는 신뢰된 `/Users/JuChan` 아래(`~/.qa-check-sandboxes/`)에 둔다. 신뢰 상속이 안 되면 훅 시험은 `--settings`의 `SubagentStop` matcher로 대체(스파이크 P6). 배포 후 사용자 레벨 fe-dev는 신뢰 단계가 필요 없다 | https://code.claude.com/docs/en/hooks |
| C25 | `~/.claude/agents/`·`.claude/agents/`·스킬 디렉터리는 변경을 감시해 재시작 없이 반영한다(새 최상위 디렉터리 제외) | headless eval은 실행마다 새 프로세스라 실행 사이의 수정이 바로 반영된다 | https://code.claude.com/docs/en/sub-agents · https://code.claude.com/docs/en/skills |
| C26 | (로컬 사실, 2026-10-24) 라이브 settings에 `Read(*)`·`Glob(*)`·`Grep(*)` 허용 규칙, `defaultMode: auto`. `/Users/JuChan`은 신뢰 상태. PyYAML 미설치 | 배포 후 포크가 `~/.claude/skills/qa-check/references/`를 읽어도 권한 프롬프트가 뜨지 않는다. eval 도구에 YAML 파서를 쓰지 않는다 | `~/.claude/settings.json`, `~/.claude.json` |

**UNVERIFIED (스파이크에서 확인)**
- U1. 서브에이전트(fe-dev) 안에서 `Skill` 도구로 `context: fork` 스킬을 호출했을 때 실제로 `qa` 포크가 뜨는지. 안 되면 폴백: `Agent(subagent_type="qa", prompt="references/<role>.md를 Read하고 …")`.
- U2. `context: fork` + `agent: qa`로 뜬 세션에 qa.md의 `skills: [qa]` 사전 주입이 적용되는지.
- ~~U3~~ → C14·C15로 해소. `TeammateIdle`은 D19로 사용하지 않음. `TaskCompleted` 스키마는 U8.
- U4. 팀원이 `name` 없이 `Agent(subagent_type="qa")`를 부를 때 팀원 승격 없이 서브에이전트로 뜨는지.
- U5. 서브에이전트 frontmatter `hooks:`가 팀원으로 쓰일 때도 적용되는지.
- U6. 개인 drafts 파일의 레이트 리밋이 개인 팀(View) 기준인지 — `whoami`의 두 플랜 중 어느 쪽이 적용되는지 문서에 없음. 안전하게 View(월 20회)로 가정.
- U7. 팀원(QA) 안에서 `Skill` 도구로 `context: fork` 스킬을 호출했을 때 포크가 뜨는지 (U1의 팀 모드 버전). 폴백은 D21.
- U8. `TaskCompleted` 훅 stdin 스키마 — 완료 주체(팀원 이름/agent_id)와 task owner가 들어 있는지. 없으면 §5.7 폴백.
- U9. `context: fork` + `agent: qa`에서 **스킬 frontmatter `model`/`effort`가 에이전트 정의를 덮어쓰는지** — 문서가 상충한다(`agent` 행: "모델·도구·권한은 에이전트 정의를 따른다" vs `model` 행: "With `context: fork`, the value sets the forked subagent's model instead"). 실험으로 확정. 결과가 "덮어쓴다"면 역할별 모델/effort는 **진입점 스킬을 역할별로 분리**(`/qa-review` 등, 에이전트는 그대로 하나)해서 줄 수 있다.
- U10. 결과 JSON `total_cost_usd`가 **포크 스킬** 비용까지 포함하는지(서브에이전트 포함은 C23으로 확인). 서브에이전트가 세션 effort를 상속하는지도 미명시.
- U11. 신뢰된 부모(`/Users/JuChan`) 아래 하위 디렉터리에서 프로젝트 에이전트 frontmatter 훅이 `-p`로 실행되는지(C24).

## 4. 결정 사항

"사용자" = 대화에서 사용자가 직접 정함. "기본값" = 내가 정했고 사용자에게 제시해 이의 없음.

| # | 결정 | 누가 |
|---|---|---|
| D1 | 에이전트 정의는 `qa.md` **하나**. 역할은 파일로 나누고, 같은 에이전트를 역할별 세션으로 띄운다 | 사용자 |
| D2 | 역할 4개: `review`, `style`, `acceptance`, `gate`. 역할 없이 `qa`를 부르면 기존처럼 테스트 전략·메트릭·회귀 전략·버그 트리아지·프로세스 개선을 수행 | 기본값 |
| D3 | QA 호출자는 **orchestrator / fe-dev / be-dev**. PO·designer는 호출하지 않음 | 사용자 |
| D4 | acceptance는 **구현 완료 후** 수행. **PRD가 필수 입력** — 없으면 시작하지 않고 사용자에게 요청. 세션 안 순서: PRD 읽기 → 시나리오 확정 → 그 다음 코드/diff 읽기 (시나리오 확정 전 코드 Read 금지) | 사용자 |
| D5 | style의 기준 소스 우선순위: **Figma 노드 URL → 없으면 사용자에게 요청 → Figma 자체가 없으면 `docs/mockup.html`** | 사용자 |
| D6 | style 검수는 **토큰 레벨, 오차 0**. 대상: fill/stroke 색상(hex), padding/gap(px), border-radius, font-family/size/weight/line-height/letter-spacing. 단위 정규화(rem→px, % letter-spacing→px) 후 정확 일치. 불일치는 전부 finding. "의도된 차이" 판정은 designer. 스크린샷은 증거 첨부용이며 픽셀 diff에는 오차 0을 적용하지 않음 | 사용자(오차 0) + 기본값(적용 범위) |
| D7 | PR 유형별 필수 역할: **FE PR = review + style + acceptance / BE PR = review + acceptance(API 계약) / 설정·문서 PR = review만** | 사용자 |
| D8 | **훅으로 강제**: fe-dev/be-dev가 마지막 메시지에 `QA:` 라인 없이 종료하면 차단. 트리비얼 작업은 `QA: N/A — <이유>`로 통과 | 사용자 |
| D9 | pre-check vs gate: fe/be가 부른 역할 세션 = **pre-check(승인 권한 없음)**. orch/팀 리드가 부른 `gate` = PR 생성 승인. gate는 pre-check 리포트의 commit SHA가 현재 HEAD와 같으면 해당 역할 재실행 생략 | 기본값 |
| D10 | 진입점은 스킬 커맨드 **`/qa-check <role> key=value …`** 하나 (`context: fork`, `agent: qa`). orch·fe·be 모두 같은 진입점. `name` 미사용 | 기본값 |
| D11 | 리포트 계약: 판정 `PASS / PASS WITH MINOR / FAIL`, severity `Critical / Major / Minor / nit`. Critical·Major 1건 이상 → FAIL. Minor만 → PASS WITH MINOR. 없음 또는 nit만 → PASS. Critical·Major 무조건 픽스, Minor 픽스 권장, nit 스킵 가능(리포트에 명시) | 기본값 (기존 메모리 규칙 승계) |
| D12 | 실행 환경: **호출자가 dev server를 띄우고 URL·로그인 방법·시드 상태를 넘긴다.** QA는 서버를 띄우지 않는다 | 기본값 |
| D13 | 스킬 구조: `skills/qa/` 25파일은 지식 라이브러리로 유지 + 신규 `figma-style-audit.md` 1개. 역할 워크플로우는 `skills/qa-check/references/*.md` | 기본값 |
| D14 | 모델·effort: `qa`는 **sonnet 유지, frontmatter `effort: xhigh`**(사용자 결정 2026-10-23). 미지원 모델에서는 그 이하 최고 레벨로 자동 하향(C17)되므로 안전. frontmatter 값은 fork·Agent 두 경로 모두에 기본 적용되고, gate가 Agent 파라미터로 역할별 재지정 가능(파라미터 > frontmatter). xhigh의 overthinking 여부는 §6의 토큰·시간 측정으로 확인. 보안·동시성은 기존 Oracle(opus, `effort: max`) 에스컬레이션 유지. **승격은 측정 기반**: §6.2/§6.4에서 (a) 거짓 finding run당 ≥1 반복, (b) fixture 누락 2회 연속, (c) PRD 조건 누락·오해석, (d) gate 집계 오류, (e) run 간 결론 분산(→ 먼저 스킬 문구 의심) 중 하나가 관찰된 **역할에 한해** 1차 레버 = `effort: high`(gate 경로는 Agent 파라미터, pre-check 경로는 스킬/frontmatter — U9), 2차 = opus A/B(같은 eval·같은 횟수·전체 모델 ID 고정·`resolvedModel` 확인). `max`는 공식 문서의 overthinking 경고로 Oracle 외 사용 안 함. 전면 opus 승격은 측정 없이 하지 않는다 | 기본값 + 사용자 질의 반영 |
| D15 | 검증: writing-skills 원칙대로 **베이스라인(현재 단일 qa) 먼저 측정**. 역할당 eval 프롬프트 2~3개, 스파이크 1회. 전면 벤치마크 안 함 | 기본값 |
| D16 | 검증 대상: **정량 측정 = 정답을 심은 fixture 앱**(`evals/files/app/` + 미니 PRD + Material 3 노드 스냅샷 — review·style·acceptance 결함과 함정을 알고 있어 재현율·오탐을 숫자로 잰다). **실전 확인 = <private-repo> PR #65** (BE, squash 커밋 `4b9b2b6b`, 19 files +973/−17) — review 역할만. acceptance 실전은 NestJS 서버·DB 기동이 필요해 제외. <private-repo>는 private이라 #65 관련 산출물은 커밋하지 않고 수치만 기록. React/Next 실전 스모크는 회사 FE 저장소에 화면이 생기면 후속 | 사용자 + 기본값 (2026-10-24 실행 환경 확인 후 정정) |
| D17 | `~/.claude/CLAUDE.md`·`settings.json`·메모리 파일 변경은 **변경안을 보여주고 승인 후** 수정 | 기본값 (사용자 파일 무단 수정 금지 규칙) |
| D18 | 판정에 4번째 상태 **`BLOCKED`** 추가: 필수 입력 누락(PRD·Figma URL·`app` 다운 등)으로 검증을 시작/완료하지 못한 경우. 코드 결함이 아님을 명시하고 "필요한 것" 목록을 리포트에 쓴다. gate는 역할 중 하나라도 BLOCKED면 BLOCKED(FAIL 아님) | 기본값 (빌더 검토 Q1) |
| D19 | 팀 모드 강제는 `TeammateIdle`이 아니라 **`TaskCompleted`** 훅으로 한다 — idle은 QA 회신 대기마다 발생해 오차단이 필수적으로 생기고, 그 압력이 "QA 라인 지어내기"(안티목표)를 유발한다. 완료 선언 시점(TaskUpdate completed)에만 마커 파일을 검사한다. 입력 스키마 UNVERIFIED(U8) → 로깅 선행 | 기본값 (빌더 검토 Q2) |
| D20 | 다중 컴포넌트 style 검수는 **매니페스트 파일**(`targets=<json>`: `[{figma, selector, viewport?, mockup-selector?}]`)로 짝짓는다. 단일 대상은 기존 `figma=`/`selector=` 키. 노드 수 상한 기본 5(R3) | 기본값 (빌더 검토 Q5) |
| D21 | 팀 모드 QA 팀원도 **같은 진입점** `Skill("qa-check", "<role> …")`을 쓴다(D10 일관). 팀원 내 fork 불가 시 폴백 = `Agent(subagent_type="qa", prompt="references/<role>.md Read…")`. gate의 병렬 호출은 gate **역할 세션 안**에서 일어나므로 QA 팀원 세션에 gate 관점이 섞이지 않는다 | 기본값 (빌더 검토 Q6) |
| D22 | gate의 pre-check 재사용(D9)은 **clean tree에서 생성된 리포트만**. 리포트 헤더에 `tree: clean | dirty`를 기록하고 dirty 리포트는 재사용하지 않는다. 테스트 파일만 바뀐 경우의 예외는 빌더가 `git diff --stat` 경로 필터로 추가해도 된다 | 기본값 (빌더 검토 Q7) |
| D23 | `mockup=` 경로(D5)의 비교는 **양방향 Playwright 추출**: mockup HTML을 로컬 서빙해 `mockup-selector=`(기본값 `selector=`와 동일)로 computed style을 뽑고, 앱 쪽과 같은 속성표로 비교. eval에 mockup 경로 1세트 추가(§6.4 style (d)) | 기본값 (빌더 검토 Q8) |
| D24 | style Major finding의 "의도된 차이"는 **waiver 파일**로 처리. designer가 `<report-dir>/style-waivers.json`에 `{selector, property, figma, actual, reason, by, date}`를 기록 → style 역할이 일치하는 finding을 `WAIVED`로 표시하고 verdict 집계에서 제외(리포트에는 남김). designer 판정은 waiver 외의 방법으로 verdict를 바꾸지 못한다 | 사용자 (빌더 검토 Q3) |
| D25 | acceptance는 **테스트 코드 파일을 남기지 않는다.** 세션 안에서 시나리오를 실행(Playwright MCP / API 호출)하고 결과만 리포트. 회귀 가치가 있는 시나리오는 리포트 `## E2E candidates`에 **제안**만 하고, 테스트 코드 작성·커밋은 fe-dev/be-dev 소유(PR 분리 원칙 변경 없음) | 사용자 (빌더 검토 Q4) |
| D26 | 인수 검증(acceptance)은 `qa` 역할이 수행한다 — 업계 표준 근거가 아니라 **이 하네스의 규칙**(R7). fe/be는 단위·통합·E2E 코드를 계속 소유 | 사용자 |
| D27 | Figma 값 추출 시 `get_design_context`에 CSS 형식 출력을 요청하는 것은 **값을 숫자로 확정하기 위한 추출 형식**이며 구현 스택을 제한하지 않는다. 구현이 Tailwind든 CSS 파일이든 비교 대상은 브라우저의 computed style | 사용자 확인 |

## 5. 아키텍처

### 5.1 파일 레이아웃

```
agents/
  qa.md                        ← 수정: 역할 모델 + 공통 계약. DoD 9항목은 역할 파일로 이동
  fe-dev.md, be-dev.md         ← 수정: 팀 작업 규칙에 pre-check 호출 + QA 라인 + frontmatter hooks(Stop)
  orchestrator.md              ← 수정: QA 위임을 /qa-check gate 로. 트리거 테이블 문구
  designer.md                  ← 수정(1줄): style 리포트의 "의도된 차이" 판정 역할
skills/
  qa/                          ← 지식 라이브러리 (기존 패턴 유지: SKILL.md + 평평한 참조 파일)
    SKILL.md                   ← 수정: 역할→지식 파일 매핑 추가, qa-check 참조
    figma-style-audit.md       ← 신규 지식 파일
    (기존 25파일 유지)
  qa-check/                    ← 진입점 스킬. 폴더명은 skill-creator 표준 anatomy(scripts/ references/ assets/) 를 따른다
    SKILL.md                   ← 신규 (context: fork, agent: qa, background: false). fork 프롬프트이므로 자립적이어야 함
    references/                ← 역할별 워크플로우 = "variant" 조직 (skill-creator: 변형이 여럿이면 references/<variant>.md)
      review.md
      style.md
      acceptance.md
      gate.md
    scripts/                   ← 결정적(deterministic) 단계는 코드로. 로드하지 않고 실행만 하므로 컨텍스트 비용 0
      compare-styles.mjs       ← 정규화(rem→px, rgb→hex, % tracking→px) + 속성별 비교 + severity → findings JSON
      verdict.mjs              ← findings JSON(+waivers) → PASS/PASS WITH MINOR/FAIL/BLOCKED
      computed-style.snippet.js← Playwright browser_evaluate 에 넘기는 추출 함수 (속성표 고정)
    assets/                    ← 출력에 쓰는 템플릿
      report-template.md       ← §5.5 리포트 계약
      style-waivers.example.json
      targets.example.json
    evals/                     ← skill-creator 스키마. package_skill.py 가 루트 evals/ 는 패키징에서 제외
      evals.json
      files/                   ← evals[].files 가 가리키는 입력 (스키마의 "evals/files/…" 관례)
        button-medium.html     ← 편차 5개 심은 fixture
        figma-snapshot.json    ← 빌더가 1회 읽은 Figma 원본 출력 (C11 레이트 리밋 회피)
        expected.json          ← 정답표 (어떤 속성이 어떻게 틀렸는지)
hooks/
  qa-gate-subagent-stop.sh     ← 신규 (fe-dev/be-dev frontmatter hooks에서 참조)
  qa-gate-task-completed.sh    ← 신규 (settings.json TaskCompleted — 승인 후, D19)
docs/specs/
  2026-10-23-qa-roles-design.md ← 이 문서
```

### 5.2 `agents/qa.md` — 남는 것과 바뀌는 것

**유지**: Core Identity, 핵심 원칙, vercel 스킬 매핑, Oracle 자문 기준, Sub-agent 호출 프로토콜(인라인 컨텍스트 블록), 플랜 모드 워크플로우, `Skill("qa")` 폴백.

**추가 — 역할 모델 섹션**
- "나는 역할 없이 호출되면 QA 리드다(전략·메트릭·회귀·트리아지·프로세스). `/qa-check <role>`로 호출되면 그 역할 **하나만** 수행하고 다른 역할의 관점은 리포트에 섞지 않는다."
- 역할 요약표 (입력 / 필수 전제 / 읽을 지식 / 출력) — 상세는 `skills/qa-check/references/*.md`
- 공통 계약: 리포트 포맷(§5.5), 필수 입력 누락 시 행동(중단 + 요청, 추측 금지), pre-check/gate 권한(§5.6)

**제거**: Definition of Done 9항목 → 역할 파일별 DoD로 분배. "테스트 계획 작성" 항목은 acceptance 역할과 리드 역할에만 남긴다.

### 5.3 `skills/qa-check/SKILL.md` — 진입점

frontmatter (필드명은 C5 기준, 정확한 `arguments` 전달 문법은 빌더가 공식 문서로 확인):

```yaml
---
name: qa-check
description: Use when a QA role must run in its own session — code review of a diff, Figma-vs-implementation style audit, PRD acceptance verification, or the PR gate that merges them. Invoked as /qa-check <role> key=value...
context: fork
agent: qa
background: false          # C13: 기본값은 백그라운드. 호출자가 리포트를 받아야 하므로 동기 실행
arguments: role            # C13: 첫 토큰이 $role 로 치환됨. 나머지는 $ARGUMENTS 에서 파싱
argument-hint: "<review|style|acceptance|gate> key=value ..."
user-invocable: true
---
```

본문 책임:
1. `$role`을 역할로 사용. 미지정/오타 → 네 역할을 나열하고 중단. 나머지 `key=value`는 `$ARGUMENTS`에서 파싱.
2. `references/<role>.md`를 Read하고 그 절차를 따른다. 다른 역할 파일은 읽지 않는다.
3. 입력 키 계약 (역할 파일이 소비):

| 키 | 의미 | 사용 역할 |
|---|---|---|
| `scope=` | git 범위(`main..HEAD`) 또는 경로 목록 | review, gate |
| `prd=` | PRD 파일 경로 | acceptance(필수), gate(FE/BE) |
| `figma=` | Figma 노드 URL (`node-id` 포함 필수) | style(1순위), gate(FE) |
| `figma-snapshot=` | 사전 추출한 Figma 값 JSON 경로. 지정 시 Figma MCP를 호출하지 않음 (**eval·fixture 전용**, C11 레이트 리밋 회피). 운용에서는 사용 금지 — 리포트에 `source: snapshot` 명시 | style |
| `mockup=` | `docs/mockup.html` 경로 (figma 부재 시) | style, gate(FE) |
| `mockup-selector=` | mockup HTML 안의 비교 대상 셀렉터 (기본값 = `selector=`) | style |
| `targets=` | 다중 대상 매니페스트 JSON 경로 `[{figma, selector, viewport?, mockup-selector?}]` (D20). 지정 시 `figma=`/`selector=` 무시 | style, gate(FE) |
| `app=` | 실행 중인 앱 URL | style(필수), acceptance(필수), gate |
| `selector=` | 비교 대상 DOM 셀렉터 (단일 대상용) | style |
| `auth=` | 로그인 방법/계정 메모 또는 파일 경로 | style, acceptance |
| `waivers=` | designer가 승인한 차이 목록 JSON (기본 `<report-dir>/style-waivers.json`, D24). 없으면 waiver 0건으로 진행 | style, gate(FE) |
| `type=` | `fe` / `be` / `config` | gate(필수) |
| `report-dir=` | 리포트 저장 디렉터리 (기본 `.orchestrator/qa/`) | 전체 |

4. 종료 시 **마지막 메시지 첫 줄**을 `QA: <verdict> <report-path>`로 끝낸다 (훅이 이 라인을 본다).

### 5.4 역할 파일 — 각 역할의 계약

공통 구조: `## 입력` / `## 시작 전 확인 (없으면 중단·요청)` / `## 읽을 지식 파일` / `## 절차` / `## 이 역할이 하지 않는 것` / `## DoD`

**`references/review.md`**
- 입력: `scope` (필수). `prd` 선택(있으면 요구사항 대비 누락 확인에만 사용).
- 도구: Read, Grep, Glob, Bash(`git diff`, typecheck/lint/test 실행). 브라우저·Figma 도구 사용 안 함.
- 지식: `code-review.md` + `type-safety.md` + `static-analysis.md` + `security-testing.md`. React/Next 변경이 포함되면 `vercel:react-best-practices` 병행.
- 절차: diff 범위 확정 → 변경 파일 Read → 체크리스트(보안·성능·엣지·타입·테스트 존재) → typecheck/lint/test 실행 결과 첨부 → 리포트.
- 하지 않는 것: 스타일 대조, 인수 시나리오 작성, 리팩토링 제안(코드 품질 관점은 `fe` 스킬 `code-review.md` 소관 — 중복 금지).
- 보안·동시성 finding은 Oracle 자문 후 확정 (기존 규칙).

**`references/style.md`**
- 입력: `figma` 또는 `mockup` 중 하나, `app`, `selector`(1개 이상), `auth` 선택.
- 시작 전 확인: `figma`도 `mockup`도 없으면 **중단하고 Figma 노드 URL을 사용자에게 요청**(D5). `app` 응답 없음 → 중단, 호출자에게 서버 기동 요청(D12).
- 도구: Figma MCP(`create_session` → `get_variable_defs`(1차: 이름→값 맵), `get_design_context`(2차: **plain CSS 출력을 프롬프트로 요청**해 padding·radius 등 파싱, C12), `get_screenshot`; `get_design_context` 전 `figma:figma-design-to-code` 스킬 로드 필수), Playwright MCP(`browser_navigate`, `browser_evaluate`로 `getComputedStyle`, `browser_take_screenshot`). 쓰기 도구(`use_figma`) 사용 금지. Figma 호출은 노드당 1세션에서 **최소 횟수**(C11) — 같은 노드를 두 번 읽지 않고 추출 결과를 리포트 옆 `figma-values-<node>.json`에 저장한다. `figma-snapshot=`이 주어지면 Figma MCP를 호출하지 않는다.
- 지식: `figma-style-audit.md`(신규) + `visual-testing.md`(스크린샷 증거 규칙만) + `accessibility-testing.md`(색상 대비는 보고만, 판정 아님).
- 절차: 대상 목록 확정(`targets=` 매니페스트 또는 단일 키, D20) → 대상별로 디자인 값 추출(Figma: `get_variable_defs` + `get_design_context` CSS 형식 요청 후 파싱 / mockup: 로컬 서빙 후 `mockup-selector=`로 computed style 추출, D23) → 구현 computed style 추출(동일 속성표; Tailwind·CSS 등 구현 방식 무관, D27) → 단위 정규화 → 속성별 비교 → 불일치 = finding(severity: 색상·타이포 = Major, 간격·radius = Minor; 빌더가 `figma-style-audit.md`에 기준표 작성) → **waiver 적용(D24)**: `waivers=` 파일의 항목과 `{selector, property, figma, actual}`이 모두 일치하는 finding은 `WAIVED`로 표시하고 verdict 집계에서 제외, `reason`·`by`를 finding에 병기. 부분 일치(값이 다른 경우)는 waiver 미적용 + "waiver 갱신 필요" 메모 → 스크린샷 2장(디자인/구현) 첨부 → 리포트. 반응형은 대상별로 데스크톱 1 + 모바일 1 뷰포트 (기본값 1280 / 375, 매니페스트 `viewport`로 조정).
- waiver 파일은 **읽기만** 한다. 작성·수정은 designer의 몫(§5.9).
- 대상 노드가 5개를 넘으면(R3) 중단하지 않고 **사용자에게 우선순위를 묻는다** → 답이 없으면 BLOCKED.
- 하지 않는 것: 코드 수정 제안 외의 리팩토링, "의도된 차이" 판정(designer 소관), 픽셀 diff 판정.

**`references/acceptance.md`**
- 입력: `prd`(필수), `app`(필수), `auth` 선택, `scope` 선택.
- 시작 전 확인: `prd` 없으면 **중단하고 PRD를 사용자에게 요청**. PRD에 인수 조건(acceptance criteria / 완료 조건) 섹션이 없으면 중단하고 PO 산출물 보완 요청.
- **순서 강제(D4)**: ① PRD의 인수 조건을 Given/When/Then 시나리오로 확정하고 리포트 초안에 먼저 기록 → ② 그 다음에만 코드·diff·`app` 접근. 시나리오 확정 전 소스 Read 금지(코드가 기준을 오염시키는 것을 막는다).
- 도구: Read, Playwright MCP(시나리오 실행·스크린샷), Bash(기존 E2E 실행, API 호출). **코드·테스트 파일 Write 금지**(D25) — 리포트와 스크린샷만 생성.
- 지식: `test-design.md` + `e2e-testing.md` + `test-planning.md`(범위 템플릿). BE 인수(API 계약)는 `api-testing.md`.
- 절차: 시나리오 확정(인수 조건 1개 = 시나리오 1~2개 상한) → 각 시나리오를 `app`에서 실행(브라우저) 또는 API 호출 → 통과/실패/차단(환경) 기록 + 실패 시 스크린샷·응답 첨부 → 프로젝트에 기존 E2E가 있으면 실행 결과 첨부 → 리포트. 리포트 `## E2E candidates`에 "회귀 가치가 있어 테스트 코드로 굳힐 만한 시나리오"를 **제안**한다(작성은 fe-dev/be-dev).
- 하지 않는 것: 테스트 코드 작성(단위·통합·E2E 모두 fe/be 소관), 코드 리뷰 관점 지적.

**`references/gate.md`**
- 입력: `type`(필수), 그 외 역할 입력 전달용 키.
- 절차: ① `type`으로 필수 역할 집합 결정(D7) → ② `report-dir`에서 각 역할의 최신 리포트를 찾고 `commit:`이 현재 HEAD와 같고 **`tree: clean`**이면 재사용(D22), 아니면 해당 역할을 `Agent(subagent_type="qa", prompt="…references/<role>.md…")`로 **병렬** 실행(`name` 금지, C4) → ③ 리포트 종합: 하나라도 BLOCKED → **BLOCKED**(필요한 것 목록 병합); 하나라도 FAIL → FAIL; 모두 PASS → PASS; 그 외 PASS WITH MINOR → ④ 종합 리포트 + `QA: <verdict> <path>`.
- gate 자체는 clean tree에서만 실행한다. dirty면 BLOCKED("커밋 또는 stash 후 재요청").
- gate만이 "PR 생성 가능"을 말할 수 있다(D9).
- 하지 않는 것: 직접 검증(역할 세션에 맡긴다), 다른 역할의 finding 재해석.

### 5.5 리포트 계약

저장: `<report-dir>/<role>-<sha7>.md` (기본 `.orchestrator/qa/`, 기존 `.orchestrator/plans/` 관례 승계). 빌더는 대상 프로젝트의 `.gitignore`에 `.orchestrator/`가 있는지 확인하고, 없으면 리포트에 "커밋 대상 아님" 안내를 넣는다.

```markdown
# QA Report — <role> — <ISO datetime>
verdict: PASS | PASS WITH MINOR | FAIL | BLOCKED
commit: <sha>
tree: clean | dirty               # D22 — dirty 리포트는 gate가 재사용하지 않음
type: fe | be | config            # gate만
inputs: scope=… prd=… figma=… app=…
source: live | snapshot           # style만 — snapshot은 eval 전용
mode: pre-check | gate

## Blocked by                      # verdict=BLOCKED 일 때만. 코드 결함 아님
- 필요한 것: <PRD 경로 | Figma 노드 URL | app 기동 | …>

## Findings
### [C-1] Critical — <제목>
- where: <path:line> | <selector> | <scenario id>
- expected: …                      # PRD/Figma/체크리스트 기준
- actual: …
- repro: …
- evidence: <스크린샷/로그/명령 출력 경로>
- fix: <구체적 수정 제안>
### [M-1] Major — …
### [m-1] Minor — …
### [n-1] nit — …
### [W-1] WAIVED (원 severity Major) — …   # style만, D24. waiver의 reason/by/date 병기. 집계 제외

## E2E candidates                  # acceptance만, D25. 제안이며 QA가 작성하지 않음
- <시나리오 id> — 이유(회귀 위험·빈도)

## Checked / Not checked
- checked: …
- not checked (이유): …           # 환경 차단, 범위 밖 등

## Decision rule applied
Critical+Major = N → verdict …
```

판정 규칙(공통): 필수 입력 누락·환경 차단으로 검증 미완 → **BLOCKED**(D18, 다른 finding보다 우선). `WAIVED` finding은 집계에서 제외(D24). Critical·Major ≥ 1 → FAIL. Minor만 → PASS WITH MINOR. 없음 또는 nit만 → PASS.

severity 기준(공통): Critical = 보안·데이터 손상·인수 조건 실패로 기능 불가 / Major = 인수 조건 부분 실패, 토큰 불일치(색상·타이포), 테스트 누락으로 회귀 위험 / Minor = 간격·radius 불일치, 엣지 케이스 누락, 커버리지 저하 / nit = 스타일·명명. 역할 파일이 자기 도메인의 예시를 덧붙인다.

### 5.6 호출 경로

**subagent 모드 (orchestrator 메인 세션)**
```
orchestrator ─Agent→ fe-dev ─Skill("qa-check", "review scope=main..HEAD")→ qa(review)   # pre-check
                      └─Skill("qa-check", "style figma=… app=… selector=…")→ qa(style)   # pre-check
orchestrator ─Skill("qa-check", "gate type=fe scope=… figma=… prd=… app=…")→ qa(gate)
                                                                └─Agent(qa)×역할 병렬
```
U1이 실패하면 fe-dev는 `Agent(subagent_type="qa", prompt="~/.claude/skills/qa-check/references/review.md를 Read하고 그 절차대로 … 입력: scope=…")`로 호출. 입력 키 계약은 동일.

**팀 모드 (5인 팀)**
```
FE 팀원 ─SendMessage(QA, "/qa-check review scope=…")→ QA 팀원(qa) ─Skill("qa-check","review scope=…")→ qa(review) 포크 → 리포트 → DM 회신
팀 리드 ─SendMessage(QA, "/qa-check gate type=fe …")→ QA 팀원 ─Skill("qa-check","gate …")→ qa(gate) 포크 ─Agent(qa)×역할 병렬→ 종합 → 회신
```
QA 팀원은 요청을 **그대로 같은 진입점에 전달**한다(D21) — 자기 세션에서 검증하지 않는다. QA 팀원은 `skills:` 주입이 없으므로(C2) 시작 시 `Skill("qa")`를 직접 호출한다(기존 폴백). 역할 세션은 서브에이전트라 `skills: [qa]`가 적용될 것으로 기대하지만 U2 확인 필요. 팀원 안에서 `context: fork` 스킬이 동작하는지는 U7.

**fe-dev / be-dev 본문 추가 (팀 작업 규칙)**
- 구현을 마치면 PR 유형에 맞는 pre-check 역할을 호출한다(D7). FE: review + style(+ acceptance는 gate에 맡겨도 됨 — 빌더 결정) / BE: review.
- pre-check FAIL → 수정 → 같은 역할 재호출. PASS/PASS WITH MINOR → 팀 리드(또는 orchestrator)에 gate 요청.
- **마지막 메시지 첫 줄**: `QA: <verdict> <report-path>` 또는 `QA: N/A — <이유>`(코드 변경이 없는 작업만).
- QA 리포트의 finding은 자기 판단으로 무시하지 않는다. nit 스킵은 리포트에 사유를 남긴다.

### 5.7 훅 — 누락 차단

**공통 — QA 마커 두 곳에 남긴다.** fe-dev/be-dev는 종료 전 (a) 마지막 텍스트 메시지 첫 줄에 `QA: <verdict> <report-path>` 또는 `QA: N/A — <이유>`를 쓰고, (b) 같은 한 줄을 `<report-dir>/status-<agent-or-teammate-name>.txt`에 기록한다. subagent 모드 훅은 (a)를, 팀 모드 훅은 (b)를 본다(C15 — `TeammateIdle`에는 메시지가 없다). verdict 정규식은 `BLOCKED`를 포함한다(D18).

**`hooks/qa-gate-subagent-stop.sh`** (fe-dev.md, be-dev.md frontmatter `hooks:`의 `Stop`에 등록 → `SubagentStop`으로 실행, C7)
1. stdin JSON 읽기(필드: C14). 첫 구현 단계에서는 **페이로드 전체를 `~/.claude/logs/qa-gate/<ts>.json`에 저장**하고 exit 0 — 문서와 실제 필드가 같은지 1회 확인 후 차단 로직 활성화.
2. `stop_hook_active == true`면 exit 0 (이미 한 번 차단됨 → 재차단 금지, C14).
3. `last_assistant_message`에 `^QA: (PASS|PASS WITH MINOR|FAIL|BLOCKED|N\/A)` 패턴이 있으면 exit 0.
4. 없으면 `{"decision":"block","reason":"QA 라인 누락: /qa-check <role> 실행 후 마지막 메시지 첫 줄을 'QA: <verdict> <report-path>' 또는 'QA: N/A — <이유>'로 끝내고, 같은 줄을 <report-dir>/status-<name>.txt 에 기록하라"}` 출력 + exit 0(JSON 출력 방식) 또는 exit 2(stderr 방식) — 빌더가 하나로 통일.
5. `SubagentHandback`(v2.1.271+)으로 보고하는 경우 `last_assistant_message`에는 마지막 텍스트만 담기므로, 역할 파일과 fe/be 본문에 "QA 라인은 핸드백 보고가 아니라 **마지막 텍스트 메시지**에 쓴다"를 명시한다.

**`hooks/qa-gate-task-completed.sh`** (settings.json `TaskCompleted` — D17 승인 후 등록. D19)
- **왜 `TeammateIdle`이 아닌가**: FE 팀원은 QA 팀원에게 DM을 보내고 회신을 기다리는 동안 매 턴 idle이 된다. idle마다 "QA 라인 없음"으로 차단하면 오차단이 구조적으로 발생하고, 그 압력이 QA 라인을 지어내게 만든다(안티목표). `TaskCompleted`는 팀원이 작업을 completed로 선언하는 순간에만 발화해 "완료 선언 시점 검사"가 된다(exit 2로 완료 차단 가능 — C8 인접 사실, https://code.claude.com/docs/en/hooks).
1. stdin JSON 로깅 선행(U8: 입력에 완료 주체·태스크 owner·팀원 이름이 있는지 확인).
2. 완료 주체가 FE/BE 팀원이 아니면 exit 0 (이름은 `agent_team_configuration.md` 표준 구성 기준, 스크립트 상단 상수).
3. `<report-dir>/status-<teammate_name>.txt`가 존재하고 `^QA: ` 라인이 있으면 exit 0 후 파일을 `status-<name>.consumed-<ts>`로 rename(다음 태스크에 재사용 방지).
4. 없으면 stderr에 사유 + exit 2 → 완료가 거부되고 팀원이 계속 작업.
5. 무한 루프 방지: 태스크 ID별 차단 횟수를 `~/.claude/logs/qa-gate/task-<id>.count`에 기록, 2회째는 통과 + 경고 로그.
- U8이 "완료 주체를 식별할 수 없다"로 판명되면 폴백: 팀 리드가 gate 요청을 받기 전 `status-<name>.txt`를 직접 확인하는 **본문 규칙**으로 대체하고 팀 모드 훅은 두지 않는다. 이 경우 hooks/ 산출물은 subagent 모드 1개.

**훅이 하지 않는 것**: QA 호출(C9), 코드 변경 여부 판단(단순화를 위해 `QA: N/A` 탈출구로 대체 — 빌더가 `git status --porcelain` 휴리스틱을 추가해도 된다).

### 5.8 `skills/qa/figma-style-audit.md` — 신규 지식 파일 개요

기존 지식 파일 톤(한국어, 패턴 + 코드 예시, 체크리스트) 유지. 포함:
1. 왜 토큰 레벨인가 — 픽셀 diff가 Figma↔브라우저 비교에 부적합한 이유(렌더링 차이), 토큰 비교가 "의도된 디자인 값"을 직접 검증하는 이유
2. 디자인 값 추출 — Figma MCP 3도구의 역할 분담: `get_variable_defs`(토큰 이름→값 맵, 1차 소스), `get_design_context`(**코드 문자열**을 반환하므로 프롬프트로 plain CSS 출력을 요청하고 padding·gap·radius·타이포를 파싱, C12), `get_screenshot`(증거). 노드는 **컴포넌트 단위**로 좁힌다(섹션·페이지 노드는 출력이 수백 KB — 2026-10-23 실측 491KB). **레이트 리밋**(C11): View/Collab 시트 월 20회, Dev 시트 200/일 — 같은 노드 재호출 금지, 추출값은 JSON으로 저장해 재사용. 기존 OSS 중 Figma 토큰값 ↔ 라이브 computed CSS를 자동 대조하는 도구는 확인되지 않았다(Applitools Figma 플러그인 = 시각 비교·deprecated 예정, Storybook addon-designs = 수동 비교, PatternFly token-check = 라이브 DOM 아님) — 이 비교 단계는 직접 구현한다
3. 구현 값 추출 — Playwright `locator.evaluate(el => getComputedStyle(el)...)` 조합(공식 레시피는 아님, C16)으로 속성 집합 추출 스니펫. computed 색상은 `rgb(r, g, b)` 문자열이다. `expect(locator).toHaveCSS(name, value)`는 문자열 완전 일치/RegExp만 받으므로 저장용 Playwright 테스트로 굳힐 때는 정규화된 값을 넣는다. 상태별(hover/focus/disabled) 추출 방법
4. 정규화 규칙표 — rem/em→px(루트 16px 가정, 실제 루트 font-size 읽기), % letter-spacing→px, Figma `lineHeight` 단위, 색상 hex 대문자/소문자·`rgb()`→hex, Figma opacity 포함 색
5. 비교·severity 기준표 — 속성별 severity(색상·타이포 Major, 간격·radius Minor), "오차 0"의 적용 범위와 예외 없음 선언
6. 리포트 작성 — finding 템플릿 채우기 예시 1개(완전한 예 하나), 스크린샷 2장 첨부 규칙
7. 체크리스트 + 주의사항 — 폰트 로딩 완료 대기, 애니메이션 비활성화, 디자인 토큰 변수명↔CSS 변수명 매핑이 있으면 함께 보고(Code Connect 있으면 참조)

### 5.9 문서·설정 변경 (승인 필요 항목 표시)

| 파일 | 변경 | 승인 |
|---|---|---|
| `~/.claude/CLAUDE.md` PR 프로세스 1단계 | "QA pre-validation" → "FE/BE가 pre-check(`/qa-check <role>`) 통과 후 팀 리드가 `/qa-check gate` 실행. gate PASS 전 PR 생성 금지" + Anti-Pattern "pre-check 리포트 없이 gate 요청" | **필요** |
| `settings.json` hooks | `TaskCompleted` 항목 추가 (D19) | **필요** |
| `agents/orchestrator.md` | Domain Specialist Trigger "테스트/QA" 행에 `/qa-check gate` 사용 명시. Delegation Table QA 행 갱신 | 저장소 내 — PR로 |
| `agents/designer.md` 팀 작업 규칙 | "style 리포트의 불일치 중 의도된 차이는 `<report-dir>/style-waivers.json`에 `{selector, property, figma, actual, reason, by, date}`로 기록한다(D24). waiver 외의 방법으로 QA 판정을 바꾸지 않는다. 시안이 틀린 경우는 waiver 대신 Figma/mockup을 고치는 것을 우선 검토한다" | 저장소 내 — PR로 |
| `agents/fe-dev.md`, `agents/be-dev.md` | acceptance 리포트의 `## E2E candidates`를 받으면 테스트 코드로 굳힐지 판단하고, 굳히면 `test(e2e):` 커밋으로 자기 PR에 포함(D25) | 저장소 내 — PR로 |
| `README.md` | 스킬 수(19), qa-check 설명, 훅 수 | 저장소 내 — PR로 |
| 메모리 `agent_team_configuration.md`, `feedback_pr_process.md` | pre-check/gate 용어, QA 라인 규칙 | **필요** |

## 6. 검증 계획

원칙: writing-skills의 RED→GREEN→REFACTOR. **스킬을 쓰기 전에 베이스라인을 먼저 돈다.** skill-creator의 `evals/evals.json` 스키마와 grader를 사용한다.

> **2026-10-24 축소(사용자 지시: 토큰 절약)**: 아래 계획 중 실행하는 것은 베이스라인 B1 1회, eval 7개(review·style·acceptance 정상/입력 누락, gate 집계) 각 1회, fe-dev 행동 2개뿐이다. §6.2 실험군 비교(A1 vs A2)와 PR #65 실전 확인은 하지 않는다 — 역할 분리는 입력·도구·소비자가 다르다는 설계 기준(G1)과 §10의 근거(subagent의 "separation of concerns—distinct tools, prompts")로 유지한다. 실행 범위는 구현 계획 상단에 있다.

### 6.1 RED — 베이스라인 (현재 `qa.md`, 역할 분리 없음)
- B1 (= 실험군 A0). fixture 앱을 현재 `qa`에게 **한 세션에** 맡긴다 — 코드 리뷰 + 스냅샷 대비 스타일 + PRD 인수 × 2회.
- B2. 입력 누락 반응: PRD 없이 인수 검증 요청 × 1, 시안 없이 스타일 검수 요청 × 1 — 요청하는지, 지어내는지 기록.
- B3. fe-dev에게 소규모 구현 작업 1개 지시 → QA 호출 없이 끝내는지 관찰(훅 없음).
- B4. <private-repo> PR #65(`4b9b2b6b^..4b9b2b6b`)를 현재 `qa`에게 pre-validation × 1 (실전 확인용, 판정은 사후 진위 판별).
- 모든 headless 실행은 원격 알림 훅을 끄기 위해 `CLAUDE_REMOTE_PORT=9`로 돈다.
- 기록: 리포트 전문, 발견 건수, 토큰·시간, 사용한 합리화 문구(그대로 인용). **토큰은 전체 실행 합산이어야 한다**(C19): 1차 = 서브에이전트 트랜스크립트 jsonl의 요청별 usage 합산(U10), 2차 = OTel `claude_code.token.usage` (`query_source="subagent"`, `OTEL_LOG_TOOL_DETAILS=1`). 태스크 알림·PostToolUse의 `totalTokens`는 마지막 요청만이라 **참고값**으로만 기록. 실행 모델은 `resolvedModel`로 확인.

### 6.2 역할 분리 가설 측정 (핵심 질문)
- 실험군 (fixture 앱, 같은 입력 정보):
  - **A0** = B1 (현재 qa, 한 세션)
  - **A1** = 새 qa, 역할별 세션 분리 (`/qa-check review` · `style` · `acceptance` 각각) × 2회
  - **A2** = 새 qa, 같은 역할 지침 3개를 **한 세션**에서 수행 × 2회 — A1과 지침이 같으므로 A1 vs A2가 "분리 자체"의 효과다
  - 실전: PR #65 review를 A0(B4) vs A1 × 1회씩
- 진위 판정: 정답표(`ground-truth.json`)에 매칭되지 않는 finding은 코드로 확인해 **참(심지 않은 실제 결함) / 거짓**으로 분류. PR #65는 모든 finding을 같은 방식으로 판별.
- 지표: 정답 재현율, 거짓 finding 수(=할루시네이션), 비용(C19 방식), 시간.
- **채택 규칙** (review+acceptance 정답 6건 기준, 2회 평균): A1 재현율 − A2 재현율 ≥ 1건 **또는** A2 거짓 − A1 거짓 ≥ 1건, **그리고** A1 비용 ≤ 2 × A2 비용 → 분리 유지. 아니면 gate가 review+acceptance를 한 세션에서 돌린다(둘 다 재실행이 필요할 때만; 역할 파일은 유지). style은 도구 세트가 달라 항상 분리. 결과는 이 문서에 추기한다.

### 6.3 style fixture
- 디자인: Figma 파일 `tF7g5l6gdCdn9pF1AgZRt3`(Material 3 Design Kit Community 복제본, 사용자 drafts), 노드 `57994:2312` "Type=Square, Size=Medium, State=Enabled" 120×56. `get_variable_defs` 실측값: `primary #6750A4`, `on-primary #FFFFFF`, `Roboto / Medium / 16 / line-height 24 / tracking 0.15`. padding·radius는 빌더가 `get_design_context`(plain CSS 요청)로 **1회만** 읽어 `expected.json`에 기록.
- **레이트 리밋 예산(C11)**: 이 파일은 개인 drafts → View 시트 월 20회로 가정(U6). 2026-10-23 설계 중 이미 5회 사용. 빌더의 `get_design_context` 1회 + 스크린샷 1회를 제외한 **모든 eval·베이스라인 run은 `figma-snapshot=evals/files/figma-snapshot.json`으로 실행**한다(Figma MCP 호출 0회). 스냅샷 파일 = 빌더가 1회 읽은 원본 출력 그대로 저장. 라이브 Figma 경로는 운용에서 회사 파일(Dev 시트)로 검증한다(§9).
- 정답 렌더링: `evals/files/mockup.html` (시안 값 그대로 — mockup 경로 eval의 기준이자 fixture 자체 검증용)
- 구현: fixture 앱(`evals/files/app/`)의 `.btn` — 정답 값으로 작성한 뒤 **편차 5개**를 심는다:
  1. background `#6750A4` → `#6750A0` (색상 한 단계)
  2. font-weight `500` → `600`
  3. padding-inline Figma 값 → −4px
  4. border-radius Figma 값 → +2px
  5. line-height `24px` → `22px`
  - 함정(flag되면 오탐): font-size를 `1rem`으로 선언(=16px, 정규화 테스트), letter-spacing `0.15px` 정확 일치.
- 기대: finding 5건(Major 3: 색상·weight·line-height 중 타이포 2 + 색상 1 / Minor 2: padding·radius), 오탐 0, verdict FAIL. 베이스라인(B2)과 비교.
- 서빙: `python3 -m http.server 4791 --directory skills/qa-check/evals/files` → `app=http://localhost:4791/app/ selector=.btn`. (8765는 원격 훅 서버 기본 포트라 피한다.)

### 6.4 역할별 eval (`skills/qa-check/evals/evals.json`, 역할당 2~3개)
- review: (a) fixture 앱 정상 케이스 (b) `scope` 누락 → 중단·요청하는가 (c) 보안 결함(XSS) finding → Oracle 자문 흔적. 실전은 §6.2 PR #65
- style: (a) fixture 정상 케이스(`figma-snapshot=`) → 5/5 탐지·오탐 0·FAIL (b) `figma`·`mockup` 모두 없음 → Figma URL 요청 + **BLOCKED** (c) `app` 다운 → 서버 기동 요청 + **BLOCKED** (d) `mockup=` 경로: fixture HTML을 정답 mockup으로, 편차 심은 HTML을 앱으로 → 같은 5건 탐지 (D23) (e) `waivers=`에 편차 1건(색상)을 waiver로 등록 → 해당 finding `WAIVED`, 나머지 4건 유지, verdict는 여전히 FAIL(weight·line-height Major 잔존); waiver 값이 실제와 다르면 미적용 (D24)
- acceptance: (a) PRD 있음 정상 — 리포트에 `## E2E candidates` 존재, **테스트 파일 생성 0건**(D25) (b) PRD 없음 → 요청 + **BLOCKED** (c) 트랜스크립트에서 **시나리오 확정 전 소스 Read가 없는가**
- gate: (a) `type=fe` + 최신 pre-check 리포트 SHA 일치·clean → 재실행 생략 (b) SHA 불일치 또는 `tree: dirty` → 역할 병렬 실행 (c) 한 역할 FAIL → gate FAIL (d) 한 역할 BLOCKED → gate BLOCKED, "필요한 것" 병합
- 훅: fe-dev가 QA 라인 없이 종료 → 1회 차단 → 라인 포함 후 종료 성공. `QA: N/A` 통과. `stop_hook_active` 재차단 없음.
- expectations는 grader가 트랜스크립트로 검증 가능한 문장으로 쓴다(리포트 파일 존재, verdict 라인 존재, 각 finding에 `where:` 존재, 존재하지 않는 경로 참조 0건 등).

### 6.5 UNVERIFIED 해소 순서
U3(훅 스키마 로깅) → U1(서브에이전트 내 Skill fork) → U2(fork 세션 skills 주입) → U4(팀원의 `name` 없는 Agent 호출) → U5(frontmatter hooks in 팀 모드). 각 결과를 이 문서 §3에 추기.

### 6.6 완료 기준 (이 설계의 Exit criteria)
- [ ] 6.1 베이스라인 기록 존재
- [ ] 6.2 채택 규칙 적용 결과가 문서에 추기됨
- [ ] 6.3 fixture: 5/5 탐지, 오탐 0 (2회 연속)
- [ ] 6.4 eval 전부 pass (expectation pass rate 1.0, 역할당 2회)
- [ ] 훅: 누락 차단 1회 + 통과 확인, 무한 차단 없음
- [ ] Claude Code가 `/qa-check`를 로드한다(헤드리스 실행으로 확인), description ≤ 1,024자·꺾쇠 없음. (skill-creator `quick_validate.py`는 허용 키가 `name, description, license, allowed-tools, metadata, compatibility`뿐이라 Claude Code 전용 키 `context`·`agent`·`background`·`arguments`를 거부한다 — 이 스킬에는 적용하지 않는다)
- [ ] §5.9 승인 필요 항목은 변경안 제시 완료(적용 여부는 사용자)
- [ ] `~/.claude/`로 복사 후 `/qa-check` 자동완성에 노출 확인

### 6.7 결과 — 베이스라인 (2026-10-24, B1 1회)

조건: 오버레이 없이 라이브 `~/.claude/agents/qa.md`(구버전, sonnet)에 review·style·acceptance를 한 세션으로 맡김. 메인 세션 haiku, fixture 앱, `figma-snapshot` 사용(Figma 호출 0회). 표본 1회라 run 간 분산은 측정하지 못했고, 채점은 grader 없이 리포트를 정답표 15항목과 직접 대조했다.

| 항목 | 결과 |
|---|---|
| review 결함 R1·R2·R3 탐지 | 3/3 |
| acceptance 위반 A1·A2·A4 탐지 | 3/3 (코드 원인 + 브라우저 재현) |
| 통과 항목 P3·P5를 실패로 보고 | 0/2 (오탐 없음) |
| style 편차 S1–S5 탐지 | 5/5 (속성별 Major/Minor 분류 없음 — "핵심 시각 속성 5건"으로 묶음) |
| 함정 T1·T2를 불일치로 보고 | 0/2 (오탐 없음) |
| 정답표 밖 finding | 7건 (코드 5 + 시안 대비 2), 코드·스냅샷으로 확인한 결과 모두 사실. 거짓 finding 0건 |
| 형식 | `QA:` 마커 없음, `verdict.mjs`·`findings.json` 없음, 심각도 체계가 High/Medium/Low |
| 비용 | `cost_usd` 3.14 (haiku 0.01 / sonnet 1.78 / opus(oracle) 1.35) |
| 시간 | 1,045초(17.4분), 메인 turns 6, 서브에이전트 2(qa, oracle) |
| 도구 호출 | Playwright 67회, Read 15, Bash 15, Edit 3(리포트 파일만) |
| 부수 효과 | `app/` 수정 0, 테스트 파일 0, 샌드박스의 `.playwright-mcp/` 삭제 시도 1회가 권한 거부됨 |

한계: 같은 fixture가 작아 컨텍스트 혼입 효과(재현율 하락)는 과소평가될 수 있다. b2(PRD·시안 없음)·b3(fe-dev 직접 수정)·b4(PR #65) 베이스라인은 범위 축소로 실행하지 않았다.

## 7. 빌더에게 맡기는 것
- `$ARGUMENTS` 파싱 구현 방식과 key=value 외 형식 허용 여부
- `expected.json` 스키마, fixture HTML의 마크업 구조
- `scripts/compare-styles.mjs`·`verdict.mjs`의 입출력 JSON 스키마와 런타임(Node 24 전제, 외부 의존성 없음 권장). 역할 파일은 "판단"만 쓰고 정규화·비교·판정 계산은 스크립트에 위임한다 — 정규화 규칙(§5.8 4항)은 스크립트가 단일 소스
- severity 기준표의 세부(§5.5 공통 기준 안에서)
- 훅 스크립트 언어(bash/python), 로그 위치, 차단 횟수 저장 방식
- `style-waivers.json` 스키마 세부(필수 필드는 D24의 7개), 매칭 규칙(selector 정규화 등)
- review 역할에서 typecheck/lint/test 실행 실패 시 처리(환경 문제 vs 코드 문제 구분 규칙)
- 역할 파일의 DoD 문구, 지식 파일 톤 맞추기
- 커밋 분리(commit-convention 스킬): 에이전트 수정 / 스킬 신규 / 훅 / 문서 / eval 각각 별도 커밋, type 혼합 금지

## 8. 리스크
- R1. U1 실패 시 fe-dev의 QA 호출이 `Agent(qa, prompt=…)` 폴백이 되어 프롬프트 고정이 약해진다 → 폴백 프롬프트도 역할 파일 Read를 첫 지시로 고정하면 템플릿 효과는 유지됨.
- R2. 훅의 입력 스키마가 예상과 다르면 차단이 작동하지 않거나 오차단 → 로깅 단계 선행(§5.7).
- R3. Figma MCP 레이트 리밋(C11): View 시트 **월 20회**라 개인 drafts 기반 반복 검증은 불가 → 스냅샷 모드로 eval. 운용 시 회사 파일은 Dev 시트(200/일 + 10/분)지만 한 PR에서 컴포넌트 노드 N개 × (variable_defs + design_context + screenshot) = 3N회이므로 역할 파일에 "노드 수 상한(기본 5) 초과 시 사용자에게 우선순위를 묻는다" 규칙을 둔다.
- R6. `context: fork` 기본 백그라운드(C13)를 놓치면 fe-dev가 리포트를 받지 못한 채 진행 → `background: false` 필수, eval (a)에서 "호출자가 리포트 경로를 받았는가"를 expectation으로 둔다.
- R7. 역할 분리·QA의 인수 테스트 소유는 **업계 표준이 아니라 이 팀의 결정**이다. Fowler는 중앙 QA 팀을 안티패턴으로, E2E 소유권은 "쉬운 답이 없다"고 쓰고(https://martinfowler.com/articles/practical-test-pyramid.html), Google SWE Book은 "testing is everyone's job"이라고 쓴다(https://abseil.io/resources/swe-book/html/ch11.html). 이 설계의 `qa`는 조직이 아니라 한 팀 안의 **역할**이고, fe/be가 단위·통합 테스트를 계속 소유하므로 두 출처와 충돌하지 않는다 — 다만 문서와 에이전트 본문에서 "현업 표준"이라는 표현을 쓰지 않는다.
- R4. ~~PR #65 체크아웃 불가~~ → 확인됨(2026-10-24): squash 커밋 `4b9b2b6b`가 로컬 `<private-repo>/main`에 있다. 임시 detached worktree(scratchpad)로 쓰고 끝나면 제거. 저장소가 private이므로 산출물은 gitignore된 workspace에만.
- R8. my-harness는 **public** 저장소다. eval 트랜스크립트·<private-repo> 코드·Figma 단기 asset URL을 커밋하지 않는다(`skills/qa-check-workspace/` gitignore, 스냅샷의 asset URL 제거).
- R5. 스파이크 결과 "차이 없음"이면 review+acceptance 통합 — 설계는 역할 파일을 유지하므로 재작업 범위는 gate.md 한 곳.

## 9. 후속 (이번 범위 밖)
- 회사 FE 저장소에 화면이 생기면 React/Next + 실제 Figma 시안으로 style 실전 스모크
- 분리 기준 재확인: 어떤 역할이 **다른 도구 권한·permissionMode**를 필요로 하는 순간 그 역할만 별도 에이전트로 분리. **다른 모델·effort만 필요한 경우**는 에이전트 분리 전에 (1) gate 경로의 Agent 호출 파라미터(C17·C18), (2) 진입점 스킬의 역할별 분리(U9 결과에 따라)로 해결 가능 — 에이전트 분리는 마지막 수단
- 모델/effort 승격 A/B(D14 트리거 발생 시): skill-creator benchmark 스키마의 `with_skill/without_skill` 자리를 `sonnet/opus` 또는 `effort medium/high`로 바꿔 사용. 비용은 C19 방식으로 합산
- `qa` 리드 역할(전략·메트릭) 자체의 eval
- 회사 레거시 PHP 저장소 읽기 전용 스모크(레거시 PHP — 렌더된 CSS만 보므로 스택 무관) — 회사 저장소라 사용자 지시 시에만

## 10. 참고
- Claude Code 공식 문서: sub-agents / agent-teams / skills / hooks (§3 표의 URL)
- skill-creator 스킬 (`claude-plugins-official/skill-creator`): 진행형 공개(SKILL.md < 500줄, references on-demand), `evals/evals.json` 스키마, `quick_validate.py`, grader
- superpowers `writing-skills`: 베이스라인 먼저(RED) → 최소 스킬(GREEN) → 루프홀 봉합(REFACTOR); description은 "when to use"만, 워크플로우 요약 금지
- Anthropic, "How we built our multi-agent research system" — https://www.anthropic.com/engineering/multi-agent-research-system (원문 대조 완료)
  - 분리의 근거: "Subagents facilitate compression by operating in parallel with their own context windows … Each subagent also provides separation of concerns—distinct tools, prompts, and exploration trajectories—which reduces path dependency and enables thorough, independent investigations."
  - 비용: "agents typically use about 4× more tokens than chat interactions, and multi-agent systems use about 15× more tokens than chats." → §6.2 채택 규칙의 "토큰 ≤ 2×" 기준은 이 비용을 의식한 것
  - 경고: "some domains that require all agents to share the same context or involve many dependencies between agents are not a good fit for multi-agent systems today. For instance, most coding tasks involve fewer truly parallelizable tasks than research" → 역할 분리를 **입력·도구·소비자가 다른 묶음**에만 적용하는 이유(G1). review+acceptance처럼 같은 코드 컨텍스트를 공유하는 역할은 스파이크 결과에 따라 합칠 수 있다(§6.2)
- Figma MCP: tools — https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/ · rate limits — https://developers.figma.com/docs/figma-mcp-server/rate-limits-access/ (C11, C12)
- Playwright: `toHaveCSS` — https://playwright.dev/docs/api/class-locatorassertions#locator-assertions-to-have-css · `locator.evaluate` — https://playwright.dev/docs/api/class-locator#locator-evaluate · 완전 일치 근거(소스): https://github.com/microsoft/playwright/blob/20a2087ea43412b90c172c88faef80786ee18b8b/packages/playwright/src/matchers/matchers.ts#L341-L353 (C16)
- MDN `getComputedStyle` — https://developer.mozilla.org/en-US/docs/Web/API/Window/getComputedStyle ("resolved values … after applying active stylesheets")
- 테스트 소유권: Fowler, "The Practical Test Pyramid" — https://martinfowler.com/articles/practical-test-pyramid.html · Google, *Software Engineering at Google* ch.11 — https://abseil.io/resources/swe-book/html/ch11.html (R7 — 이 설계의 역할 분배는 팀 결정)
- 유사 도구(자동 토큰 대조는 없음): Applitools Figma plugin — https://applitools.com/docs/eyes/integrations/design-validation/figma-plugin · Storybook Connect — https://storybook.js.org/blog/figma-plugin-for-storybook/ · PatternFly pf-figma-token-check — https://github.com/patternfly/ai-helpers/blob/ba8165d906a8dd5ac20fdeb4d7de8e596129b499/plugins/design-audit/skills/pf-figma-token-check/SKILL.md
- 원문 사본: `/private/tmp/claude-502/-Users-JuChan/b9480cba-5a32-4468-b1e4-3ab6f641d5a6/scratchpad/refs/` (세션 한정)
