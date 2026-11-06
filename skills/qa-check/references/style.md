# style — 시안(Figma 또는 mockup) ↔ 구현 스타일 검수 역할

색·타이포·간격·radius·그림자·opacity를 **토큰 레벨, 오차 0**으로 대조하고, 레이아웃(노드 크기와 auto layout의 여백·간격)은 박스로 **±1px** 대조한다 — 선언값은 오차 0, 레이아웃만 ±1px(이유는 `figma-style-audit.md` §9). 숫자 비교와 판정 규칙의 단일 소스는 `scripts/compare-styles.mjs`와 `scripts/verdict.mjs`다. 이 역할은 값을 **추출**하고 스크립트 출력을 **리포트로 옮길** 뿐, 직접 비교하거나 반올림하거나 판정을 손으로 바꾸지 않는다. **FE가 부르는 측정 도구**다 — 요청·수정·재요청은 fe-dev가 소유하고, QA의 판단은 들어가지 않으며, gate는 이 리포트를 세션 없이 스크립트로 검산만 한다. 공통 규칙은 `SKILL.md`의 「공통 규칙」을 번호로 인용한다.

## 입력

- 기준 소스(우선순위): `figma=` → `figma-snapshot=`(eval 전용, 리포트 `source: snapshot`) → `mockup=`(+ `mockup-selector=`, 기본값 `selector=`)
- `app=`(필수), `selector=`(단일 대상) 또는 `targets=`(매니페스트), `auth=`, `waivers=`
- 매니페스트 target의 `viewport`는 측정 뷰포트를 바꾸고, 레이아웃을 비교할 뷰포트(`layout.viewport`)도 정한다(3단계)
- `figma-refresh=1` (선택) `figma-values-<node>.json` 캐시를 무시하고 Figma를 다시 읽는다. 시안이 바뀌었다고 들었을 때 호출자가 붙인다
- `report-dir=`, `mode=` — 공통

## 시작 전 확인 (하나라도 걸리면 중단하고 BLOCKED, 공통 규칙 1)

- `figma`도 `figma-snapshot`도 `mockup`도 없다 → **BLOCKED**, 필요한 것: **Figma 노드 URL**(`node-id` 포함). 값을 짐작하거나 만들지 않고, `compare-styles.mjs`도 실행하지 않는다
- `curl -sf -o /dev/null <app>`이 실패한다 → **BLOCKED**, 필요한 것: 앱 서버 기동(호출자). QA는 앱 서버를 띄우지 않으므로 `http.server`·`npm run`·`pnpm dev`를 실행하지 않는다
- 대상이 5개를 넘는다 → 중단하지 말고 사용자에게 우선순위를 묻는다. 답이 없으면 BLOCKED

## 읽을 지식 파일

`<SKILL_DIR>/../qa/figma-style-audit.md`(규칙의 이유·절차), `visual-testing.md`(스크린샷 증거 규칙만), `accessibility-testing.md`(색 대비는 보고만 하고 판정에는 쓰지 않는다).
도구는 Figma MCP 읽기 도구(`create_session`, `get_variable_defs`, `get_design_context`, `get_metadata`), Playwright MCP(`browser_navigate`, `browser_resize`, `browser_evaluate`, FAIL 증거용 `browser_take_screenshot`), Bash(`node`, `curl`)를 쓴다. `get_screenshot`은 쓰지 않는다(판정에 안 쓰고 토큰이 크다). **`use_figma` 같은 쓰기 도구는 쓰지 않는다.**

## 절차

