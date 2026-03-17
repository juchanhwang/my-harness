# Next.js App Router Testing Patterns

Next.js App Router 환경 특화 테스트 전략과 패턴.

## Table of Contents

- [테스트 전략: 무엇을 어떻게 테스트할 것인가](#테스트-전략-무엇을-어떻게-테스트할-것인가)
- [next/navigation 모킹](#nextnavigation-모킹)
- [Server Component 테스트](#server-component-테스트)
- [Server Actions 테스트](#server-actions-테스트)
- [Middleware 테스트](#middleware-테스트)
- [next/image, next/link 처리](#nextimage-nextlink-처리)
- [Route Handler 테스트](#route-handler-테스트)
- [Playwright E2E 패턴](#playwright-e2e-패턴)

---

## 테스트 전략: 무엇을 어떻게 테스트할 것인가

| 대상 | 테스트 방식 | 이유 |
|------|-------------|------|
| **Server Component** | E2E (Playwright) | RSC는 서버에서만 렌더링, RTL로 직접 테스트 곤란 |
| **Client Component** | RTL + Vitest | 브라우저 환경 시뮬레이션으로 충분 |
| **Server Actions** | Unit Test (Vitest) | 순수 함수처럼 입력/출력 검증 |
| **Route Handler** | Unit Test (Vitest) | Request/Response 직접 생성하여 테스트 |
| **Middleware** | Unit Test + E2E | 단순 로직은 Unit, 리다이렉트/리라이트는 E2E |
| **페이지 라우팅** | E2E (Playwright) | 실제 브라우저에서만 확인 가능 |
| **데이터 패칭** | MSW + RTL 또는 E2E | Client fetch는 MSW, Server fetch는 E2E |

> **핵심**: Server Component의 렌더링 결과와 데이터 패칭은 **E2E로 커버**하는 것이 가장 실용적이다. 억지로 RTL 테스트를 작성하면 환경 설정에 더 많은 시간을 쏟게 된다.

---

## next/navigation 모킹

App Router의 `useRouter`, `usePathname`, `useSearchParams`를 사용하는 Client Component 테스트 시 필수.

### 글로벌 모킹 (vitest.setup.ts)

```tsx
// vitest.setup.ts
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  })),
  usePathname: vi.fn(() => '/'),
  useSearchParams: vi.fn(() => new URLSearchParams()),
  useParams: vi.fn(() => ({})),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));
```

### 테스트별 오버라이드

```tsx
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

describe('Navigation', () => {
  it('검색어를 입력하면 쿼리 파라미터가 업데이트된다', async () => {
    const pushMock = vi.fn();
    vi.mocked(useRouter).mockReturnValue({
      push: pushMock,
      replace: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    });
    vi.mocked(usePathname).mockReturnValue('/search');
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams());

    render(<SearchBar />);
    const user = userEvent.setup();

    await user.type(screen.getByRole('searchbox'), 'react');
    await user.click(screen.getByRole('button', { name: '검색' }));

    expect(pushMock).toHaveBeenCalledWith('/search?q=react');
  });
});
```

### 현재 경로에 따른 UI 분기 테스트

```tsx
describe('NavigationMenu', () => {
  it('현재 경로의 메뉴 항목이 활성화된다', () => {
    vi.mocked(usePathname).mockReturnValue('/about');

    render(<NavigationMenu />);

    const aboutLink = screen.getByRole('link', { name: '소개' });
    expect(aboutLink).toHaveAttribute('aria-current', 'page');
  });
});
```

---

## Server Component 테스트

### 원칙: E2E로 커버

Server Component는 서버에서 async로 실행되며, React의 클라이언트 렌더링 사이클과 다르게 동작한다. **RTL로 직접 테스트하려고 시도하지 마라.**

```tsx
// ❌ BAD: Server Component를 RTL로 테스트 시도
// async component를 render()에 전달하면 에러 발생
render(await ServerPage({ params: { id: '1' } })); // 동작하지 않음

// ✅ GOOD: Playwright E2E로 테스트
test('상품 상세 페이지에 상품 정보가 표시된다', async ({ page }) => {
  await page.goto('/products/1');
  await expect(page.getByRole('heading', { name: '상품명' })).toBeVisible();
  await expect(page.getByText('10,000원')).toBeVisible();
});
```

### Server Component 내 로직 분리 테스트

데이터 변환 로직은 순수 함수로 추출하여 Unit Test한다.

```tsx
// utils/formatProduct.ts — 순수 함수로 추출
export function formatProductPrice(price: number): string {
  return `${price.toLocaleString('ko-KR')}원`;
}

// utils/formatProduct.test.ts — Unit Test
describe('formatProductPrice', () => {
  it('숫자를 한국 원화 형식으로 포맷한다', () => {
    expect(formatProductPrice(10000)).toBe('10,000원');
    expect(formatProductPrice(0)).toBe('0원');
    expect(formatProductPrice(1234567)).toBe('1,234,567원');
  });
});
```

---

## Server Actions 테스트

Server Actions는 `"use server"` 지시어가 있는 async 함수. 순수 함수처럼 Unit Test 가능.

```tsx
// actions/createPost.ts
'use server';

import { revalidatePath } from 'next/cache';

export async function createPost(formData: FormData) {
  const title = formData.get('title') as string;
  const content = formData.get('content') as string;

  if (!title?.trim()) {
    return { error: '제목을 입력해주세요' };
  }

  const post = await db.post.create({ data: { title, content } });
  revalidatePath('/posts');
  return { data: post };
}
```

```tsx
// actions/createPost.test.ts
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

describe('createPost', () => {
  it('제목이 비어있으면 에러를 반환한다', async () => {
    const formData = new FormData();
    formData.set('title', '');
    formData.set('content', '내용');

    const result = await createPost(formData);

    expect(result).toEqual({ error: '제목을 입력해주세요' });
  });

  it('유효한 데이터로 게시글을 생성하고 경로를 revalidate한다', async () => {
    const formData = new FormData();
    formData.set('title', '테스트 제목');
    formData.set('content', '테스트 내용');

    const result = await createPost(formData);

    expect(result.data).toMatchObject({ title: '테스트 제목' });
    expect(revalidatePath).toHaveBeenCalledWith('/posts');
  });
});
```

---

## Middleware 테스트

```tsx
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('auth-token');

  if (!token && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}
```

```tsx
// middleware.test.ts
import { middleware } from './middleware';
import { NextRequest } from 'next/server';

function createMockRequest(path: string, cookies?: Record<string, string>) {
  const url = new URL(path, 'http://localhost:3000');
  const request = new NextRequest(url);
  if (cookies) {
    Object.entries(cookies).forEach(([key, value]) => {
      request.cookies.set(key, value);
    });
  }
  return request;
}

describe('middleware', () => {
  it('인증 토큰 없이 /dashboard 접근 시 /login으로 리다이렉트한다', () => {
    const request = createMockRequest('/dashboard');
    const response = middleware(request);

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).pathname).toBe('/login');
  });

  it('인증 토큰이 있으면 통과한다', () => {
    const request = createMockRequest('/dashboard', { 'auth-token': 'valid' });
    const response = middleware(request);

    expect(response.status).toBe(200);
  });

  it('공개 경로는 토큰 없이도 통과한다', () => {
    const request = createMockRequest('/about');
    const response = middleware(request);

    expect(response.status).toBe(200);
  });
});
```

---

## next/image, next/link 처리

### next/image 모킹

```tsx
// vitest.setup.ts
vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...props} />;
  },
}));
```

### next/link 모킹

next/link는 일반적으로 모킹 불필요. `<a>` 태그로 렌더링되므로 role `link`로 검증.

```tsx
it('로고를 클릭하면 홈으로 이동하는 링크다', () => {
  render(<Header />);

  const homeLink = screen.getByRole('link', { name: '홈으로' });
  expect(homeLink).toHaveAttribute('href', '/');
});
```

---

## Route Handler 테스트

```tsx
// app/api/users/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  const users = await db.user.findMany();
  return NextResponse.json(users);
}

export async function POST(request: Request) {
  const body = await request.json();
  const user = await db.user.create({ data: body });
  return NextResponse.json(user, { status: 201 });
}
```

```tsx
// app/api/users/route.test.ts
describe('GET /api/users', () => {
  it('사용자 목록을 반환한다', async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toBeInstanceOf(Array);
  });
});

describe('POST /api/users', () => {
  it('새 사용자를 생성하고 201을 반환한다', async () => {
    const request = new Request('http://localhost/api/users', {
      method: 'POST',
      body: JSON.stringify({ name: '홍길동', email: 'hong@test.com' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data).toMatchObject({ name: '홍길동' });
  });
});
```

---

## Playwright E2E 패턴

### 페이지 네비게이션 테스트

```tsx
import { test, expect } from '@playwright/test';

test.describe('메인 네비게이션', () => {
  test('홈 → 소개 페이지로 이동할 수 있다', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: '소개' }).click();

    await expect(page).toHaveURL('/about');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('소개');
  });
});
```

### 인증 플로우 테스트

```tsx
test.describe('로그인 플로우', () => {
  test('유효한 자격 증명으로 로그인하면 대시보드로 이동한다', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('이메일').fill('test@example.com');
    await page.getByLabel('비밀번호').fill('password123');
    await page.getByRole('button', { name: '로그인' }).click();

    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByText('환영합니다')).toBeVisible();
  });

  test('잘못된 자격 증명이면 에러 메시지가 표시된다', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('이메일').fill('wrong@example.com');
    await page.getByLabel('비밀번호').fill('wrong');
    await page.getByRole('button', { name: '로그인' }).click();

    await expect(page.getByRole('alert')).toHaveText('이메일 또는 비밀번호가 잘못되었습니다');
  });
});
```

### Page Object Model (POM)

반복되는 페이지 조작을 클래스로 추상화한다.

```tsx
// e2e/pages/LoginPage.ts
import { type Page, type Locator, expect } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByLabel('이메일');
    this.passwordInput = page.getByLabel('비밀번호');
    this.submitButton = page.getByRole('button', { name: '로그인' });
  }

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }
}

// e2e/tests/login.spec.ts
test('로그인 성공', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login('test@example.com', 'password123');

  await expect(page).toHaveURL('/dashboard');
});
```
