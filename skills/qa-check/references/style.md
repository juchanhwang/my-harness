# style — 시안(Figma 또는 mockup) ↔ 구현 스타일 검수 역할

색·타이포·간격·radius를 **토큰 레벨, 오차 0**으로 대조한다. 숫자 비교와 판정 규칙의 단일 소스는 `scripts/compare-styles.mjs`와 `scripts/verdict.mjs`다. 이 역할은 값을 **추출**하고 스크립트 출력을 **리포트로 옮길** 뿐, 직접 비교하거나 반올림하거나 판정을 손으로 바꾸지 않는다. **FE가 부르는 측정 도구**다 — 요청·수정·재요청은 fe-dev가 소유하고, QA의 판단은 들어가지 않으며, gate는 이 리포트를 세션 없이 스크립트로 검산만 한다. 공통 규칙은 `SKILL.md`의 「공통 규칙」을 번호로 인용한다.

## 입력

- 기준 소스(우선순위): `figma=` → `figma-snapshot=`(eval 전용, 리포트 `source: snapshot`) → `mockup=`(+ `mockup-selector=`, 기본값 `selector=`)
- `app=`(필수), `selector=`(단일 대상) 또는 `targets=`(매니페스트), `auth=`, `waivers=`
- `figma-refresh=1` (선택) `figma-values-<node>.json` 캐시를 무시하고 Figma를 다시 읽는다. 시안이 바뀌었다고 들었을 때 호출자가 붙인다
- `report-dir=`, `mode=` — 공통

## 시작 전 확인 (하나라도 걸리면 중단하고 BLOCKED, 공통 규칙 1)

- `figma`도 `figma-snapshot`도 `mockup`도 없다 → **BLOCKED**, 필요한 것: **Figma 노드 URL**(`node-id` 포함). 값을 짐작하거나 만들지 않고, `compare-styles.mjs`도 실행하지 않는다
- `curl -sf -o /dev/null <app>`이 실패한다 → **BLOCKED**, 필요한 것: 앱 서버 기동(호출자). QA는 앱 서버를 띄우지 않으므로 `http.server`·`npm run`·`pnpm dev`를 실행하지 않는다
- 대상이 5개를 넘는다 → 중단하지 말고 사용자에게 우선순위를 묻는다. 답이 없으면 BLOCKED

## 읽을 지식 파일

`<SKILL_DIR>/../qa/figma-style-audit.md`(규칙의 이유·절차), `visual-testing.md`(스크린샷 증거 규칙만), `accessibility-testing.md`(색 대비는 보고만 하고 판정에는 쓰지 않는다).
도구는 Figma MCP 읽기 도구(`create_session`, `get_variable_defs`, `get_design_context`), Playwright MCP(`browser_navigate`, `browser_resize`, `browser_evaluate`, FAIL 증거용 `browser_take_screenshot`), Bash(`node`, `curl`)를 쓴다. `get_screenshot`은 쓰지 않는다(판정에 안 쓰고 토큰이 크다). **`use_figma` 같은 쓰기 도구는 쓰지 않는다.**

## 절차

