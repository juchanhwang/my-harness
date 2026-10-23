# Figma 시안 ↔ 구현 스타일 검수 (토큰 레벨)

> 숫자 규칙의 **단일 소스는 `skills/qa-check/scripts/compare-styles.mjs`**(테스트 포함)다. 이 문서는 규칙의 이유와 절차만 적는다. 규칙을 바꿀 때는 스크립트와 테스트를 먼저 고친다.

## 1. 왜 토큰 레벨인가

- Figma와 브라우저는 렌더링 엔진이 달라 같은 값도 픽셀이 다르게 나온다. 그래서 픽셀 diff는 허용 오차 임계값이 필요하고, 임계값 안에서는 padding 4px, 색 한 단계(`#6750A4` → `#6750A0`) 같은 실제 편차가 묻힌다.
- 토큰 비교는 디자이너가 의도한 값(색 hex, padding, radius, 글꼴 속성)을 숫자로 직접 대조한다. 편차가 있으면 얼마나 다른지가 finding에 그대로 남는다.
- 스크린샷은 **증거 첨부용**이다. 판정은 스크린샷으로 하지 않는다(`visual-testing.md`의 스크린샷 증거 규칙만 참고).

## 2. 디자인 값 추출 (Figma MCP)

| 도구 | 역할 | 주의 |
|---|---|---|
| `get_variable_defs` | 토큰 이름 → 값 맵. **1차 소스** | 색·글꼴 토큰은 여기서 확정 |
| `get_design_context` | **코드 문자열**(기본 React + Tailwind)과 자산 URL을 돌려준다 | 필드 단위 구조화 값은 없다. 프롬프트로 plain CSS 출력을 요청해 `padding`·`gap`·`radius`·타이포를 파싱한다 |
| `get_screenshot` | 증거용 이미지 | 토큰 수가 크다 |

- `get_design_context`는 코드 문자열을 준다: https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/ . Tailwind 클래스는 프로젝트 테마에 따라 값이 달라지므로 그대로 읽지 않는다. 요청 형식이 plain CSS인 것은 **값을 숫자로 확정하기 위한 추출 형식**이며 구현 스택과 무관하다.
- 노드는 **컴포넌트 단위**로 좁힌다. 섹션·페이지 노드는 출력이 수백 KB다(2026-10-23 실측 491KB).
- 읽기 도구에는 레이트 리밋이 있다: View·Collab 시트는 **월 20회**, Dev·Full 시트는 Professional 플랜 기준 **200회/일 + 10회/분**(Organization 200/일·15/분, Enterprise 600/일·20/분). https://developers.figma.com/docs/figma-mcp-server/rate-limits-access/
  - 같은 노드를 두 번 읽지 않는다. 추출값은 리포트 옆 `figma-values-<node>.json`에 저장해 재사용한다.
  - `figma-snapshot=`이 주어지면(eval 전용) Figma MCP를 호출하지 않는다.
- Figma 토큰값과 라이브 computed CSS를 자동으로 대조하는 오픈소스는 확인하지 못했다. 가까운 도구는 시각 비교(Applitools Figma plugin), 수동 비교(Storybook Connect), 라이브 DOM이 아닌 토큰 점검(PatternFly pf-figma-token-check)이다. 그래서 이 비교 단계는 직접 구현한다.
  - https://applitools.com/docs/eyes/integrations/design-validation/figma-plugin
  - https://storybook.js.org/blog/figma-plugin-for-storybook/
  - https://github.com/patternfly/ai-helpers/blob/ba8165d906a8dd5ac20fdeb4d7de8e596129b499/plugins/design-audit/skills/pf-figma-token-check/SKILL.md

## 3. 구현 값 추출 (Playwright)

- 비교 대상은 CSS 소스가 아니라 브라우저가 계산한 값이다. `getComputedStyle`은 "활성 스타일시트를 적용하고 계산을 끝낸 resolved value"를 돌려주므로 Tailwind든 CSS 파일이든 같은 방식으로 읽힌다. https://developer.mozilla.org/en-US/docs/Web/API/Window/getComputedStyle
- `skills/qa-check/scripts/computed-style.snippet.js`의 자리표시자를 `JSON.stringify(selector)`로 치환해 `browser_evaluate`의 function 인자로 넘기면 21개 속성을 한 번에 읽는다. 결과에 `target`을 붙여 `compare-styles.mjs --actual`로 넘긴다.
- computed 색상은 `rgb(r, g, b)` 문자열이다. hex와 직접 비교할 수 없어 정규화가 필요하다.
- Playwright `toHaveCSS(name, value)`는 문자열 **완전 일치**(또는 RegExp)만 받는다. 이 비교를 테스트 코드로 굳힐 때는 정규화한 값을 넣는다(작성은 fe-dev). https://playwright.dev/docs/api/class-locatorassertions#locator-assertions-to-have-css
- 상태별 값(hover·focus·disabled)은 `browser_hover` 등으로 상태를 만든 뒤 같은 스니펫을 다시 실행하고, 상태별로 target 이름을 분리한다.

## 4. 정규화 규칙 (이유)

