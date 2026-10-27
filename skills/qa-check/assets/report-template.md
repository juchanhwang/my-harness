# QA Report — <role> — <ISO datetime>
verdict: PASS | PASS WITH MINOR | FAIL | BLOCKED
commit: <sha>
tree: clean | dirty               # D22 개정 — dirty 리포트는 tree-sha가 커밋의 HEAD^{tree}와 같을 때만 gate가 재사용
tree-sha: <tree hash>             # 파일 내용 지문 — 공통 규칙 2
type: fe | be | config            # gate만
inputs: scope=… prd=… figma=… app=…   # 받은 key=value 인자 그대로 — gate가 재사용 판정에 비교
source: live | cache | snapshot   # style만 — cache는 figma-values-<node>.json 재사용, snapshot은 eval 전용
design-values: <style-design 파일 경로>   # style만 — gate가 이 두 파일로 compare-styles.mjs를 다시 돌려 검산
actual-values: <style-actual 파일 경로>
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

## Resolved from <직전 리포트 경로>   # review 재검증(rerun-of)만. 해소된 직전 finding id와 한 줄 근거
- R-n — <근거>

## E2E candidates                  # acceptance만, D25. 제안이며 QA가 작성하지 않음
- <시나리오 id> — 이유(회귀 위험·빈도)

## Checked / Not checked
- checked: …
- not checked (이유): …           # 환경 차단, 범위 밖 등

## Decision rule applied
Critical+Major = N → verdict …