1. **대상 확정**: `targets=` 매니페스트(`[{figma, selector, viewport?, mockup-selector?}]`) 또는 단일 `figma`/`mockup` + `selector`. `target` 이름은 노드 이름(없으면 selector)을 소문자 슬러그로 쓴다.
2. **기준 소스 선택**: `figma` → 없으면 `figma-snapshot` → 둘 다 없고 `mockup`도 없으면 위 BLOCKED.
3. **Figma 값 → `style-design-<sha7>[-w<tree7>].json`**(리포트와 같은 base 이름. DesignTarget[] = `[{target, source, props}]`, props 키는 CSS 속성명, 값은 숫자(px) 또는 문자열)
   - `figma=`: 먼저 `<report-dir>/figma-values-<node>.json`이 있는지 본다. **있고 `figma-refresh=1`이 아니면 그 파일을 읽고 Figma MCP를 호출하지 않는다**(캐시). 없으면 `create_session` → `get_variable_defs`(1차) → `figma:figma-design-to-code` 스킬 로드 후 `get_design_context`(**plain CSS 출력을 요청**, 2차)를 노드당 도구별 **1회**만 부르고 추출값을 `figma-values-<node>.json`으로 저장한다. 노드마다 캐시/신규 읽기 중 무엇이었는지 `Checked`에 적는다
   - `figma-snapshot=`: JSON을 Read해 `variableDefs`와 `designContext.code`에서 같은 값을 뽑는다. **Figma MCP는 호출하지 않는다.** 디자인 스크린샷은 없으므로 `Not checked`에 쓴다
   - 대응: 토큰 이름의 의미로 판단한다(Primary → `background-color`, On Primary → `color`, Title/Medium/* → 타이포 5속성). padding·gap·radius는 코드 문자열의 값(`px-[24px]` → padding-left/right 24, `py-[16px]` → padding-top/bottom 16, `gap-[8px]` → row-gap·column-gap 8, `rounded-[16px]` → 4모서리 16)에서 읽는다. 색은 hex로 확정하고 `white` 같은 색 이름은 쓰지 않는다
   - Figma의 중첩 레이어(배경·radius = 컨테이너, padding·gap = 내부 레이어, 글꼴·글자색 = 텍스트 레이어)는 구현의 요소 1개에 합쳐 대응시키고, 어느 레이어 값을 어느 속성에 썼는지 `inputs`/`Checked`에 적는다. Figma에 없는 속성은 넣지 않는다
4. **mockup 값**(`mockup=`): `file://<절대경로>`로 navigate한다. 막히면 `python3 -m http.server <빈 포트> --directory <mockup 디렉터리>`를 띄우고 **끝나면 종료**한다(QA가 띄울 수 있는 유일한 서버). `mockup-selector`로 5단계와 같은 방식으로 추출해 DesignTarget으로 쓴다
5. **구현 값 → `style-actual-<sha7>[-w<tree7>].json`**(리포트와 같은 base 이름. ActualTarget[])
   - `app`으로 navigate → `document.fonts.ready` 대기 → 애니메이션·transition을 끄는 스타일 주입
   - 뷰포트 **1280×800과 375×812**(매니페스트 `viewport`로 변경 가능)마다 `browser_resize` 후 `<SKILL_DIR>/scripts/computed-style.snippet.js`를 실행한다. 파일 안의 `__SELECTOR_JSON__`을 `JSON.stringify(selector)`로 치환한 전체 문자열이 `browser_evaluate`의 function 인자다
   - 결과에 `target`과 `viewport`를 붙여 배열에 담는다. 셀렉터가 0개와 일치하면 그대로 담는다(스크립트가 BLOCKED로 만든다)
6. **비교**: `node <SKILL_DIR>/scripts/compare-styles.mjs --design <style-design> --actual <style-actual> [--waivers <waivers 파일>] > <findings.json>`. `waivers=`가 없으면 `<report-dir>/style-waivers.json`이 있을 때만 쓴다. waiver 파일은 **읽기만** 한다. 출력의 `findings`·`blocked`·`notChecked`를 그대로 쓴다. `blocked`가 하나라도 있으면 verdict는 BLOCKED이고, 각 문구(대상·속성·원문 값)가 `## Blocked by`의 필요한 것이다(해석할 수 없거나 없는 값 포함)
7. **증거**: 스크린샷은 **FAIL인 target만** 구현 쪽 1장을 `report-dir`에 저장한다(`browser_take_screenshot`, 요소 단위). 디자인 스크린샷은 찍지 않는다 — 판정은 숫자이고 시안은 Figma 링크로 본다. PASS·BLOCKED면 스크린샷 0장
8. **마무리**: `verdict.mjs <findings.json>` → 리포트(속성별로 묶어 쓰고, `waived` finding은 `[W-n]`에 waiver의 reason·by·date를 병기) → 마커(공통 규칙 2–4). 헤더에 `source: live | cache | snapshot`(모든 노드가 캐시면 `cache`, 하나라도 새로 읽었으면 `live`)과 `design-values: <style-design 파일 경로>` `actual-values: <style-actual 파일 경로>`를 쓴다 — gate가 이 두 파일로 검산한다

## 이 역할이 하지 않는 것

- "의도된 차이" 판정(designer 소관. waiver 파일로만 반영된다), waiver 작성·수정
- 픽셀 diff 판정, 코드 수정 제안 외의 리팩토링
- Figma 값을 눈대중으로 읽거나 근사치로 같다고 하는 것. 해석할 수 없는 값은 finding으로도 PASS로도 처리하지 않는다. 스크립트가 `blocked`에 적고 verdict는 BLOCKED다(공통 규칙 1)

## DoD

- [ ] 디자인 값 파일과 구현 값 파일을 저장했고 `compare-styles.mjs`를 실행했다(BLOCKED 제외)
- [ ] 모든 finding은 스크립트 출력에서 왔고 severity를 바꾸지 않았다
- [ ] 같은 Figma 노드를 두 번 읽지 않았고, 캐시가 있으면(`figma-refresh=1`이 아닌 한) Figma 호출 0회였다(snapshot도 0회)
- [ ] 헤더에 `design-values:`·`actual-values:` 경로가 있고 그 파일이 존재한다. 스크린샷은 FAIL target의 구현 쪽만 있다
- [ ] 뷰포트별로 추출했고 `where`에 뷰포트가 보인다
- [ ] waiver를 적용한 항목은 reason·by·date가 있고, 값이 다른 waiver는 "waiver 갱신 필요"를 남겼다
- [ ] `verdict.mjs` 출력 = 리포트 `verdict` = 마커 첫 줄
