# Test Automation Architecture

> 참조: Gerard Meszaros, *xUnit Test Patterns: Refactoring Test Code* (Addison-Wesley, 2007) — Test Fixture / Factory / Test Double 원전 · [xunitpatterns.com](http://xunitpatterns.com/) · [Martin Fowler — Test Smells](https://martinfowler.com/articles/test-fabrications.html) · Robert C. Martin, *Clean Code* (Prentice Hall, 2008) Ch. 9 (테스트 코드 품질) · [ISTQB Advanced Level Test Automation Engineer Syllabus](https://www.istqb.org/)

## 목차

1. [테스트 프레임워크 설계 원칙](#테스트-프레임워크-설계-원칙) — DRY·가독성·유지보수성
2. [테스트 데이터 팩토리](#테스트-데이터-팩토리) — Factory 패턴, 결정론적 데이터
3. [Fixture 관리](#fixture-관리) — setup/teardown, 상태 격리
4. [테스트 헬퍼](#테스트-헬퍼) — 공통 어설션, 커스텀 matcher
5. [CI 통합 설정](#ci-통합-설정) — 병렬 실행, retry, 리포트
6. [테스트 코드 품질 규칙](#테스트-코드-품질-규칙) — lint, 리뷰 기준
7. [테스트 자동화 성숙도 모델](#테스트-자동화-성숙도-모델) — Level 0~4 평가
8. [체크리스트](#체크리스트)

***

## 테스트 프레임워크 설계 원칙

좋은 테스트 프레임워크는 프로덕션 코드와 같은 품질 기준을 적용한다. DRY, 가독성, 유지보수성.

### 디렉토리 구조

```
project/
├── src/
│   ├── components/
│   │   ├── Button.tsx
│   │   └── Button.test.tsx          # 단위 테스트 (코로케이션)
│   ├── services/
│   │   ├── user-service.ts
│   │   └── user-service.test.ts
│   └── utils/
│       ├── format.ts
│       └── format.test.ts
├── test/
│   ├── fixtures/                     # 테스트 데이터
│   │   ├── users.json
│   │   └── products.json
│   ├── factories/                    # 테스트 데이터 팩토리
│   │   ├── user-factory.ts
│   │   └── product-factory.ts
│   ├── helpers/                      # 테스트 유틸리티
│   │   ├── db.ts
│   │   ├── auth.ts
│   │   └── render.tsx
│   ├── mocks/                        # 모킹
│   │   ├── handlers.ts (MSW)
│   │   └── server.ts
│   └── integration/                  # 통합 테스트
│       ├── api/
│       └── services/
├── e2e/                              # E2E 테스트
│   ├── pages/                        # Page Objects
│   ├── fixtures/                     # Playwright fixtures
│   └── specs/
├── vitest.config.ts
└── playwright.config.ts
```

### 코로케이션 vs 분리

| 전략           | 장점                               | 단점          |
| ------------ | -------------------------------- | ----------- |
| 코로케이션 (소스 옆) | 관련 파일 함께, 찾기 쉬움                  | 소스 디렉토리가 복잡 |
| 분리 (test/)   | 깔끔한 소스 디렉토리                      | 파일 왔다갔다     |
| 하이브리드        | Unit은 코로케이션, Integration/E2E는 분리 | 규칙 필요       |

**추천: 하이브리드.** 단위 테스트는 소스 파일 옆에, 통합/E2E 테스트는 별도 디렉토리에.

## 테스트 데이터 팩토리

### 팩토리 패턴

```typescript
// test/factories/user-factory.ts
import { faker } from '@faker-js/faker';
import type { User, CreateUserInput } from '@/types';

let sequence = 0;

export function createUserInput(
  overrides: Partial<CreateUserInput> = {}
): CreateUserInput {
  sequence++;
  return {
    name: faker.person.fullName(),
    email: `test-${sequence}-${Date.now()}@test.com`,
    password: 'TestPassword123!',
    ...overrides,
  };
}

export function createUser(overrides: Partial<User> = {}): User {
  return {
    id: crypto.randomUUID(),
    name: faker.person.fullName(),
    email: faker.internet.email(),
    role: 'member',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// 관계가 있는 데이터
export function createUserWithOrders(
  userOverrides: Partial<User> = {},
  orderCount = 3
) {
  const user = createUser(userOverrides);
  const orders = Array.from({ length: orderCount }, () =>
    createOrder({ userId: user.id })
  );
  return { user, orders };
}
```

### 빌더 패턴 (복잡한 객체)

```typescript
// test/factories/order-builder.ts
class OrderBuilder {
  private order: Partial<Order> = {
    id: crypto.randomUUID(),
    status: 'CREATED',
    items: [],
    createdAt: new Date(),
  };

  withUser(userId: string) {
    this.order.userId = userId;
    return this;
  }

  withItem(product: Product, quantity = 1) {
    this.order.items!.push({ productId: product.id, quantity, price: product.price });
    return this;
  }

  withStatus(status: OrderStatus) {
    this.order.status = status;
    return this;
  }

  paid() {
    this.order.status = 'PAID';
    this.order.paidAt = new Date();
    return this;
  }

  shipped() {
    return this.paid().withStatus('SHIPPING');
  }

  build(): Order {
    if (!this.order.userId) throw new Error('userId is required');
    if (!this.order.items?.length) throw new Error('At least one item required');
    return this.order as Order;
  }
}

// 사용
const order = new OrderBuilder()
  .withUser('user-1')
  .withItem(product, 2)
  .paid()
  .build();
```

## Fixture 관리

### Playwright Fixtures

```typescript
// e2e/fixtures/index.ts
import { test as base } from '@playwright/test';
import { LoginPage } from '../pages/login-page';
import { DashboardPage } from '../pages/dashboard-page';

type TestFixtures = {
  loginPage: LoginPage;
  dashboardPage: DashboardPage;
  authenticatedPage: Page;
};

export const test = base.extend<TestFixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },

  authenticatedPage: async ({ page }, use) => {
    // 자동으로 로그인된 상태의 페이지
    await page.goto('/login');
    await page.getByLabel('이메일').fill('test@test.com');
    await page.getByLabel('비밀번호').fill('password123');
    await page.getByRole('button', { name: '로그인' }).click();
    await page.waitForURL('/dashboard');
    await use(page);
  },
});

// 사용
test('로그인 후 대시보드 표시', async ({ authenticatedPage }) => {
  await expect(authenticatedPage.getByText('환영합니다')).toBeVisible();
});
```

### Vitest Fixtures (setup 파일)

```typescript
// test/helpers/setup.ts
import { beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { handlers } from '../mocks/handlers';

export const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

## 테스트 헬퍼

### 커스텀 렌더러 (React Testing Library)

```typescript
// test/helpers/render.tsx
import { render, type RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/providers/theme';
import { AuthProvider } from '@/providers/auth';

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  user?: User;
  theme?: 'light' | 'dark';
}

export function renderWithProviders(
  ui: React.ReactElement,
  options: CustomRenderOptions = {}
) {
  const { user, theme = 'light', ...renderOptions } = options;
  const queryClient = createTestQueryClient();

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={theme}>
          <AuthProvider user={user}>
            {children}
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    );
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
    queryClient,
  };
}
```

### 커스텀 Matchers

```typescript
// test/helpers/matchers.ts
import { expect } from 'vitest';

expect.extend({
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    return {
      pass,
      message: () =>
        `expected ${received} ${pass ? 'not ' : ''}to be within range ${floor}-${ceiling}`,
    };
  },

  toMatchApiError(received: any, code: string, status: number) {
    const pass = received.error?.code === code && received.status === status;
    return {
      pass,
      message: () =>
        `expected API error with code "${code}" and status ${status}`,
    };
  },
});
```

## CI 통합 설정

### Vitest CI 설정

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    reporters: process.env.CI
      ? ['default', 'json', 'junit']
      : ['default'],
    outputFile: {
      json: './test-results/results.json',
      junit: './test-results/junit.xml',
    },
    pool: 'forks', // CI에서 안정성 향상
    poolOptions: {
      forks: { minForks: 1, maxForks: 4 },
    },
  },
});
```

## 테스트 코드 품질 규칙

### ESLint 테스트 규칙

```javascript
// .eslintrc.js
module.exports = {
  overrides: [
    {
      files: ['**/*.test.ts', '**/*.spec.ts'],
      // 패키지는 @vitest/eslint-plugin (v1.0+), 플러그인 이름은 'vitest' 유지.
      // 기존 eslint-plugin-vitest는 @vitest/eslint-plugin으로 공식 이관됨 (requires ESLint 9+).
      plugins: ['vitest'],
      rules: {
        'vitest/no-disabled-tests': 'warn',
        'vitest/no-focused-tests': 'error', // .only 금지
        'vitest/no-identical-title': 'error',
        'vitest/expect-expect': 'error', // assert 없는 테스트 금지
        'vitest/no-conditional-tests': 'warn',
      },
    },
  ],
};
```

## 테스트 자동화 성숙도 모델

| 레벨      | 설명                 | 특징                       |
| ------- | ------------------ | ------------------------ |
| 1 — 초기  | 수동 테스트만            | 테스트 계획 없음                |
| 2 — 기반  | 일부 단위 테스트          | CI 없음, 로컬 실행             |
| 3 — 통합  | Unit + Integration | CI에서 자동 실행               |
| 4 — 포괄  | 모든 레벨 자동화          | E2E, Visual, Performance |
| 5 — 최적화 | 메트릭 기반 개선          | 테스트 ROI 측정, 자동 리포팅       |

## 체크리스트

* [ ] 테스트 디렉토리 구조가 일관적인가
* [ ] 팩토리/빌더로 테스트 데이터를 생성하는가
* [ ] 공통 설정이 fixture/helper로 추출되었는가
* [ ] 커스텀 렌더러가 모든 Provider를 포함하는가
* [ ] CI에서 테스트가 안정적으로 실행되는가
* [ ] 테스트 리포트가 자동 생성되는가
* [ ] 테스트 코드에도 린트 규칙이 적용되는가