| 입력 | 정규화 | 이유 |
|---|---|---|
| `px`·단위 없는 숫자 | 그대로 | Figma 값은 px 숫자다 |
| `rem` | × 실제 루트 font-size | 16으로 가정하지 않고 읽은 값을 쓴다 |
| `em` | × 해당 요소 font-size | font-size를 모르면 해석 불가 |
| `%` (letter-spacing만) | × font-size ÷ 100 | 다른 속성의 %는 요소 크기를 몰라 환산할 수 없다 |
| 소수 | 둘째 자리 반올림 | 아래 참고 |
| 색 | 대문자 `#RRGGBB` + alpha(둘째 자리) | hex·alpha가 모두 같아야 일치. `rgb()`·`rgba()`·`rgb(r g b / a)`·`#RGB`·`#RRGGBBAA`·`transparent` 해석 |
| `font-family` | 첫 패밀리, 따옴표 제거, 소문자 | computed `"Roboto", sans-serif` ↔ Figma `Roboto`는 같은 글꼴 |
| `letter-spacing: normal` | 0 | CSS에서 normal은 추가 간격 없음 |
| `line-height: normal` | 숫자와 **불일치** | normal은 글꼴 메트릭 비율이라 24px과 같다고 단정할 수 없다 |

- **소수 둘째 자리 반올림은 허용 오차가 아니다.** Figma는 0.15를 `0.15000000596046448`(32비트 부동소수에서 0.15에 가장 가까운 값)로 내보낸다. 같은 값의 표현 노이즈를 지우는 것이며, 0.01px 이상의 차이는 그대로 불일치다. "근사하게 같다"는 판정은 하지 않는다.
- 굵기 이름은 대소문자·공백·하이픈을 무시하고 숫자로 바꾼다.

| 이름 | 값 | 이름 | 값 |
|---|---|---|---|
| Thin | 100 | Semi Bold / Demi Bold | 600 |
| Extra Light / Ultra Light | 200 | Bold | 700 |
| Light | 300 | Extra Bold / Ultra Bold | 800 |
| Regular / Normal / Book | 400 | Black / Heavy | 900 |
| Medium | 500 | 그 외 이름 | Not checked |

## 5. 비교 속성 21개와 severity

| 그룹 | 속성 | severity |
|---|---|---|
| 색상 6 | `background-color` `color` `border-{top,right,bottom,left}-color` | Major |
| 타이포 5 | `font-family` `font-size` `font-weight` `line-height` `letter-spacing` | Major |
| 간격 6 | `padding-{top,right,bottom,left}` `row-gap` `column-gap` | Minor |
| radius 4 | `border-{top-left,top-right,bottom-right,bottom-left}-radius` | Minor |

- **오차 0은 예외가 없다.** 불일치는 전부 finding이다. 디자인에 없는 속성은 비교하지 않는다.
- "의도된 차이"를 QA가 판정하지 않는다. designer가 `<report-dir>/style-waivers.json`에 `{selector, property, figma, actual, reason, by, date}`를 남기면, 값이 모두 일치하는 finding만 `WAIVED`로 표시하고 판정 집계에서 뺀다. 값이 하나라도 다르면 미적용이고 "waiver 갱신 필요" 메모를 붙인다. waiver 파일은 읽기만 한다.
- 해석할 수 없는 값(`color(display-p3 …)`, 알 수 없는 굵기 이름)은 finding이 아니라 Not checked에 이유와 함께 적는다.

## 6. 셀렉터와 뷰포트

- 셀렉터가 **0개**와 일치하면 BLOCKED다(셀렉터 이름을 "필요한 것"에 적는다). 코드 결함이 아니다.
- **2개 이상**과 일치하면 인덱스로 구분해 전부 비교한다. `where`는 `.btn[0]`, `.btn[1]`이다.
- 뷰포트는 대상마다 데스크톱 1(기본 1280) + 모바일 1(기본 375)이다. `where`는 `.btn @375`, finding id 끝에 `-375`가 붙는다.
- 대상 노드가 5개를 넘으면 중단하지 말고 우선순위를 사용자에게 묻는다. 답이 없으면 BLOCKED다.

## 7. finding 작성 예

```markdown
### [M-1] Major — background-color 불일치
- where: .btn
- expected: #6750A4 (Figma 57994:2312, Schemes/Primary)
- actual: #6750A0 (computed rgb(103, 80, 160))
- repro: http://localhost:4791/app/ 에서 .btn의 background-color를 읽는다
- evidence: .orchestrator/qa/style-<sha7>-design.png, style-<sha7>-impl.png
- fix: .btn의 background를 #6750A4로 고친다(토큰 변수가 있으면 변수 값을 확인한다)
```

## 8. 체크리스트와 주의

- [ ] 폰트 로딩이 끝난 뒤 추출했다(`document.fonts.ready`). 애니메이션·transition은 꺼서 중간값을 읽지 않았다.
- [ ] 같은 Figma 노드를 두 번 읽지 않았고 추출값을 `figma-values-<node>.json`에 저장했다.
- [ ] 판정은 `compare-styles.mjs` 출력과 `verdict.mjs` 출력 그대로다. 손으로 다시 계산하지 않았다.
- [ ] 스크린샷 2장(디자인·구현)을 증거로 붙였다.
- [ ] 디자인 토큰 변수명과 CSS 변수명의 매핑(Code Connect 등)이 있으면 함께 보고했다.
- [ ] `figma`도 `mockup`도 없으면 지어내지 않고 Figma 노드 URL을 요청했다.
