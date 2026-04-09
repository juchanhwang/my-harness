# MSW v2 패턴

MSW (Mock Service Worker) v2를 활용한 네트워크 모킹 패턴.

***

## 목차

1. [MSW v2 설정](#msw-v2-설정) — setupServer, 전역 lifecycle은 vitest-setup SSOT
2. [핸들러 작성](#핸들러-작성) — http/HttpResponse v2 문법
3. [핸들러 Co-location](#핸들러-co-location) — feature별 handlers, 디렉토리 구조
4. [Vitest 통합](#vitest-통합)
5. [에러/지연 시나리오](#에러지연-시나리오)
6. [테스트별 핸들러 오버라이드](#테스트별-핸들러-오버라이드)
7. [인증 시나리오](#인증-시나리오)
8. [타입 안전한 핸들러](#타입-안전한-핸들러)

***

## MSW v2 설정

설치:

```bash
pnpm add -D msw
```

서버 설정 (Node.js — Vitest용):

```tsx
// src/mocks/server.ts
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
```

Vitest 글로벌 설정:

`beforeAll/afterEach/afterAll`로 `server.listen/resetHandlers/close`를 등록하는 전역 lifecycle은 `testing-vitest-setup.md` §vitest.setup.ts 참조.

> **`onUnhandledRequest: 'error'`**: 핸들러가 없는 요청이 발생하면 에러를 던진다. 누락된 모킹을 즉시 발견할 수 있다.

***

## 핸들러 작성

MSW v2 문법 (v1과 다름에 주의):

```tsx
// src/mocks/handlers.ts
import { http, HttpResponse } from 'msw';

export const handlers = [
  // GET 요청
  http.get('/api/users', () => {
    return HttpResponse.json([
      { id: '1', name: '홍길동', email: 'hong@example.com' },
      { id: '2', name: '이영희', email: 'lee@example.com' },
    ]);
  }),

  // GET with path parameter
  http.get('/api/users/:id', ({ params }) => {
    const { id } = params;
    return HttpResponse.json({
      id,
      name: '홍길동',
      email: 'hong@example.com',
    });
  }),

  // POST 요청
  http.post('/api/users', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json(
      { id: '3', ...body },
      { status: 201 },
    );
  }),

  // DELETE 요청
  http.delete('/api/users/:id', () => {
    return new HttpResponse(null, { status: 204 });
  }),
];
```

v1 → v2 마이그레이션 주의:

```tsx
// ❌ v1 (더 이상 사용하지 않음)
rest.get('/api/users', (req, res, ctx) => {
  return res(ctx.json(users));
});

// ✅ v2 (현재 방식)
http.get('/api/users', () => {
  return HttpResponse.json(users);
});
```

***

## 핸들러 Co-location

기능(feature) 디렉토리에 핸들러를 co-locate하고, 루트에서 합친다.

`mocks/` 디렉토리 전체 구조(`vitest.config.ts`, `vitest.setup.ts`, `src/test-utils.tsx`, `src/test/factories.ts`, `src/mocks/` 포함)는 `testing-vitest-setup.md` §디렉토리 구조 참조.

```tsx
// src/features/users/api/handlers.ts
import { http, HttpResponse } from 'msw';
import { createUser, createUsers } from '@/test/factories';

export const userHandlers = [
  http.get('/api/users', () => {
    return HttpResponse.json(createUsers(5));
  }),

  http.get('/api/users/:id', ({ params }) => {
    return HttpResponse.json(createUser({ id: params.id as string }));
  }),

  http.post('/api/users', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json(createUser(body), { status: 201 });
  }),
];
```

```tsx
// src/mocks/handlers.ts
import { userHandlers } from '@/features/users/api/handlers';
import { postHandlers } from '@/features/posts/api/handlers';

export const handlers = [
  ...userHandlers,
  ...postHandlers,
];
```

***

## Vitest 통합

테스트 내에서 MSW 핸들러와 함께 RTL 사용:

```tsx
import { render, screen } from '@/test-utils';

describe('UserList', () => {
  // 기본 핸들러(handlers.ts)가 이미 server에 등록된 상태

  it('사용자 목록을 불러와서 표시한다', async () => {
    render(<UserList />);

    // findBy: 비동기 렌더링 대기
    expect(await screen.findByText('홍길동')).toBeInTheDocument();
    expect(await screen.findByText('이영희')).toBeInTheDocument();
  });
});
```

***

## 에러/지연 시나리오

### 서버 에러 시뮬레이션

```tsx
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/server';

it('서버 에러 시 에러 메시지가 표시된다', async () => {
  // 이 테스트에서만 에러 응답 반환
  server.use(
    http.get('/api/users', () => {
      return HttpResponse.json(
        { message: '서버 오류가 발생했습니다' },
        { status: 500 },
      );
    }),
  );

  render(<UserList />);

  expect(await screen.findByText('서버 오류가 발생했습니다')).toBeInTheDocument();
});
```

### 네트워크 에러 시뮬레이션

```tsx
it('네트워크 에러 시 재시도 버튼이 표시된다', async () => {
  server.use(
    http.get('/api/users', () => {
      return HttpResponse.error(); // 네트워크 에러
    }),
  );

  render(<UserList />);

  expect(await screen.findByRole('button', { name: '다시 시도' })).toBeInTheDocument();
});
```

### 로딩 지연 시뮬레이션

```tsx
import { delay } from 'msw';

it('로딩 중 스켈레톤이 표시된다', async () => {
  server.use(
    http.get('/api/users', async () => {
      await delay(1000); // 1초 지연
      return HttpResponse.json(createUsers(5));
    }),
  );

  render(<UserList />);

  // 스켈레톤 확인
  expect(screen.getByTestId('user-list-skeleton')).toBeInTheDocument();

  // 데이터 로드 후 스켈레톤 사라짐
  await waitFor(() => {
    expect(screen.queryByTestId('user-list-skeleton')).not.toBeInTheDocument();
  });
});
```

### 무한 로딩 (로딩 UI 테스트용)

```tsx
it('로딩 중 스피너가 표시된다', async () => {
  server.use(
    http.get('/api/users', async () => {
      await delay('infinite'); // 영원히 대기 — 응답 안 옴
      return HttpResponse.json([]);
    }),
  );

  render(<UserList />);

  expect(screen.getByRole('progressbar')).toBeInTheDocument();
});
```

***

## 테스트별 핸들러 오버라이드

`server.use()`로 특정 테스트에서만 핸들러를 덮어쓴다. `afterEach`에서 `server.resetHandlers()`가 호출되므로 다른 테스트에 영향 없음.

```tsx
describe('UserProfile', () => {
  it('사용자 정보를 표시한다', async () => {
    // 기본 핸들러 사용
    render(<UserProfile userId="1" />);
    expect(await screen.findByText('홍길동')).toBeInTheDocument();
  });

  it('사용자를 찾을 수 없으면 404 메시지가 표시된다', async () => {
    // 이 테스트에서만 404 응답
    server.use(
      http.get('/api/users/:id', () => {
        return HttpResponse.json(
          { message: '사용자를 찾을 수 없습니다' },
          { status: 404 },
        );
      }),
    );

    render(<UserProfile userId="999" />);
    expect(await screen.findByText('사용자를 찾을 수 없습니다')).toBeInTheDocument();
  });
});
```

***

## 인증 시나리오

```tsx
// 인증 관련 핸들러
export const authHandlers = [
  http.post('/api/login', async ({ request }) => {
    const { email, password } = await request.json();

    if (email === 'test@example.com' && password === 'password123') {
      return HttpResponse.json({
        token: 'mock-jwt-token',
        user: createUser({ email }),
      });
    }

    return HttpResponse.json(
      { message: '이메일 또는 비밀번호가 잘못되었습니다' },
      { status: 401 },
    );
  }),

  http.get('/api/me', ({ request }) => {
    const authHeader = request.headers.get('Authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      return HttpResponse.json(
        { message: '인증이 필요합니다' },
        { status: 401 },
      );
    }

    return HttpResponse.json(createUser());
  }),
];
```

***

## 타입 안전한 핸들러

API 응답 타입을 공유하여 핸들러와 실제 코드의 타입 일관성을 보장한다.

```tsx
// types/api.ts
export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'member';
}

export interface ApiError {
  message: string;
}

// handlers
import type { User } from '@/types/api';

http.get('/api/users', () => {
  const users: User[] = [
    createUser({ role: 'admin' }),
    createUser({ role: 'member' }),
  ];
  return HttpResponse.json(users);
});
```

> 핸들러의 응답 타입과 프론트엔드 코드의 기대 타입이 일치하지 않으면, 테스트는 통과하지만 실제 환경에서 실패하는 위험이 있다. 타입을 공유하여 이 갭을 최소화한다.

***

> 관련: [testing.md](testing.md) · [testing-vitest-setup.md](testing-vitest-setup.md)
