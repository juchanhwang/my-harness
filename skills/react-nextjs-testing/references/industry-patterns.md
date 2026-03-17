# Industry Patterns — 국내 현업 테스트 패턴

토스/배민/당근 오픈소스 및 테크 블로그에서 추출한 실사용 패턴.

## Table of Contents

- [토스: renderWithUser 유틸리티](#토스-renderwithuser-유틸리티)
- [토스: Throw/Suspend 테스트 헬퍼](#토스-throwsuspend-테스트-헬퍼)
- [토스: async Server Component 직접 await](#토스-async-server-component-직접-await)
- [배민: customRender + 시나리오 기반 통합 테스트](#배민-customrender--시나리오-기반-통합-테스트)
- [배민: fireEvent vs userEvent 실증](#배민-fireevent-vs-userevent-실증)
- [당근: 호출 순서 검증 패턴](#당근-호출-순서-검증-패턴)
- [당근: console 경고 캡처 패턴](#당근-console-경고-캡처-패턴)
- [당근: 순수 비즈니스 로직 단위 테스트](#당근-순수-비즈니스-로직-단위-테스트)
- [네이버: 험블 객체 패턴](#네이버-험블-객체-패턴)

---

## 토스: renderWithUser 유틸리티

출처: [toss/overlay-kit — event.test.tsx](https://github.com/toss/overlay-kit)

`render()` + `userEvent.setup()`을 한 번에 합성하여 테스트 보일러플레이트를 줄인다.

```tsx
function renderWithUser<T extends React.JSX.Element>(
  component: T,
  options?: Parameters<typeof render>[1],
) {
  const user = userEvent.setup();
  return { ...render(component, { wrapper, ...options }), user };
}
```

### 실사용 — overlay.openAsync 테스트

Promise를 반환하는 UI 인터랙션 테스트 시, `vi.fn()`으로 resolve 값을 캡처하고 `waitFor`로 비동기 결과를 검증한다.

```tsx
it('overlay.openAsync에서 close에 전달된 값이 resolve로 전달된다', async () => {
  const mockFn = vi.fn();

  function Component() {
    return (
      <button
        onClick={async () => {
          const result = await overlay.openAsync<boolean>(
            ({ isOpen, close }) =>
              isOpen && <button onClick={() => close(true)}>confirm</button>,
          );
          if (result) mockFn(result);
        }}
      >
        trigger
      </button>
    );
  }

  const { user } = renderWithUser(<Component />);
  await user.click(await screen.findByRole('button', { name: 'trigger' }));
  await user.click(await screen.findByRole('button', { name: 'confirm' }));

  await waitFor(() => {
    expect(mockFn).toHaveBeenCalledWith(true);
  });
});
```

---

## 토스: Throw/Suspend 테스트 헬퍼

출처: [toss/suspensive — test-utils/index.tsx](https://github.com/toss/suspensive)

ErrorBoundary와 Suspense를 테스트하기 위한 헬퍼 컴포넌트. 지연 throw로 타이밍을 제어한다.

```tsx
// 에러를 지연 throw하는 테스트 컴포넌트
export const Throw = {
  Error: ({ message, after = 0, children }: PropsWithChildren<{
    message: string;
    after?: number;
  }>) => {
    const [isNeedThrow, setIsNeedThrow] = useState(after === 0);
    if (isNeedThrow) throw new Error(message);
    useTimeout(() => setIsNeedThrow(true), after);
    return <>{children}</>;
  },
  reset: () => { isNeedThrowGlobal.current = false; },
};

// Promise를 throw하여 Suspense를 트리거하는 컴포넌트
export const Suspend = ({ during, toShow }: {
  during: number;
  toShow: React.ReactNode;
}) => {
  if (isNeedSuspendGlobal.current) {
    throw new Promise((resolve) =>
      setTimeout(() => {
        isNeedSuspendGlobal.current = false;
        resolve('resolved');
      }, during),
    );
  }
  return toShow;
};
```

### 실사용 — ErrorBoundary 테스트

`vi.useFakeTimers()` + `act(() => vi.advanceTimersByTime(N))`으로 에러 발생 타이밍을 정밀 제어한다.

```tsx
describe('<ErrorBoundary/>', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); Throw.reset(); });

  it('에러 발생 시 fallback을 보여주고 onError를 호출한다', async () => {
    const onError = vi.fn();
    const TEXT = '정상 콘텐츠';
    const FALLBACK = '에러 발생';
    const ERROR_MESSAGE = '테스트 에러';

    render(
      <ErrorBoundary onError={onError} fallback={<>{FALLBACK}</>}>
        <Throw.Error message={ERROR_MESSAGE} after={100}>
          {TEXT}
        </Throw.Error>
      </ErrorBoundary>,
    );

    // 에러 전: 정상 콘텐츠 표시
    expect(screen.queryByText(TEXT)).toBeInTheDocument();
    expect(screen.queryByText(FALLBACK)).not.toBeInTheDocument();
    expect(onError).toHaveBeenCalledTimes(0);

    // 100ms 경과 → 에러 발생
    await act(() => vi.advanceTimersByTime(100));

    // 에러 후: fallback 표시 + onError 호출
    expect(screen.queryByText(FALLBACK)).toBeInTheDocument();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
```

> **주의**: `Throw.reset()`을 `afterEach`에서 반드시 호출하여 전역 상태를 초기화한다.

---

## 토스: async Server Component 직접 await

출처: [toss/suspensive — QueriesHydration.spec.tsx](https://github.com/toss/suspensive)

Next.js App Router의 async Server Component를 테스트할 때, 함수를 직접 `await`하여 JSX 결과를 `render()`에 전달하는 패턴.

```tsx
it('SSR 쿼리 실패 + skipSsrOnError=true → ClientOnly로 폴백한다', async () => {
  const queryClient = new QueryClient();
  const mockQueryFn = vi.fn().mockRejectedValue(new Error('Query failed'));

  // async Server Component를 직접 호출 + await
  const result = await QueriesHydration({
    queries: [{ queryKey: ['failing-query'], queryFn: mockQueryFn }],
    queryClient,
    children: <div>Test Children</div>,
  });

  // 반환된 JSX를 render()
  render(result as React.ReactElement);
  expect(screen.getByTestId('client-only')).toBeInTheDocument();
});
```

### timeout 테스트

```tsx
it('timeout 초과 시 ClientOnly로 폴백한다', async () => {
  const serverQueryClient = new QueryClient();
  const mockQueryFn = vi.fn().mockImplementation(
    () => new Promise((resolve) =>
      setTimeout(() => resolve({ data: 'test' }), 200),
    ),
  );

  const result = await QueriesHydration({
    queries: [{ queryKey: ['test'], queryFn: mockQueryFn }],
    queryClient: serverQueryClient,
    timeout: 100, // 100ms timeout — 200ms 걸리는 쿼리보다 짧음
    children: <ClientChild />,
  });

  const clientQueryClient = new QueryClient();
  render(
    <QueryClientProvider client={clientQueryClient}>
      {result}
    </QueryClientProvider>,
  );
  expect(screen.getByTestId('client-only')).toBeInTheDocument();
});
```

> 이 패턴은 Server Component 내부의 **로직 분기**를 검증할 때 유효하다. 순수 렌더링 결과 확인은 여전히 E2E가 적합.

---

## 배민: customRender + 시나리오 기반 통합 테스트

출처: [techblog.woowahan.com — 프론트엔드 통합 테스트로 더 안전한 웹 서비스 개발하기](https://techblog.woowahan.com/19509/)

### customRender — 비즈니스 컨텍스트를 포함한 래핑

```tsx
// testUtils.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MyContextProviders } from './MyContextProviders';

interface CustomOptions {
  orderAmount: number;
}

export const customRender = (
  ui: React.ReactElement,
  { orderAmount, ...options }: CustomOptions & RenderOptions,
) =>
  render(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })}>
        <MyContextProviders orderAmount={orderAmount}>
          {children}
        </MyContextProviders>
      </QueryClientProvider>
    ),
    ...options,
  });
```

### 멀티 API 복합 시나리오 테스트

여러 API 응답이 얽힌 복합 시나리오를 하나의 통합 테스트로 검증한다.

```tsx
describe('포인트 + 쿠폰 사용 시나리오', () => {
  it('쿠폰 적용 시 이미 입력된 포인트 금액이 재계산된다', async () => {
    const user = userEvent.setup();

    // 여러 API를 동시에 모킹
    server.use(
      http.get('/api/coupon', () =>
        HttpResponse.json({
          coupons: [{ couponName: '1만원 할인쿠폰', discountAmount: 10_000 }],
        }),
      ),
      http.get('/api/point', () =>
        HttpResponse.json({ availablePoint: 10_000 }),
      ),
    );

    customRender(<DiscountMethods />, { orderAmount: 15_000 });

    // 초기 데이터 로드 확인
    await screen.findByText('사용 가능 포인트: 10,000원');
    await screen.findByText('사용 가능한 쿠폰: 1개');

    // 포인트 입력
    const input = screen.getByPlaceholderText('사용할 포인트 금액을 입력해주세요');
    await user.type(input, '10000');
    await screen.findByText('적용 포인트: 10,000원');

    // 쿠폰 적용 → 포인트 자동 재계산
    await user.click(screen.getByText('1만원 할인쿠폰'));
    await screen.findByText('쿠폰 할인 금액: 10,000원');
    await screen.findByText('포인트 사용금액이 변경되었어요');
    await screen.findByText('적용 포인트: 5,000원'); // 15,000 - 10,000(쿠폰) = 5,000
  });
});
```

> **핵심**: 단위별로 쪼개는 것보다 사용자의 실제 행동 흐름을 하나의 테스트에 담는 것이 통합 테스트의 강점.

---

## 배민: fireEvent vs userEvent 실증

```tsx
// ❌ fireEvent — disabled 인풋에서도 onChange가 호출됨 (비현실적)
it('fireEvent는 disabled에서도 동작한다', () => {
  render(<input disabled onChange={onChangeHandler} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Hello' } });
  expect(onChangeHandler).toBeCalled(); // 실제로는 불가능한 동작
});

// ✅ userEvent — disabled 인풋에서 입력 불가 (현실적)
it('userEvent는 disabled에서 동작하지 않는다', async () => {
  const user = userEvent.setup();
  render(<input disabled onChange={onChangeHandler} />);
  await user.type(screen.getByRole('textbox'), 'Hello');
  expect(onChangeHandler).not.toBeCalled(); // 올바른 동작
});
```

> `fireEvent`는 DOM 이벤트만 발생시키고, `userEvent`는 브라우저의 실제 이벤트 시퀀스를 재현한다. disabled, readonly 등 제약 조건도 반영된다.

---

## 당근: 호출 순서 검증 패턴

출처: [daangn/seed-design — useControllableState.test.tsx](https://github.com/daangn/seed-design)

연속 인터랙션에서 콜백 호출의 **순서와 인수**를 동시에 검증한다.

```tsx
it('연속 인터랙션 시 onChange 호출 순서와 값을 정확히 검증한다', async () => {
  const onChange = vi.fn();
  render(<ControlledToggleWithDetails onChange={onChange} />);

  await userEvent.click(screen.getByRole('button', { name: 'toggle with details' }));
  await userEvent.click(screen.getByRole('button', { name: 'close' }));
  await userEvent.click(screen.getByRole('button', { name: 'toggle without details' }));

  await waitFor(() => {
    expect(onChange).toHaveBeenNthCalledWith(1, true, 'trigger');
    expect(onChange).toHaveBeenNthCalledWith(2, false, 'closeButton');
    expect(onChange).toHaveBeenNthCalledWith(3, true, undefined);
  });
});
```

> `toHaveBeenCalledWith`는 "한 번이라도 이 인수로 호출됐는가"를 검증하지만, `toHaveBeenNthCalledWith(n, ...)`은 **n번째 호출의 정확한 인수**를 검증한다.

---

## 당근: console 경고 캡처 패턴

```tsx
describe('controlled → uncontrolled 전환 경고', () => {
  const consoleMock = vi.spyOn(console, 'warn').mockImplementation(() => void 0);
  afterAll(() => consoleMock.mockReset());

  it('경고를 발생시킨다', async () => {
    render(<UnstableComponent defaultChecked />);
    await userEvent.click(screen.getByText('Clear value'));

    await waitFor(() => {
      expect(consoleMock).toHaveBeenLastCalledWith(
        'Checkbox is changing from controlled to uncontrolled...',
      );
    });
  });
});
```

> `vi.spyOn(console, 'warn').mockImplementation(() => void 0)`로 경고를 조용히 캡처. 테스트 출력이 깨끗하게 유지되면서도 경고 발생을 검증할 수 있다.

---

## 당근: 순수 비즈니스 로직 단위 테스트

출처: [daangn/stackflow — makeCoreStore.spec.ts](https://github.com/daangn/stackflow)

UI와 무관한 상태 머신, 플러그인 훅 등은 React 없이 순수 함수 단위 테스트로 커버한다.

```tsx
test('beforePush 훅이 정상적으로 동작한다', () => {
  const onBeforePush = vi.fn();
  const otherHook = vi.fn();

  const { actions } = makeCoreStore({
    initialEvents: [
      makeEvent('Initialized', { transitionDuration: 350, eventDate: enoughPastTime() }),
      makeEvent('ActivityRegistered', { activityName: 'hello', eventDate: enoughPastTime() }),
      makeEvent('Pushed', {
        activityId: 'a1',
        activityName: 'hello',
        activityParams: {},
        eventDate: enoughPastTime(),
      }),
    ],
    plugins: [() => ({
      key: 'test',
      onBeforePush,
      onBeforeReplace: otherHook,
      onBeforePop: otherHook,
    })],
  });

  actions.push({ activityId: 'a2', activityName: 'hello', activityParams: {} });

  expect(onBeforePush).toHaveBeenCalledTimes(1);
  expect(otherHook).toHaveBeenCalledTimes(0); // 다른 훅은 호출되지 않음을 명시
});
```

> **원칙**: UI 렌더링이 필요 없는 로직은 RTL 없이 테스트한다. 더 빠르고 더 안정적이다.

---

## 네이버: 험블 객체 패턴

출처: [d2.naver.com/helloworld/9921217](https://d2.naver.com/helloworld/9921217)

테스트하기 어려운 코드(DOM 조작, 외부 의존)를 인터페이스로 분리하여, 핵심 로직만 단위 테스트한다.

```tsx
// ❌ BAD: 테스트하기 어려운 코드 — DOM + 비즈니스 로직이 혼재
function PriceCalculator() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    // DOM에서 직접 값을 읽고, 계산하고, 다시 DOM에 쓰는 로직
    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const tax = total * 0.1;
    const discount = total > 50000 ? total * 0.05 : 0;
    // ... 복잡한 비즈니스 로직이 컴포넌트에 박혀있음
  }, [items]);
}

// ✅ GOOD: 험블 객체 패턴 — 로직을 순수 함수로 추출
export function calculatePrice(items: CartItem[]) {
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tax = total * 0.1;
  const discount = total > 50000 ? total * 0.05 : 0;
  return { total, tax, discount, finalPrice: total + tax - discount };
}

// 순수 함수는 쉽게 테스트 가능
describe('calculatePrice', () => {
  it('5만원 초과 시 5% 할인이 적용된다', () => {
    const items = [{ price: 30000, quantity: 2 }]; // 60,000원
    const result = calculatePrice(items);

    expect(result.total).toBe(60000);
    expect(result.discount).toBe(3000); // 5%
    expect(result.finalPrice).toBe(63000); // 60,000 + 6,000(세금) - 3,000(할인)
  });

  it('5만원 이하면 할인이 없다', () => {
    const items = [{ price: 10000, quantity: 1 }];
    const result = calculatePrice(items);

    expect(result.discount).toBe(0);
  });
});
```

> **핵심**: 모든 비즈니스 로직을 컴포넌트 밖으로 추출하라. 컴포넌트는 "험블 객체"로 남겨두고, 로직은 순수 함수로 테스트한다.
