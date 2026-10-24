# Mobile Testing

> 참조: [Playwright — Emulation](https://playwright.dev/docs/emulation) · [Touch events](https://playwright.dev/docs/touch-events) · [WCAG 2.2 SC 1.4.10 Reflow](https://www.w3.org/TR/WCAG22/#reflow) · [SC 2.5.8 Target Size (Minimum)](https://www.w3.org/TR/WCAG22/#target-size-minimum) · [MDN — env()](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/env)

반응형 디자인 기준(브레이크포인트, 터치 타깃, 모바일 패턴, 안티패턴)은 `~/.claude/skills/designer/responsive-design.md`를 따른다. 이 파일은 QA의 확인 항목과 판정 기준만 둔다.

## 디바이스 매트릭스

- 뷰포트 폭(CSS px): **320** · 375 · 768 · 1280 (필요하면 1920). 320은 Reflow 기준폭이라 가로 스크롤 없이 표시돼야 한다(SC 1.4.10).
- 기기 프로필: Playwright `devices`의 iPhone SE · iPhone 13 · Pixel 5 · Galaxy S9+ (프로젝트 구성은 `e2e-testing.md`). 방향은 세로와 가로(예: 667×375) 모두 본다.
- 실 디바이스(BrowserStack·Sauce Labs 등 유료 클라우드)는 릴리스 전에 스팟 체크한다. 가상 키보드, safe area, 실제 터치 반응, 메모리·성능은 에뮬레이션으로 확인되지 않는다.

## 에뮬레이션의 함정

- `setViewportSize`는 크기만 바꾼다. 모바일 동작(`isMobile`, `hasTouch`, UA, 화면 배율)은 `devices[...]` 프로필로만 설정된다. `tap()`은 `hasTouch`가 꺼진 컨텍스트에서 예외를 던진다.
- 스와이프·핀치는 `touchscreen`이 `tap`만 제공해 TouchEvent를 직접 dispatch해야 한다. 마우스 드래그는 touch 이벤트만 듣는 컴포넌트를 검증하지 못한다.
- 가상 키보드는 뜨지 않는다. 입력 필드를 탭하고 `toBeInViewport()`만 보는 테스트는 키보드 없이 통과하므로 증거가 아니다.
- 느린 네트워크는 CDP `Network.emulateNetworkConditions`(Chromium 전용)로 건다. 예시 값은 1.5Mbps↓ / 750Kbps↑ / 지연 100ms다. 오프라인은 `context.setOffline(true)`다.

## 확인 항목

- [ ] **레이아웃**: 매트릭스의 폭마다 깨짐·잘림·가로 스크롤(`scrollWidth > innerWidth`)이 없고 이미지가 뷰포트에 맞는다
- [ ] **터치 타깃**: 44×44 CSS px 이상(하네스 기준, `~/.claude/skills/designer/responsive-design.md`의 Touch Target). WCAG 2.2 AA 하한은 24×24(SC 2.5.8, 간격·문장 안 링크 등 예외)이고 44×44는 AAA(SC 2.5.5)다. 시각 크기가 아니라 눌리는 영역(`boundingBox()`)을 잰다
- [ ] **글자**: 본문 16px 이상
- [ ] **가상 키보드**: 입력 필드와 제출 버튼이 키보드에 가리지 않는다 (실 디바이스)
- [ ] **safe area**: `viewport-fit=cover`를 쓰는 화면에서 고정 헤더·하단 바·CTA가 노치·홈 인디케이터에 가리지 않는다 (`env(safe-area-inset-*)`, 실 디바이스·시뮬레이터)
- [ ] **방향 전환**: 전환 뒤 레이아웃·입력값·스크롤 위치가 유지된다
- [ ] **네트워크**: 느린 네트워크에서 로딩 표시 뒤 콘텐츠가 뜨고, 오프라인에서 안내 메시지가 나온다
- [ ] **내비게이션·제스처**: 햄버거 메뉴가 열리고 닫힌다(배경 탭·Escape). hover 의존 UI가 없고 제스처에 버튼 대안이 있다
- [ ] **확대**: 핀치 줌이 허용된다(`user-scalable=no` 금지)
