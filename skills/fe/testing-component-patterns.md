# Component Testing Patterns

RTL 컴포넌트 테스트 코드 패턴 모음.

***

## 목차

1. [Custom Render Setup](#custom-render-setup) — test-utils.tsx, QueryClientProvider 격리
2. [폼 테스트](#폼-테스트)
3. [모달/다이얼로그 테스트](#모달다이얼로그-테스트)
4. [리스트/테이블 테스트](#리스트테이블-테스트)
5. [커스텀 훅 테스트](#커스텀-훅-테스트)
6. [에러 바운더리 테스트](#에러-바운더리-테스트)
7. [조건부 렌더링 테스트](#조건부-렌더링-테스트)
8. [Debounce/Throttle 테스트](#debouncethrottle-테스트)
9. [Intersection Observer 테스트](#intersection-observer-테스트)
10. [Test Factory 패턴](#test-factory-패턴)

***

## Custom Render Setup

모든 테스트의 기반이 되는 커스텀 render. **테스트마다 새 QueryClient를 생성**하여 격리를 보장한다.

```tsx
// src/test-utils.tsx
import { render, type RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
}

function AllProviders({ children }: { children: React.ReactNode }) {
  const queryClient = createTestQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      {/*
        프로젝트에 따라 아래 Provider를 추가한다 — 순서는 실제 앱의 layout.tsx /
        app/providers.tsx가 감싸는 순서를 그대로 반영하면 된다. 누락 시 context를 읽는
        hook(useTheme, useOverlay 등)이 undefined를 반환하거나 throw한다.
        - next-themes:    <ThemeProvider attribute="class">
        - overlay-kit:    <OverlayProvider />
        - nuqs:           <NuqsAdapter>
        - i18n:           <I18nProvider lang="ko">
        Zustand는 글로벌 store를 쓰는 한 provider가 필요 없다.
      */}
      {children}
    </QueryClientProvider>
  );
}

function customRender(ui: React.ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, { wrapper: AllProviders, ...options });
}

export { customRender as render };
export { screen, within, waitFor } from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';
```

> **주의**: `QueryClient`를 전역으로 공유하면 테스트 간 캐시가 오염된다. 반드시 테스트마다 새로 생성.

***

## 폼 테스트

### 기본 폼 입력 + 제출

```tsx
describe('LoginForm', () => {
  it('유효한 입력 후 제출하면 onSubmit이 호출된다', async () => {
    const handleSubmit = vi.fn();
    render(<LoginForm onSubmit={handleSubmit} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('이메일'), 'test@example.com');
    await user.type(screen.getByLabelText('비밀번호'), 'password123');
    await user.click(screen.getByRole('button', { name: '로그인' }));

    expect(handleSubmit).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123',
    });
  });

  it('이메일이 비어있으면 에러 메시지가 표시된다', async () => {
    render(<LoginForm onSubmit={vi.fn()} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '로그인' }));

    expect(screen.getByRole('alert')).toHaveTextContent('이메일을 입력해주세요');
  });
});
```

### 비동기 폼 제출 (API 연동)

```tsx
it('제출 중 로딩 상태가 표시되고, 성공 후 성공 메시지가 나타난다', async () => {
  // MSW에서 POST /api/login 핸들러가 설정된 상태
  render(<LoginForm />);
  const user = userEvent.setup();

  await user.type(screen.getByLabelText('이메일'), 'test@example.com');
  await user.type(screen.getByLabelText('비밀번호'), 'password123');
  await user.click(screen.getByRole('button', { name: '로그인' }));

  // 로딩 상태 확인
  expect(screen.getByRole('button', { name: '로그인' })).toBeDisabled();

  // 성공 메시지 대기
  expect(await screen.findByText('로그인 성공')).toBeInTheDocument();
});
```

***

## 모달/다이얼로그 테스트

```tsx
describe('DeleteConfirmDialog', () => {
  it('삭제 버튼을 클릭하면 확인 다이얼로그가 열린다', async () => {
    render(<ItemCard item={createItem()} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '삭제' }));

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('정말 삭제하시겠습니까?')).toBeInTheDocument();
  });

  it('취소 버튼을 클릭하면 다이얼로그가 닫힌다', async () => {
    render(<ItemCard item={createItem()} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '삭제' }));
    await user.click(screen.getByRole('button', { name: '취소' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('확인 버튼을 클릭하면 onDelete가 호출된다', async () => {
    const handleDelete = vi.fn();
    render(<ItemCard item={createItem()} onDelete={handleDelete} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '삭제' }));
    await user.click(screen.getByRole('button', { name: '확인' }));

    expect(handleDelete).toHaveBeenCalledOnce();
  });
});
```

***

## 리스트/테이블 테스트

> "배열을 받아 그대로 `<tr>`에 뿌린다"만 검증하는 건 `testing.md` §3.2 Don't "순수 JSX
> 배치"에 해당한다 — 타입체커·Storybook으로 커버된다. 아래 패턴은 **빈 상태 분기**나
> **행마다 다른 UI(`within` 필요)** 같이 행동이 있을 때만 적용한다.

```tsx
describe('UserTable', () => {
  it('빈 목록이면 안내 메시지가 표시된다', () => {
    render(<UserTable users={[]} />);

    expect(screen.getByText('등록된 사용자가 없습니다')).toBeInTheDocument();
  });
});
```

### within으로 특정 행 내 요소 검증

행마다 다른 UI가 나타날 때 `screen.getByRole('button')`은 "버튼이 여러 개"라 실패한다.
`within`으로 행 단위로 스코프를 좁혀 검증한다. 모든 행에 똑같이 나타나는 요소를 검증한다면
`within`이 불필요하고, 그 테스트 자체가 §3.2 Don't에 가깝다.

```tsx
it('관리자 행에만 역할 변경 버튼이 나타난다', () => {
  const users = [
    createUser({ name: '김철수', role: 'admin' }),
    createUser({ name: '이영희', role: 'member' }),
  ];
  render(<UserTable users={users} />);

  const adminRow = screen.getByRole('row', { name: /김철수/ });
  const memberRow = screen.getByRole('row', { name: /이영희/ });

  expect(within(adminRow).getByRole('button', { name: '역할 변경' })).toBeInTheDocument();
  expect(within(memberRow).queryByRole('button', { name: '역할 변경' })).not.toBeInTheDocument();
});
```

***

## 커스텀 훅 테스트

### renderHook 기본

```tsx
import { renderHook, act } from '@testing-library/react';

describe('useCounter', () => {
  it('초기값이 0이다', () => {
    const { result } = renderHook(() => useCounter());
    expect(result.current.count).toBe(0);
  });

  it('increment를 호출하면 1 증가한다', () => {
    const { result } = renderHook(() => useCounter());

    act(() => {
      result.current.increment();
    });

    expect(result.current.count).toBe(1);
  });

  it('초기값을 지정할 수 있다', () => {
    const { result } = renderHook(() => useCounter(10));
    expect(result.current.count).toBe(10);
  });
});
```

### 비동기 훅 (TanStack Query)

```tsx
describe('useUser', () => {
  it('사용자 데이터를 반환한다', async () => {
    // MSW 핸들러가 GET /api/users/1 응답을 설정한 상태
    const { result } = renderHook(() => useUser('1'), {
      wrapper: AllProviders,
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(
      expect.objectContaining({ id: '1', name: '홍길동' }),
    );
  });
});
```

### 상태 의존 훅

```tsx
describe('useToggle', () => {
  it('toggle을 호출하면 값이 반전된다', () => {
    const { result } = renderHook(() => useToggle(false));

    expect(result.current[0]).toBe(false);

    act(() => { result.current[1](); });
    expect(result.current[0]).toBe(true);

    act(() => { result.current[1](); });
    expect(result.current[0]).toBe(false);
  });
});
```

***

## 에러 바운더리 테스트

```tsx
describe('ErrorBoundary', () => {
  // 콘솔 에러 억제 (React가 에러 바운더리에서 console.error 호출)
  const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  afterAll(() => { consoleSpy.mockRestore(); });

  it('자식에서 에러 발생 시 폴백 UI가 표시된다', () => {
    const ThrowError = () => { throw new Error('테스트 에러'); };

    render(
      <ErrorBoundary fallback={<div>문제가 발생했습니다</div>}>
        <ThrowError />
      </ErrorBoundary>,
    );

    expect(screen.getByText('문제가 발생했습니다')).toBeInTheDocument();
  });
});
```

***

## 조건부 렌더링 테스트

```tsx
describe('AuthGuard', () => {
  it('로그인 상태이면 children을 렌더링한다', () => {
    render(
      <AuthProvider value={{ isLogin: true, user: createUser() }}>
        <AuthGuard>
          <div>보호된 콘텐츠</div>
        </AuthGuard>
      </AuthProvider>,
    );

    expect(screen.getByText('보호된 콘텐츠')).toBeInTheDocument();
  });

  it('비로그인 상태이면 로그인 페이지로 리다이렉트한다', () => {
    const pushMock = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push: pushMock } as any);

    render(
      <AuthProvider value={{ isLogin: false, user: null }}>
        <AuthGuard>
          <div>보호된 콘텐츠</div>
        </AuthGuard>
      </AuthProvider>,
    );

    expect(screen.queryByText('보호된 콘텐츠')).not.toBeInTheDocument();
    expect(pushMock).toHaveBeenCalledWith('/login');
  });
});
```

***

## Debounce/Throttle 테스트

```tsx
describe('SearchInput', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('입력 후 300ms 후에 onSearch가 호출된다', async () => {
    const handleSearch = vi.fn();
    render(<SearchInput onSearch={handleSearch} debounceMs={300} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    await user.type(screen.getByRole('searchbox'), 'react');

    // 아직 호출되지 않음
    expect(handleSearch).not.toHaveBeenCalled();

    // 300ms 경과
    vi.advanceTimersByTime(300);

    expect(handleSearch).toHaveBeenCalledWith('react');
    expect(handleSearch).toHaveBeenCalledOnce();
  });
});
```

> **주의**: `vi.useFakeTimers()`와 `userEvent`를 함께 쓸 때는 `advanceTimers` 옵션을 전달해야 한다.

***

## Intersection Observer 테스트

> 전역 no-op stub은 `testing-vitest-setup.md` §vitest.setup.ts에 이미 설치되어 있어서
> `IntersectionObserver`를 쓰는 컴포넌트도 import 시점에 터지지 않는다. 아래 패턴은
> **콜백을 수동으로 트리거해야 하는 테스트**에 한정해 그 stub을 오버라이드하는 예다.
>
> 오버라이드한 mock이 다음 테스트에 누설되지 않도록, `vitest.config.ts`에
> `test.unstubGlobals: true`를 켜두거나 `afterEach(() => vi.unstubAllGlobals())`를 두는 걸
> 잊지 말 것. 동일 원칙이 `matchMedia`, `ResizeObserver`에도 적용된다.

```tsx
describe('InfiniteScrollList', () => {
  const mockIntersectionObserver = vi.fn();

  beforeEach(() => {
    mockIntersectionObserver.mockReturnValue({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    });
    vi.stubGlobal('IntersectionObserver', mockIntersectionObserver);
  });

  it('마지막 요소가 뷰포트에 진입하면 다음 페이지를 로드한다', async () => {
    render(<InfiniteScrollList />);

    // 초기 데이터 로드 확인
    expect(await screen.findByText('항목 1')).toBeInTheDocument();

    // IntersectionObserver 콜백을 수동 트리거
    const [callback] = mockIntersectionObserver.mock.calls[0];
    callback([{ isIntersecting: true }]);

    // 다음 페이지 데이터 로드 확인
    expect(await screen.findByText('항목 11')).toBeInTheDocument();
  });
});
```

***

## Test Factory 패턴

테스트 데이터를 일관되게 생성하는 Factory 함수 모음.

```tsx
// src/test/factories.ts

let idCounter = 0;
function nextId() { return `id-${++idCounter}`; }

// 기본 Factory
export function createUser(overrides?: Partial<User>): User {
  return {
    id: nextId(),
    name: '홍길동',
    email: 'hong@example.com',
    role: 'member',
    createdAt: new Date('2024-01-01').toISOString(),
    ...overrides,
  };
}

export function createItem(overrides?: Partial<Item>): Item {
  return {
    id: nextId(),
    title: '테스트 아이템',
    description: '설명입니다',
    price: 10000,
    status: 'active',
    ...overrides,
  };
}

// 리스트 Factory
export function createUsers(count: number, overrides?: Partial<User>): User[] {
  return Array.from({ length: count }, (_, i) =>
    createUser({ name: `사용자 ${i + 1}`, ...overrides }),
  );
}

// API 응답 Factory
export function createPaginatedResponse<T>(
  items: T[],
  overrides?: Partial<PaginatedResponse<T>>,
): PaginatedResponse<T> {
  return {
    data: items,
    total: items.length,
    page: 1,
    pageSize: 10,
    hasNext: false,
    ...overrides,
  };
}
```

### 사용 예시

```tsx
it('관리자만 삭제 버튼이 보인다', () => {
  const admin = createUser({ role: 'admin' });
  const member = createUser({ role: 'member' });

  const { rerender } = render(<UserCard user={admin} />);
  expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument();

  rerender(<UserCard user={member} />);
  expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument();
});
```

***

> 관련: [testing.md](testing.md) · [testing-vitest-setup.md](testing-vitest-setup.md) · [testing-msw.md](testing-msw.md)