1. **대상 확정**: `targets=` 매니페스트(`[{figma, selector, viewport?, mockup-selector?}]`) 또는 단일 `figma`/`mockup` + `selector`. `target` 이름은 노드 이름(없으면 selector)을 소문자 슬러그로 쓴다.
2. **기준 소스 선택**: `figma` → 없으면 `figma-snapshot` → 둘 다 없고 `mockup`도 없으면 위 BLOCKED.
3. **Figma 값 → `style-design-<sha7>[-w<tree7>].json`**(리포트와 같은 base 이름. DesignTarget[] = `[{target, source, props, layout?}]`, props 키는 CSS 속성명, 값은 숫자(px) 또는 문자열. `layout`은 아래 「레이아웃」)
   - `figma=`: 먼저 `<report-dir>/figma-values-<node>.json`이 있는지 본다. **있고 `figma-refresh=1`이 아니면 그 파일을 읽고 Figma MCP를 호출하지 않는다**(캐시. 아래 세 도구 모두 0회). 없으면 `create_session` → `get_variable_defs`(1차) → `figma:figma-design-to-code` 스킬 로드 후 `get_design_context`(2차, **서버가 돌려준 React+Tailwind 원문을 그대로 파싱한다. plain CSS 등 다른 형식으로 바꿔 달라고 요청하지 않는다** — 서버에 형식 옵션이 없어 변환은 LLM이 하므로 기준값이 될 수 없다) → `get_metadata`(레이아웃용 XML: 레이어 id·이름·위치·크기)를 노드당 도구별 **1회**만 부른다. 노드마다 캐시/신규 읽기 중 무엇이었는지 `Checked`에 적는다
   - 캐시 `figma-values-<node>.json`에는 **원문 전체**를 저장한다: `variableDefs`(get_variable_defs 응답), `designContext`(get_design_context 응답 원문 문자열 전체), `metadata`(get_metadata XML 원문 문자열 전체), 추출한 props, 레이아웃 짝 `layoutPairs`(아래). 발췌(150~250자)만 저장하면 나중에 비교 속성을 늘릴 때 Figma를 다시 불러야 한다(2026-11-06 이전 캐시가 그랬다)
   - `figma-snapshot=`: JSON을 Read해 `variableDefs`와 `designContext.code`에서 같은 값을 뽑는다. **Figma MCP는 호출하지 않는다.** 디자인 스크린샷은 없으므로 `Not checked`에 쓴다
   - 대응: 토큰 이름의 의미로 판단한다(Primary → `background-color`, On Primary → `color`, Title/Medium/* → 타이포 5속성). padding·gap·radius는 코드 문자열의 값(`px-[24px]` → padding-left/right 24, `py-[16px]` → padding-top/bottom 16, `gap-[8px]` → row-gap·column-gap 8, `rounded-[16px]` → 4모서리 16)에서 읽는다. 색은 hex로 확정하고 `white` 같은 색 이름은 쓰지 않는다
   - Tailwind 원문 파싱: 값은 대괄호 임의값(`px-[24px]`)과 `var(--토큰, 대체값)`에서만 읽는다. `var()`는 이름의 `\/`를 `/`로 풀어 `get_variable_defs` 키와 맞춘 값을 쓰고(대소문자·공백·하이픈 무시), 맞는 키가 없을 때만 대체값을 정규화해 쓴다(`white` → `#FFFFFF`, `'Roboto:Medium'` → family `Roboto`·weight 500). `font-medium`·`p-4`처럼 이름만 있는 클래스는 테마에 따라 값이 달라 읽지 않는다 — 같은 값이 `get_variable_defs`에 없으면 그 속성은 넣지 않는다. 래퍼의 `leading-[0]`처럼 안쪽 요소가 다시 지정하는 값은 안쪽 값을 쓴다. `relative`·`shrink-0` 같은 레이아웃 부산물은 24개 속성 밖이라 props로 읽지 않는다(`flex`·`flex-col`·`w-full`·`justify-between`은 아래 레이아웃의 그룹·compare를 정할 때만 쓴다)
   - 그림자·opacity: 그림자는 `shadow-[0px_2px_10px_0px_rgba(0,0,0,0.1)]`처럼 대괄호 임의값만 읽고 `_`를 공백으로 풀어 그대로 쓴다(`0px 2px 10px 0px rgba(0,0,0,0.1)`. `inset`과 쉼표로 이은 여러 겹도 그대로). opacity는 `opacity-[0.5]`에서 읽는다. `shadow-md`·`opacity-50`처럼 이름만 있는 클래스는 위 규칙대로 읽지 않고 그 속성은 넣지 않는다. 텍스트 레이어의 그림자는 `text-shadow`, 그 외 레이어는 `box-shadow`에 넣는다. fill의 opacity는 `opacity`가 아니라 그 색의 alpha로 쓰고, `opacity`에는 레이어 opacity만 넣는다(근거는 `figma-style-audit.md` §2)
   - Figma의 중첩 레이어(배경·radius = 컨테이너, padding·gap = 내부 레이어, 글꼴·글자색 = 텍스트 레이어)는 구현의 요소 1개에 합쳐 대응시키고, 어느 레이어 값을 어느 속성에 썼는지 `inputs`/`Checked`에 적는다. Figma에 없는 속성은 넣지 않는다
   - **레이아웃 `layout`**(같은 DesignTarget의 선택 필드. 형식의 단일 소스는 `compare-styles.mjs`의 `compareLayout` 주석):
     `{ viewport: "375x812" | null, nodes: { <key>: { figmaId, selector, box: [x,y,w,h], compare: ["w","h"] | ["h"] | [] } }, groups: [{ parent: <key>, kids: [<key>…], axis: "x"|"y", checks: ["start","gaps","end"] 중 일부 }] }`
     - 소스는 `get_metadata` XML(위치·크기)과 `get_design_context` 코드(auto layout·폭 클래스)다. 캐시나 snapshot에 `metadata` 원문이 없으면(2026-11-06 이전 캐시, eval snapshot) `layout`을 넣지 않고 `Not checked`에 "레이아웃 미검증 — get_metadata 원문 없음(`figma-refresh=1`이면 비교)"을 쓴다. 이것 때문에 Figma를 다시 부르지 않는다(캐시 규칙)
     - `box`: 메타데이터의 x·y는 부모 기준이므로 루트까지 조상의 x·y를 더해 **대상 루트 기준**으로 바꾼다. 루트는 key `root`(고정), selector `""`, box `[0, 0, w, h]`다. `hidden="true"` 노드와 그 하위는 뺀다
     - 노드 고르기: DOM에 대응하는 요소가 없는 Figma 래퍼 레이어는 뺀다(실측 예: `heading`, `gap/auto`, `group/item`, `limit/responsive`). 짝지은 노드만 `nodes`에 넣고 key는 짧은 영문 이름(`title`, `b1`)으로 쓴다
     - `selector`: 루트 요소 안에서 `querySelector`로 찾는 루트 기준 selector다. 짝지은 결과 `{figmaId, selector}`는 캐시의 `layoutPairs`(key → 짝)에 저장해 다음 실행에 재사용한다. 짝지은 뒤 5단계 박스가 0×0이 아닌지 확인한다 — 같은 클래스의 숨겨진 중복 요소를 고르면 0×0이고 스크립트가 blocked로 만든다(실측: 활성 탭에는 숨겨진 아이콘 `img`가 하나 더 있어 `.bottom-tab-bar__icon--active`로 골랐다)
     - `compare`: 텍스트 노드, 그리고 design_context 코드에 폭 클래스가 없으면서 텍스트를 담은 노드(텍스트에 맞춰 줄어든다)는 `["h"]`. 채우기 폭(`w-full`, `flex-[1_0_0]`, `flex-1`) 노드는 Figma 화면 프레임 폭과 비교 뷰포트 폭이 같을 때만 `w`를 넣는다 — 화면 프레임 폭을 모르면(대상이 화면 안의 컴포넌트이고 그 프레임을 읽지 않았으면) 같지 않다고 보고 뺀다. 그 외는 `["w","h"]`
     - `groups`: design_context의 auto layout 컨테이너(`flex`)마다 하나다. `flex-col`이면 `axis: "y"`, 아니면 `"x"`, `kids`는 짝지은 자식을 순서대로 쓴다. `checks`는 기본 `["start","gaps"]`, `justify-between`이면 `["start","end"]`(가운데 간격은 자동이라 빼고 마지막 kid의 끝 여백을 본다), 오른쪽(끝)에 붙은 요소는 그 요소 하나를 kid로 `["end"]`
     - 회전된 레이어(`rotate-` 클래스)는 메타데이터 좌표가 1px 어긋날 수 있다(실측: 세로 구분선 앞뒤 간격 Figma 41·39 ↔ 구현 40·40). ±1px 안이라 그대로 둔다
     - `compare`·`checks`는 이 역할이 정하고 스크립트는 그대로 실행만 한다. 여기서 빠뜨린 지표는 비교되지 않는다
     - `viewport`: ① 매니페스트 target의 `viewport` → ② 없으면 Figma 루트 노드 폭이 측정 뷰포트 폭(1280·375) 중 하나와 같으면 그 뷰포트 → ③ 둘 다 아니면 `null`. 값은 5단계에서 그 측정의 actual 항목 `viewport`에 쓰는 문자열과 같아야 한다(문자열로 비교한다. 기본 표기 `1280x800`·`375x812`). `null`이면 스크립트가 레이아웃 전체를 `notChecked`에 남긴다 — 루트 폭이 뷰포트와 다른 컴포넌트(버튼·FAB 등)는 매니페스트에 `viewport`가 없으면 여기에 해당한다
4. **mockup 값**(`mockup=`): `file://<절대경로>`로 navigate한다. 막히면 `python3 -m http.server <빈 포트> --directory <mockup 디렉터리>`를 띄우고 **끝나면 종료**한다(QA가 띄울 수 있는 유일한 서버). `mockup-selector`로 5단계와 같은 방식으로 추출해 DesignTarget으로 쓴다. mockup 기준에는 `layout`을 넣지 않고 `Not checked`와 요약에 "레이아웃 미검증 — mockup 기준"을 쓴다(레이아웃 데이터는 Figma `get_metadata`에서만 만든다). mockup은 디자인 쪽이라 요청할 디자인 키가 없으므로 `__PROPS_JSON__`에는 24개 전체를 넣는다(`node -e "import('<SKILL_DIR>/scripts/compare-styles.mjs').then((m) => console.log(JSON.stringify(m.PROPS)))"`의 출력)
5. **구현 값 → `style-actual-<sha7>[-w<tree7>].json`**(리포트와 같은 base 이름. ActualTarget[])
   - `app`으로 navigate → `document.fonts.ready` 대기 → 애니메이션·transition을 끄는 스타일 주입
   - 뷰포트 **1280×800과 375×812**(매니페스트 `viewport`로 변경 가능)마다 `browser_resize` 후 `<SKILL_DIR>/scripts/computed-style.snippet.js`를 실행한다. 파일 안의 자리표시자 두 개를 치환한 전체 문자열이 `browser_evaluate`의 function 인자다: `__SELECTOR_JSON__` → `JSON.stringify(selector)`, `__PROPS_JSON__` → `JSON.stringify(<그 target의 style-design props 키 목록>)`(예: `["background-color","padding-left","box-shadow"]`)
   - 스니펫은 요청 ∩ 24개 속성만 읽는다(결과가 컨텍스트를 거치므로 크기를 줄인다). `line-height`를 요청하면 `font-size`도 함께 읽는다(디자인에 font-size가 없는 `line-height: %`를 구현 font-size로 풀기 위해). 빈 배열이면 아무것도 읽지 않는다 — 전체 읽기로 대신하지 않는다. 배열이 아니거나 치환하지 않았으면 스니펫이 예외를 던진다
   - 결과의 `unsupported`는 24개 밖의 요청 키다. 비어 있지 않으면 디자인 JSON에 비교하지 않는 키(오타 포함)가 있다는 뜻이고, `compare-styles.mjs`는 그 키를 말없이 건너뛴다. 오타면 3단계에서 키를 고친 뒤 다시 추출하고, 24개 밖 속성이면 디자인 JSON에서 빼고 `Not checked`에 적는다
   - 결과에 `target`과 `viewport`를 붙여 배열에 담는다. 셀렉터가 0개와 일치하면 그대로 담는다(스크립트가 BLOCKED로 만든다)
   - 레이아웃: `layout.viewport`가 문자열인 target은 **그 뷰포트에서**, 대상이 보이는 상태(시트 열기·스크롤 등)를 만든 뒤 `<SKILL_DIR>/scripts/layout-boxes.snippet.js`를 실행한다. 자리표시자 두 개를 같은 방식으로 치환한다: `__SELECTOR_JSON__` → `JSON.stringify(selector)`(속성 추출과 같은 target selector. 여러 개와 일치하면 첫 요소가 루트), `__NODES_JSON__` → `JSON.stringify(<layout.nodes의 {key: selector}>)`. 결과의 `boxes`를 그 뷰포트 actual 항목의 `boxes`로 넣는다. `rootFound: false`면 `boxes`를 넣지 않는다(스크립트가 blocked로 만든다). 다른 뷰포트 항목에는 넣지 않는다(넣어도 비교하지 않는다). 숨겨진 상태에서 재면 박스가 0×0이라 blocked가 된다
6. **비교**: `node <SKILL_DIR>/scripts/compare-styles.mjs --design <style-design> --actual <style-actual> [--waivers <waivers 파일>] > <findings.json>`. `waivers=`가 없으면 `<report-dir>/style-waivers.json`이 있을 때만 쓴다. waiver 파일은 **읽기만** 한다. 출력의 `findings`·`blocked`·`notChecked`를 그대로 쓴다. `blocked`가 하나라도 있으면 verdict는 BLOCKED이고, 각 문구(대상·속성·원문 값)가 `## Blocked by`의 필요한 것이다(해석할 수 없거나 없는 값 포함). 레이아웃 finding은 같은 출력에 `id` `L-…`, `property` `layout:<지표>`(`layout:h`, `layout:gap-y(b1↔b2)` 등), severity Minor, note `허용 오차 ±1px`로 나온다. 박스를 못 찾았거나 0×0인 노드는 finding이 아니라 `blocked`다(key·selector가 문구에 있다)
7. **증거**: 스크린샷은 **FAIL인 target만** 구현 쪽 1장을 `report-dir`에 저장한다(`browser_take_screenshot`, 요소 단위). 디자인 스크린샷은 찍지 않는다 — 판정은 숫자이고 시안은 Figma 링크로 본다. PASS·BLOCKED면 스크린샷 0장
8. **마무리**: `verdict.mjs <findings.json>` → 리포트(속성 finding은 속성별로 묶고, 레이아웃 finding(`L-`)은 그 뒤에 "레이아웃 (허용 오차 ±1px)" 묶음으로 따로 쓴다. `waived` finding은 `[W-n]`에 waiver의 reason·by·date를 병기) → 마커(공통 규칙 2–4). `notChecked`에 `<target> layout`이 있거나 `layout`을 넣지 못한 target이 있으면 리포트 요약과 마커 아래 요약 첫머리에 **"레이아웃 미검증: <target>(이유)"**를 쓴다 — 레이아웃 미검증은 verdict를 바꾸지 않으므로 눈에 띄게 남겨야 PASS를 레이아웃 통과로 읽지 않는다. 헤더에 `source: live | cache | snapshot`(모든 노드가 캐시면 `cache`, 하나라도 새로 읽었으면 `live`)과 `design-values: <style-design 파일 경로>` `actual-values: <style-actual 파일 경로>`를 쓴다 — gate가 이 두 파일로 검산한다

## 이 역할이 하지 않는 것

- "의도된 차이" 판정(designer 소관. waiver 파일로만 반영된다), waiver 작성·수정
- 픽셀 diff 판정, 코드 수정 제안 외의 리팩토링
- Figma 값을 눈대중으로 읽거나 근사치로 같다고 하는 것. 해석할 수 없는 값은 finding으로도 PASS로도 처리하지 않는다. 스크립트가 `blocked`에 적고 verdict는 BLOCKED다(공통 규칙 1)
- 레이아웃 허용 오차(±1px)를 바꾸거나 박스를 스크립트 밖에서 비교하는 것. 비교할 지표(`compare`·`checks`)는 이 역할이 정하지만 판정은 스크립트가 한다

## DoD

- [ ] 디자인 값 파일과 구현 값 파일을 저장했고 `compare-styles.mjs`를 실행했다(BLOCKED 제외)
- [ ] 모든 finding은 스크립트 출력에서 왔고 severity를 바꾸지 않았다
- [ ] 같은 Figma 노드를 두 번 읽지 않았고, 캐시가 있으면(`figma-refresh=1`이 아닌 한) Figma 호출 0회였다(snapshot도 0회). 새로 읽었으면 캐시에 get_design_context·get_metadata 원문 전체와 `layoutPairs`를 저장했다
- [ ] `layout`을 넣은 target은 `layout.viewport` 측정의 actual 항목에 `boxes`가 있다. `layout`을 넣지 못했거나 `viewport: null`인 target은 요약 첫머리와 `Not checked`에 "레이아웃 미검증"과 이유가 있다
- [ ] 레이아웃 finding은 속성 finding과 따로 묶었고, 레이아웃의 `compare`·`checks`는 3단계 규칙대로 정했다
- [ ] 헤더에 `design-values:`·`actual-values:` 경로가 있고 그 파일이 존재한다. 스크린샷은 FAIL target의 구현 쪽만 있다
- [ ] 뷰포트별로 추출했고 `where`에 뷰포트가 보인다
- [ ] waiver를 적용한 항목은 reason·by·date가 있고, 값이 다른 waiver는 "waiver 갱신 필요"를 남겼다
- [ ] `verdict.mjs` 출력 = 리포트 `verdict` = 마커 첫 줄
