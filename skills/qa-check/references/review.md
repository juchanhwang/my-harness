# review — 코드 리뷰 역할

지정한 범위의 코드를 리뷰하고 finding(id `R-n`)을 낸다. 공통 규칙은 `SKILL.md`의 「공통 규칙」을 번호로 인용한다. 이 역할은 **코드만** 본다. 스타일 대조와 인수 시나리오는 다른 역할이다.

## 입력

- `scope=` (필수) git 범위(`main..HEAD`, `<sha>^..<sha>`) 또는 경로 목록(`app/ src/x.ts`)
- `prd=` (선택) 있으면 요구사항 대비 누락을 확인하는 데만 쓴다
- `report-dir=`, `mode=` — 공통

## 시작 전 확인 (하나라도 걸리면 중단하고 BLOCKED, 공통 규칙 1)

- `scope`가 없다 → 필요한 것: `scope`(git 범위 또는 경로)
- git 범위인데 `git diff --stat <scope>`가 실패한다 → 필요한 것: 유효한 범위
- 경로 목록에 존재하지 않는 경로가 있다 → 없는 경로 이름을 적는다
- 위 확인을 마친 직후, 리포트를 쓰기 전에 공통 규칙 2의 명령으로 `tree:` 값을 정한다

## 읽을 지식 파일

`<SKILL_DIR>/../qa/`의 `code-review.md`, `type-safety.md`, `static-analysis.md`, `security-testing.md`. React/Next.js 변경이 있으면 `vercel:react-best-practices` 스킬도 본다.
도구는 Read, Grep, Glob, Bash(`git diff`, typecheck·lint·test 실행)만 쓴다. 브라우저와 Figma 도구는 쓰지 않는다.

## 절차

1. **범위 확정**: git 범위면 `git diff --name-only <scope>`, 경로 목록이면 그 파일들.
2. **읽기**: 변경 파일을 전부 Read한다. 호출·사용 맥락이 필요한 주변 코드는 Grep으로 찾아 읽는다.
3. **체크리스트**: 보안(입력 검증, XSS·인젝션, 인증·권한), 성능(누수, 반복 생성, N+1), 엣지 케이스(null·빈 값·경계값·동시성·손상된 저장 데이터), 타입 안전성, 테스트 존재 여부. `prd`가 있으면 요구사항 대비 누락도 본다.
4. **정적 검사**: `package.json`의 scripts에 typecheck·lint·test가 있으면 실행하고 명령·종료 코드·요약을 리포트에 첨부한다. 없거나 환경 때문에 실패하면 `Not checked`에 이유를 쓴다.
5. **자문**: 보안·동시성 Critical·Major는 확정하기 전에 `oracle` 서브에이전트에 자문한다. 파일:줄과 발췌를 증거로 넘기고, 자문 결과를 finding의 `note:`에 요약한다.
6. **finding 작성**: id `R-1`, `R-2`…. `where`는 실제로 존재하는 `path:line`이고, 쓰기 직전에 그 줄을 다시 열어 확인한다. 모든 finding에 `expected`(기준), `actual`(관찰), `fix`(구체적 수정 제안)를 쓴다.
7. **마무리**: `findings.json` → `verdict.mjs` → 리포트 → 마커(공통 규칙 2–4).

severity 기준(공통 기준을 이 역할 예시로 구체화):

| severity | 예 |
|---|---|
| Critical | 보안 취약점(사용자 입력이 escape 없이 HTML에 삽입되는 XSS 등), 데이터 손상, 기능 불가 |
| Major | 손상된 저장 데이터 한 건으로 앱 초기화가 실패, 호출마다 쌓이는 리소스 누수, 요구사항(PRD)과 어긋나는 로직 |
| Minor | 영향이 작은 엣지 케이스 누락, 테스트 누락 |
| nit | 명명·형식 (스킵 가능, 리포트에 명시) |

## 이 역할이 하지 않는 것

- 스타일·시안 대조, 인수 시나리오 작성·실행
- 리팩토링 제안(코드 품질 관점은 `fe` 스킬의 `code-review.md` 소관이라 중복하지 않는다)
- 파일 수정(수정 제안은 `fix:`에만 쓴다)

## DoD

- [ ] 모든 finding의 `where`가 실제 존재하는 `path:line`이고 다시 열어 확인했다
- [ ] typecheck·lint·test 실행 결과를 첨부했거나 `Not checked`에 이유를 썼다
- [ ] 보안·동시성 Critical·Major는 `oracle` 자문 흔적이 있다
- [ ] `code-review.md`·`type-safety.md`·`security-testing.md`·`static-analysis.md` 기준을 훑었다(React/Next면 `vercel:react-best-practices`도)
- [ ] `verdict.mjs` 출력 = 리포트 `verdict` = 마커 첫 줄
