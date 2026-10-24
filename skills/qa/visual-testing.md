# Visual Testing

> 참조: [Playwright — Visual comparisons](https://playwright.dev/docs/test-snapshots) · [toHaveScreenshot](https://playwright.dev/docs/api/class-pageassertions) · [Docker](https://playwright.dev/docs/docker)

역할 세션(시안 대비 스타일 검수 등)이 읽는 **스크린샷 증거 규칙**과, 기준선 비교로 회귀를 잡는 **시각 회귀 테스트**를 다룬다.

## 스크린샷 증거 규칙

`qa-check`의 style 역할(`references/style.md`)과 `figma-style-audit.md`는 이 절만 읽는다. 스크린샷은 **증거 첨부용**이다. 시안 대비 판정은 토큰 비교 스크립트가 하며, 눈으로 "같아 보인다"고 판정하거나 픽셀 차이로 판정하지 않는다. 뷰포트 값과 저장 위치·파일명은 호출한 역할 문서를 따른다.

| 규칙 | 이유 |
|---|---|
| 같은 대상·뷰포트·상태로 기준 이미지와 구현 이미지를 한 쌍 남긴다 (회귀 테스트 실패 시에는 `expected`·`actual`·`diff`) | 조건이 다르면 비교할 수 없다 |
| hover·focus·disabled·error는 상태별로 따로 찍는다 | 어느 상태의 증거인지 알아야 한다 |
| 뷰포트를 고정하고 촬영 중 바꾸지 않는다. 뷰포트가 여럿이면 뷰포트마다 한 쌍이다 | 폭이 다르면 줄바꿈·배치가 달라진다 |
| 폰트 로딩 뒤에 찍는다 (`await document.fonts.ready`) | 폴백 폰트로 찍히면 글자 폭이 틀어진다 |
| 애니메이션·transition을 끈다 | 중간 프레임이 찍힌다 |
| 시각·랜덤 데이터·아바타·실시간 차트 같은 동적 영역은 가리거나(`mask`, 또는 `visibility: hidden` 주입) 고정 데이터로 바꾼다 | 실행마다 달라져 증거가 흔들린다 |

`toHaveScreenshot`은 `animations: 'disabled'`가 기본이고 연속 두 장이 같아질 때까지 기다린다. `page.screenshot`은 `animations` 기본이 `allow`이고, MCP `browser_take_screenshot`에는 `animations`·`mask` 옵션이 없으므로 직접 끄고 가린다.

```typescript
await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
```

## 시각 회귀 테스트

기준선(baseline)을 코드 리뷰와 함께 저장하고 변경 후 같은 조건으로 찍어 픽셀을 비교한다. 의도된 변경이면 기준선을 갱신하고, 아니면 회귀 버그다.

```typescript
await expect(page).toHaveScreenshot('homepage.png', { maxDiffPixelRatio: 0.01, fullPage: true });
await expect(button).toHaveScreenshot('submit-button.png', { maxDiffPixels: 100 });
```

- **임계값**: 전체 페이지 `maxDiffPixelRatio: 0.01`(1%), 컴포넌트 `maxDiffPixels: 100`, 텍스트가 많은 영역은 조금 더 관대하게 둔다. 너무 엄격하면 false positive, 너무 관대하면 실제 버그 누락이다.
- **환경**: 기준선은 비교를 돌리는 CI와 같은 OS·브라우저에서 만든다. 스냅샷 이름에 브라우저와 플랫폼이 붙고(`chromium-darwin`) 렌더링·폰트가 달라 서로 호환되지 않는다. CI는 `mcr.microsoft.com/playwright:v<@playwright/test 버전>-noble`로 고정한다(22.04 호환이 필요할 때만 `-jammy`).
- **우선순위**: 높음 — 디자인 시스템 컴포넌트(하나가 깨지면 앱 전체에 번진다)·랜딩. 중간 — 폼·입력 상태, 반응형, 다크 모드. 낮음 — 이메일 템플릿(클라이언트별 렌더링 차이가 너무 크다).
- **도구**: Chromatic(Storybook 스토리를 클라우드에서 비교, PR 리뷰 통합), Percy(BrowserStack). 둘 다 스냅샷 수로 과금되므로 핵심 컴포넌트와 페이지에만 쓴다.

## 체크리스트

- [ ] 기준선 이미지가 코드 리뷰되는가
- [ ] 동적 콘텐츠가 마스킹되는가 (날짜, 랜덤 데이터)
- [ ] 뷰포트 크기와 다크/라이트 모드가 커버되는가
- [ ] 애니메이션이 비활성화되는가
- [ ] CI에서 일관된 렌더링 환경이 보장되는가
- [ ] 허용 오차(threshold)가 적절한가
- [ ] 변경이 의도적인지 리뷰하는 절차가 있는가
