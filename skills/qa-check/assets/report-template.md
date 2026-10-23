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
