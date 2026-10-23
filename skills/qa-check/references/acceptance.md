# acceptance — PRD 인수 검증 역할

PRD의 인수 조건을 시나리오로 확정하고 **실행 중인 앱**에서 검증한다. finding은 `A-n`. 공통 규칙은 `SKILL.md`의 「공통 규칙」을 번호로 인용한다.

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
도구는 Read, Playwright MCP(시나리오 실행·스크린샷), Bash(`curl`, 기존 E2E 실행)를 쓴다. 쓰기는 `report-dir` 안만(리포트와 스크린샷).

## 절차 (순서 강제)

1. **시나리오 확정 먼저**: PRD만 Read해 인수 조건마다 시나리오 1~2개(Given/When/Then, 구체 입력값)를 만들고, 리포트 파일의 `## 시나리오` 표에 **가장 먼저 Write**한다. 이 Write 전에는 앱의 소스·diff·테스트 파일을 Read·Grep·Glob하지 않는다. 코드가 기준을 오염시키는 것을 막기 위해서다. 앱 화면도 이 Write 전에는 열지 않는다.
2. **실행**: `app`에서 시나리오를 실행한다(Playwright MCP의 navigate·type·click·snapshot, API는 `curl`). 시나리오는 서로 독립이어야 하므로 시나리오마다 새로 로드하고 필요하면 저장소(localStorage 등)를 비운다.
3. **기록**: 시나리오마다 PASS / FAIL / BLOCKED(환경)와 재현 단계, 실패 시 증거(스크린샷·응답 본문) 경로를 쓴다.
4. **원인 확인**: 실패 원인을 알아야 할 때만, 시나리오를 확정·기록한 뒤에 소스를 Read한다.
5. **기존 E2E**: 프로젝트에 E2E가 있으면 실행해 결과를 첨부한다. 없으면 `Not checked`.
6. **E2E candidates**: 테스트 코드로 굳힐 만한 시나리오를 `## E2E candidates`에 이유(회귀 위험·빈도)와 함께 **제안**만 한다. 작성은 fe-dev·be-dev의 몫이다.
7. **finding**: id `A-1`, `A-2`…. `where`는 시나리오 id(예: `AC-1`), `expected`는 PRD 문구, `actual`은 관찰 결과, `repro`는 재현 단계다. 기능을 쓸 수 없으면 Critical, 인수 조건이 부분적으로만 실패하면 Major, 표시·엣지 문제는 Minor. 이어서 `findings.json` → `verdict.mjs` → 리포트 → 마커(공통 규칙 2–4).

## 이 역할이 하지 않는 것

- 테스트 코드(단위·통합·E2E) 작성·커밋 — fe-dev·be-dev 소관이다. 코드·테스트 파일을 Write하지 않는다
- 코드 리뷰 관점의 지적(그건 review 역할이다)
- PRD에 없는 기준을 지어내 FAIL을 내는 것. 통과한 인수 조건을 실패로 보고하는 것

## DoD

- [ ] 시나리오 표가 소스 Read보다 먼저 리포트에 기록됐다
- [ ] 인수 조건마다 결과(PASS/FAIL/BLOCKED)가 있고, FAIL마다 재현 단계와 증거가 있다
- [ ] `## E2E candidates` 절이 있다
- [ ] `report-dir` 밖에 새 파일이 없고 테스트 파일도 만들지 않았다(`report-dir`을 뺀 `git status --porcelain`이 비어 있다)
- [ ] 시나리오 표에 범위·완료 기준이 보인다(`test-planning.md`의 범위 템플릿)
- [ ] `verdict.mjs` 출력 = 리포트 `verdict` = 마커 첫 줄
