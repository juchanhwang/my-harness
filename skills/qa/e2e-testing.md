# E2E Testing

> 참조: [Playwright — Best Practices](https://playwright.dev/docs/best-practices) · [Playwright — Locators](https://playwright.dev/docs/locators) (auto-waiting, user-facing locator 철학) · [Google Testing Blog — Just Say No to More E2E Tests](https://testing.googleblog.com/2015/04/just-say-no-to-more-end-to-end-tests.html)

E2E 도구는 Playwright다(`~/.claude/skills/fe/testing.md` §4). 테스트 코드로 굳힐 때의 설정·Page Object·로그인 플로우 패턴은 `~/.claude/skills/fe/testing-nextjs.md`의 「Playwright E2E 패턴」을 따른다.

## 요소 선택 우선순위

`~/.claude/skills/fe/testing.md` §6 쿼리 우선순위와 같은 순서다. 사용자가 보는 방식에 가까울수록 UI가 바뀌어도 덜 깨진다.

1. `getByRole('button', { name: '가입하기' })`
2. `getByLabel('이메일')`
3. `getByPlaceholder('검색어를 입력하세요')`
4. `getByText('환영합니다')`
5. `getByTestId('submit-button')` — 위 방법으로 찾을 수 없을 때만 쓰는 최후 수단

CSS 클래스(`.btn-primary.mt-4`)·`nth-child`·XPath는 쓰지 않는다. 빌드나 레이아웃이 바뀌면 깨지는 구현 종속 선택자이고, `testing.md` §8도 CSS 선택자 검색을 금지한다.

## 대기와 플레이키 방지

고정 대기(`waitForTimeout`)는 쓰지 않는다. 길면 느려지고 짧으면 간헐적으로 실패한다. 조건을 기다린다.

```typescript
await expect(page.getByText('저장 완료')).toBeVisible();   // web-first assertion: 조건이 될 때까지 재시도한다
const saved = page.waitForResponse(r => r.url().includes('/api/data') && r.ok());
await page.getByRole('button', { name: '저장' }).click();  // 응답 대기는 동작 전에 걸어 둔다. 동작 뒤에 걸면 응답을 놓친다
await saved;
```

- 테스트마다 고유 데이터로 시작하고 실행 순서에 기대지 않는다. 공유 데이터와 순서 의존은 플레이키의 원인이다.
- Given 상태는 가능하면 UI가 아니라 API로 만든다. UI로 만들면 그 UI의 결함 하나가 모든 테스트를 실패시킨다.
- 로그인이 필요한 시나리오는 UI 로그인을 매번 반복하지 않고 한 번 로그인한 상태(Playwright `storageState`)를 재사용한다. 같은 이유로, 로그인 화면 결함 하나가 모든 시나리오를 실패시키지 않게 하려는 것이다.
- 플레이키가 의심되면 별도 태그로 격리하고 trace viewer로 원인을 확인한다(대부분 타이밍이나 데이터). 고친 뒤 `playwright test --repeat-each=10 <파일>`로 10회 연속 통과를 확인한다.

## 네트워크 가로채기로 에러·지연 상태 재현

백엔드를 건드리지 않고 에러 응답과 로딩 상태를 만든다. 요청을 일으키는 동작(`goto`, 클릭) 전에 등록한다.

```typescript
// 에러 응답
await page.route('**/api/products', route =>
  route.fulfill({ status: 500, body: JSON.stringify({ error: 'Internal Server Error' }) }));
await page.goto('/products');
await expect(page.getByText('문제가 발생했습니다')).toBeVisible();

// 지연 응답: 로딩 상태 확인
await page.route('**/api/data', async route => {
  await new Promise(r => setTimeout(r, 3000));
  await route.continue();
});
await page.goto('/dashboard');
await expect(page.getByText('로딩 중...')).toBeVisible();
await expect(page.getByText('데이터')).toBeVisible({ timeout: 10000 });
```

## E2E 범위 결정

E2E는 느리고 깨지기 쉬우므로 브라우저에서만 확인되는 것에 쓴다. 넓되 얕게, 핵심 플로우만 깊게.

E2E로 검증한다
- 핵심 비즈니스 플로우, 크리티컬 패스 (가입 → 로그인 → 핵심 기능 → 결제)
- 인증/인가 전체 플로우
- RSC 렌더링, 페이지 라우팅, middleware 리다이렉트 (`~/.claude/skills/fe/testing-nextjs.md`의 테스트 전략 표)
- 크로스 브라우저 호환성

E2E로 검증하지 않는다
- 개별 컴포넌트 로직 → Unit
- API 응답 형태 → Integration
- 비주얼 UI → Visual Regression
- 엣지 케이스 수백 개 → Unit/Integration
