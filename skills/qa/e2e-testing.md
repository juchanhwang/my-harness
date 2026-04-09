# E2E Testing

> 참조: [Playwright — Best Practices](https://playwright.dev/docs/best-practices) · [Playwright — Locators](https://playwright.dev/docs/locators) (auto-waiting, user-facing locator 철학) · [Martin Fowler — PageObject](https://martinfowler.com/bliki/PageObject.html) · [Cypress — Best Practices](https://docs.cypress.io/app/core-concepts/best-practices) · [Google Testing Blog — Just Say No to More E2E Tests](https://testing.googleblog.com/2015/04/just-say-no-to-more-end-to-end-tests.html)

## 목차

1. [E2E 테스트란](#e2e-테스트란) — 실제 브라우저 기반 전 경로 검증
2. [Playwright vs Cypress](#playwright-vs-cypress) — 도구 선택 기준
3. [Playwright 기본 설정](#playwright-기본-설정) — config, projects, reporters
4. [페이지 오브젝트 모델 (Page Object Model)](#페이지-오브젝트-모델-page-object-model) — 유지보수 가능한 E2E 구조
5. [안정적 E2E 작성 원칙](#안정적-e2e-작성-원칙) — auto-waiting, locator 전략
6. [플레이키 테스트 방지](#플레이키-테스트-방지) — 타이밍·race condition
7. [네트워크 인터셉션](#네트워크-인터셉션) — route, fulfill, mocking
8. [E2E 테스트 범위 결정](#e2e-테스트-범위-결정) — 크리티컬 패스 식별

***

## E2E 테스트란

사용자 관점에서 전체 시스템을 브라우저를 통해 테스트한다. 실제 사용자처럼 페이지를 열고, 클릭하고, 입력하고, 결과를 확인한다. 모든 레이어(프론트엔드 → API → DB)를 관통하는 테스트.

## Playwright vs Cypress

| 기능           | Playwright                    | Cypress               |
| ------------ | ----------------------------- | --------------------- |
| 멀티 브라우저      | Chrome, Firefox, Safari, Edge | Chrome, Firefox, Edge |
| 멀티 탭         | ✅                             | ❌                     |
| iframe       | ✅ 네이티브                        | 제한적                   |
| 네트워크 인터셉션    | ✅ 강력                          | ✅                     |
| 병렬 실행        | ✅ 내장 (workers)                | 유료 (Dashboard)        |
| 언어           | TS, JS, Python, Java, C#      | JS, TS                |
| 모바일 에뮬레이션    | ✅                             | 제한적                   |
| 속도           | 빠름                            | 보통                    |
| Trace Viewer | ✅ 내장                          | ❌                     |

**권장: Playwright.** 더 빠르고, 더 안정적이고, 기능이 풍부하다. 2024년 이후 업계 표준 E2E 도구로 정착했다.

## Playwright 기본 설정

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI, // CI에서 .only 금지
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results.json' }],
  ],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry', // 실패 시 trace 수집
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

## 페이지 오브젝트 모델 (Page Object Model)

POM은 페이지의 구조와 행동을 캡슐화해서 테스트의 가독성과 유지보수성을 높인다.

### POM 구현

```typescript
// e2e/pages/login-page.ts
import { expect, type Page, type Locator } from '@playwright/test';

export class LoginPage {
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;
  readonly forgotPasswordLink: Locator;

  constructor(private page: Page) {
    this.emailInput = page.getByLabel('이메일');
    this.passwordInput = page.getByLabel('비밀번호');
    this.submitButton = page.getByRole('button', { name: '로그인' });
    this.errorMessage = page.getByRole('alert');
    this.forgotPasswordLink = page.getByRole('link', { name: '비밀번호 찾기' });
  }

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async expectError(message: string) {
    await expect(this.errorMessage).toHaveText(message);
  }

  async expectRedirectToDashboard() {
    await expect(this.page).toHaveURL('/dashboard');
  }
}
```

```typescript
// e2e/pages/dashboard-page.ts
import { expect, type Page, type Locator } from '@playwright/test';

export class DashboardPage {
  readonly welcomeMessage: Locator;
  readonly logoutButton: Locator;
  readonly profileLink: Locator;

  constructor(private page: Page) {
    this.welcomeMessage = page.getByTestId('welcome-message');
    this.logoutButton = page.getByRole('button', { name: '로그아웃' });
    this.profileLink = page.getByRole('link', { name: '프로필' });
  }

  async expectWelcome(name: string) {
    await expect(this.welcomeMessage).toContainText(name);
  }

  async logout() {
    await this.logoutButton.click();
    await expect(this.page).toHaveURL('/login');
  }
}
```

### POM 사용

```typescript
// e2e/auth.spec.ts
import { test } from '@playwright/test';
import { LoginPage } from './pages/login-page';
import { DashboardPage } from './pages/dashboard-page';

test.describe('인증', () => {
  test('유효한 자격증명으로 로그인', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const dashboard = new DashboardPage(page);

    await loginPage.goto();
    await loginPage.login('alice@test.com', 'password123');
    await loginPage.expectRedirectToDashboard();
    await dashboard.expectWelcome('Alice');
  });

  test('잘못된 비밀번호로 로그인 실패', async ({ page }) => {
    const loginPage = new LoginPage(page);

    await loginPage.goto();
    await loginPage.login('alice@test.com', 'wrong-password');
    await loginPage.expectError('이메일 또는 비밀번호가 올바르지 않습니다');
  });
});
```

## 안정적 E2E 작성 원칙

### 1. 안정적인 선택자 사용

```typescript
// ❌ 나쁨 — CSS 클래스에 의존 (빌드 시 변경됨)
page.locator('.btn-primary.mt-4.px-6');
page.locator('#app > div:nth-child(3) > button');

// ✅ 좋음 — 사용자 관점 선택자
page.getByRole('button', { name: '가입하기' });
page.getByLabel('이메일');
page.getByText('환영합니다');
page.getByTestId('submit-button'); // data-testid
page.getByPlaceholder('검색어를 입력하세요');
```

### 선택자 우선순위

1. `getByRole` — 가장 안정적, 접근성과 일치
2. `getByLabel` — 폼 요소에 최적
3. `getByText` — 사용자가 보는 텍스트
4. `getByTestId` — 위 3개로 불가능할 때
5. CSS/XPath — 최후의 수단

### 2. 하드코딩된 대기 금지

```typescript
// ❌ 절대 하지 마라
await page.waitForTimeout(3000);

// ✅ Web-first assertions (자동 대기 + 재시도)
await expect(page.getByText('저장 완료')).toBeVisible();
await expect(page.getByRole('table')).toContainText('Alice');
await page.waitForResponse(resp =>
  resp.url().includes('/api/data') && resp.status() === 200
);
```

### 3. 테스트 격리

```typescript
// ✅ 각 테스트는 독립적인 데이터로 시작
test.beforeEach(async ({ page }) => {
  // API로 직접 데이터 시딩 (UI 통해 하지 않음)
  await page.request.post('/api/test/seed', {
    data: { users: [{ email: 'test@test.com', name: 'Test User' }] },
  });
});

test.afterEach(async ({ page }) => {
  await page.request.post('/api/test/cleanup');
});
```

### 4. 인증 상태 재사용

```typescript
// e2e/auth.setup.ts
import { test as setup } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '.auth/user.json');

setup('로그인 상태 저장', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('이메일').fill('test@test.com');
  await page.getByLabel('비밀번호').fill('password123');
  await page.getByRole('button', { name: '로그인' }).click();
  await page.waitForURL('/dashboard');
  await page.context().storageState({ path: authFile });
});

// playwright.config.ts에서 사용
{
  name: 'authenticated',
  use: { storageState: authFile },
  dependencies: ['auth-setup'],
}
```

## 플레이키 테스트 방지

### 플레이키의 주요 원인과 해결책

| 원인        | 해결책                      |
| --------- | ------------------------ |
| 하드코딩 대기   | Web-first assertions     |
| 공유 데이터    | 테스트별 고유 데이터              |
| 테스트 순서 의존 | 독립적 setup/teardown       |
| 애니메이션     | `animations: 'disabled'` |
| 네트워크 불안정  | API 모킹 or retry          |
| 타이밍 이슈    | `expect` auto-retry      |

### 플레이키 테스트 대응 프로세스

1. **격리**: 플레이키 테스트를 별도 태그로 표시
2. **분석**: trace viewer로 실패 원인 파악
3. **수정**: 근본 원인 해결 (대부분 타이밍 or 데이터)
4. **모니터링**: 수정 후 10회 연속 실행으로 안정성 확인

```bash
# 플레이키 테스트 10회 반복 실행
npx playwright test --repeat-each=10 tests/flaky-test.spec.ts
```

## 네트워크 인터셉션

```typescript
test('API 에러 시 에러 페이지를 보여준다', async ({ page }) => {
  // API 응답 가로채기
  await page.route('/api/products', route =>
    route.fulfill({
      status: 500,
      body: JSON.stringify({ error: 'Internal Server Error' }),
    })
  );

  await page.goto('/products');
  await expect(page.getByText('문제가 발생했습니다')).toBeVisible();
});

test('느린 네트워크 시뮬레이션', async ({ page }) => {
  await page.route('/api/data', async route => {
    await new Promise(r => setTimeout(r, 3000)); // 3초 지연
    await route.continue();
  });

  await page.goto('/dashboard');
  await expect(page.getByText('로딩 중...')).toBeVisible();
  await expect(page.getByText('데이터')).toBeVisible({ timeout: 10000 });
});
```

## E2E 테스트 범위 결정

### E2E로 테스트할 것

* 핵심 비즈니스 플로우 (가입 → 로그인 → 핵심 기능 → 결제)
* 크리티컬 패스 (사용자의 주요 여정)
* 크로스 브라우저 호환성
* 인증/인가 전체 플로우

### E2E로 테스트하지 않을 것

* 개별 컴포넌트 로직 → Unit Test
* API 응답 형태 → Integration Test
* 비주얼 UI → Visual Regression Test
* 엣지 케이스 수백 개 → Unit/Integration

**E2E는 넓되 얕게. 핵심 플로우만 깊게.**