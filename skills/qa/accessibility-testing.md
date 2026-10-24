# Accessibility Testing

> 참조: [WCAG 2.2](https://www.w3.org/TR/WCAG22/) · [Understanding SC 1.4.3](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html) · [axe-core API](https://github.com/dequelabs/axe-core/blob/develop/doc/API.md) · [jest-axe](https://github.com/nickcolley/jest-axe)

기준은 WCAG 2.2 AA다. 구현 규칙은 `~/.claude/skills/fe/accessibility.md`, 디자인 기준은 `~/.claude/skills/designer/accessibility.md`를 따른다. 이 파일은 QA의 확인 항목과 판정 기준만 둔다.

## 자동 검사 (axe)

자동 검사는 WCAG 이슈의 30~57%만 잡는다(Deque, `~/.claude/skills/fe/accessibility.md`의 Testing). `violations: []`는 통과의 증거가 아니므로 아래 수동 확인을 건너뛰지 않는다.

- 태그는 `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`를 모두 지정한다. 태그가 규칙이 속한 WCAG 버전·레벨별이라 `wcag2aa`만 쓰면 2.1·2.2의 AA 규칙이 빠진다.
- `results.incomplete`("needs review")는 axe가 판정하지 못한 항목이다(예: 배경 이미지 위 텍스트의 대비). 위반이 0이어도 열어서 수동 확인한다.
- 모달·에러·펼침 상태는 그 상태를 만든 뒤에 스캔한다. 클릭 핸들러만 단 `div`는 axe가 알 수 없으므로 키보드로 도달하는지 직접 본다.
- jsdom에서 도는 컴포넌트 테스트(jest-axe·vitest-axe)는 **색 대비를 검사하지 못한다**(jest-axe는 이 규칙을 끈다). 대비는 실제 브라우저(`@axe-core/playwright`)로 확인한다.

## 색 대비

| 대상 | 기준 (AA) | SC |
|---|---|---|
| 일반 텍스트 | 4.5:1 이상 | 1.4.3 |
| 큰 텍스트 (18pt=24px 이상, 또는 14pt≈18.66px 이상 굵은 글씨) | 3:1 이상 | 1.4.3 |
| UI 컴포넌트 경계·상태(포커스 표시 포함), 의미를 전달하는 아이콘·그래픽 | 인접 색과 3:1 이상 | 1.4.11 |
| 면제 | 비활성(disabled) 컴포넌트, 순수 장식, 로고 | 1.4.3, 1.4.11 |

- 반올림하지 않는다. 4.499:1은 4.5:1에 미달이다. 플레이스홀더와 hover·포커스 때 나오는 텍스트도 대상이다.
- 기본·hover·focus·에러·다크 모드의 색 조합을 각각 잰다. 눈대중이나 색 이름으로 판정하지 않고 계산한 수치를 쓴다.
- 측정은 ① 실제 브라우저에서 axe `color-contrast`, ② `incomplete`(배경 이미지·그라디언트 위 텍스트)는 `getComputedStyle`로 전경·배경색을 읽어 WCAG 상대 휘도식으로 직접 계산한다. 알파가 있는 색은 뒤 배경과 합성한 뒤 계산하고, DevTools 색 선택기나 WebAIM Contrast Checker로 교차 확인한다.
- 보고 형식: `#777777 on #FFFFFF = 4.48:1 (일반 텍스트 기준 4.5:1 미달)`

## 키보드·시맨틱·스크린리더

- **키보드**: Tab 순서가 시각 순서와 같다. 포커스 표시가 보이고(인접 색 3:1), Enter·Space·Escape·화살표로 모든 기능이 된다(hover·드래그에는 대체 수단). 모달 밖에 키보드 트랩이 없고, 스킵 링크가 첫 Tab에 나타난다.
- **모달·동적 변경**: 모달은 열면 포커스가 안에서 순환하고 Escape로 닫히며 닫으면 트리거로 돌아간다. 항목 삭제·라우트 전환 뒤 포커스가 `<body>`로 떨어지지 않는다(`~/.claude/skills/fe/accessibility.md`의 Focus management).
- **시맨틱·폼**: `<main>` 1개, `<h1>` 1개, 제목 수준을 건너뛰지 않는다. 랜드마크, `<html lang>`, 고유한 `<title>`이 있다. 모든 입력에 `<label>`이 연결되고 에러는 `aria-describedby`로 연결된다.
- **이미지**: `alt` 속성이 **없을 때** 위반이다. 장식 이미지의 `alt=""`는 올바르다. `!img.alt`로 검사하면 정상 이미지를 위반으로 잡으므로 `getAttribute('alt') === null`로 판정한다.
- **스크린리더(수동)**: VoiceOver(macOS, Cmd+F5)·NVDA(Windows)·TalkBack(Android)로 페이지 제목, 제목(heading) 탐색 구조, 폼 레이블 낭독, 에러 메시지 자동 낭독(`aria-live`), 동적 변경 알림을 본다. 자동 검사가 못 잡는 포커스 이동 순서의 논리, 맥락 없이 이해되는 링크·버튼 텍스트, 복잡한 위젯(탭·아코디언·드래그앤드롭)이 대상이다.

## 체크리스트

- [ ] axe가 CI에서 실행되고 `incomplete`를 확인했는가
- [ ] 컴포넌트 테스트에 접근성 검사가 있는가 (색 대비는 컴포넌트 테스트로 검증되지 않는다)
- [ ] 키보드만으로 모든 기능을 쓸 수 있는가
- [ ] 색 대비가 AA 기준을 충족하는가 (측정값 첨부)
- [ ] 시맨틱 HTML, alt, 폼 레이블이 맞는가
- [ ] 포커스 표시가 명확한가
- [ ] 스크린리더로 주요 플로우를 수동 테스트했는가
