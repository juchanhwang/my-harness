# Component Testing Patterns

RTL 컴포넌트 테스트 코드 패턴 모음.

## Table of Contents

- [Custom Render Setup](#custom-render-setup)
- [폼 테스트](#폼-테스트)
- [모달/다이얼로그 테스트](#모달다이얼로그-테스트)
- [리스트/테이블 테스트](#리스트테이블-테스트)
- [커스텀 훅 테스트](#커스텀-훅-테스트)
- [에러 바운더리 테스트](#에러-바운더리-테스트)
- [조건부 렌더링 테스트](#조건부-렌더링-테스트)
- [Debounce/Throttle 테스트](#debouncethrottle-테스트)
- [Intersection Observer 테스트](#intersection-observer-테스트)
- [Test Factory 패턴](#test-factory-패턴)

---

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

---

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

### Select/Dropdown

```tsx
it('카테고리를 선택하면 선택된 값이 표시된다', async () => {
  render(<CategoryFilter />);
  const user = userEvent.setup();

  await user.selectOptions(
    screen.getByRole('combobox', { name: '카테고리' }),
    '기술',
  );

  expect(screen.getByRole('combobox', { name: '카테고리' })).toHaveValue('tech');
});
```

---

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

---

## 리스트/테이블 테스트

```tsx
describe('UserTable', () => {
  it('사용자 목록이 테이블에 표시된다', () => {
    const users = [
      createUser({ name: '김철수' }),
      createUser({ name: '이영희' }),
    ];
    render(<UserTable users={users} />);

    const rows = screen.getAllByRole('row');
    // 헤더 행 + 데이터 행 2개
    expect(rows).toHaveLength(3);
    expect(screen.getByRole('cell', { name: '김철수' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '이영희' })).toBeInTheDocument();
  });

  it('빈 목록이면 안내 메시지가 표시된다', () => {
    render(<UserTable users={[]} />);

    expect(screen.getByText('등록된 사용자가 없습니다')).toBeInTheDocument();
  });
});
```

### within으로 특정 행 내 요소 검증

```tsx
it('각 행에 수정 버튼이 있다', () => {
  const users = [createUser({ name: '김철수' }), createUser({ name: '이영희' })];
  render(<UserTable users={users} />);

  const row = screen.getByRole('row', { name: /김철수/ });
  expect(within(row).getByRole('button', { name: '수정' })).toBeInTheDocument();
});
```

---

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

---

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

---

## 조건부 렌더링 테스트

```tsx
describe('AuthGuard', () => {
  it('로그인 상태이면 children을 렌더링한다', () => {
    // 로그인 상태를 설정하는 Provider 또는 Mock
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

---

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

---

## Intersection Observer 테스트

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

---

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
