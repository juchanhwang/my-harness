# Code Review: `src/components/Dashboard.tsx`

---

## 1. 파생 상태를 `useState` + `useEffect`로 관리하는 안티패턴 (심각도: 높음)

`totalRevenue`, `activeOrderCount`, `filteredOrders` 모두 `orders`와 `filter`에서 **파생되는 값**인데, 각각 별도의 `useState` + `useEffect`로 관리하고 있다. 이는 React 공식 문서에서 명시적으로 경고하는 ["You Might Not Need an Effect"](https://react.dev/learn/you-might-not-need-an-effect) 안티패턴이다.

**문제점:**
- 불필요한 상태 동기화 코드가 3개의 `useEffect`로 분산되어 있다.
- `orders`가 변경되면 렌더링이 2번 발생한다: 1번째는 `orders` 변경으로, 2번째는 `useEffect`가 `setTotalRevenue`, `setActiveOrderCount`, `setFilteredOrders`를 호출해서.
- 상태 간 일시적 불일치(tearing) 가능성이 있다. `orders`는 새 값인데 `totalRevenue`는 아직 이전 값인 프레임이 존재한다.

**개선:**
```tsx
const filteredOrders = useMemo(() => {
  if (filter === 'all') return orders;
  return orders.filter(order => order.status === filter);
}, [orders, filter]);

const totalRevenue = useMemo(
  () => orders.reduce((sum, o) => sum + o.amount, 0),
  [orders]
);

const activeOrderCount = useMemo(
  () => orders.filter(o => o.status === 'active').length,
  [orders]
);
```

이렇게 하면 `useEffect` 3개와 `useState` 3개(`filteredOrders`, `totalRevenue`, `activeOrderCount`)를 모두 제거할 수 있다.

---

## 2. TypeScript 타입 부재 (심각도: 높음)

파일 확장자가 `.tsx`인데 타입이 전혀 없다. Zustand store, 주문 데이터, 사용자 데이터 모두 `any`로 추론된다.

**문제점:**
- `order.amount`가 `number`인지 보장되지 않아 `reduce`에서 문자열 연결이 발생할 수 있다.
- `order.status`, `order.id`, `order.name` 등 프로퍼티 접근이 타입 체크되지 않는다.
- Zustand `create` 제네릭이 없어 store 반환 타입이 `any`다.

**개선:**
```tsx
interface Order {
  id: string;
  name: string;
  amount: number;
  status: 'active' | 'completed' | 'cancelled';
}

interface DashboardState {
  orders: Order[];
  users: User[];
  fetchOrders: () => Promise<void>;
  fetchUsers: () => Promise<void>;
}

const useDashboardStore = create<DashboardState>((set) => ({
  // ...
}));
```

---

## 3. fetch 에러 처리 없음 (심각도: 높음)

`fetchOrders`와 `fetchUsers`에 에러 처리가 전혀 없다.

**문제점:**
- 네트워크 실패 시 unhandled rejection이 발생한다.
- `res.ok`를 확인하지 않아 4xx/5xx 응답에서도 `res.json()`을 호출한다. 응답 본문이 JSON이 아니면 파싱 에러가 발생한다.
- 사용자에게 에러 피드백이 없다.

**개선:**
```tsx
fetchOrders: async () => {
  try {
    set({ isLoading: true, error: null });
    const res = await fetch('/api/orders');
    if (!res.ok) throw new Error(`Failed to fetch orders: ${res.status}`);
    const data = await res.json();
    set({ orders: data });
  } catch (error) {
    set({ error: error instanceof Error ? error.message : 'Unknown error' });
  } finally {
    set({ isLoading: false });
  }
},
```

---

## 4. 로딩 상태 없음 (심각도: 중간)

데이터를 fetch하는 동안 사용자에게 아무런 피드백이 없다. 빈 화면이 보이다가 데이터가 들어오면 갑자기 렌더링된다.

**개선:** store에 `isLoading`, `error` 상태를 추가하고 UI에 로딩/에러 상태를 표시한다.

---

## 5. 사용하지 않는 상태 변수 (심각도: 중간)

선언만 하고 사용하지 않는 변수가 5개나 있다:
- `stats` — store에서 destructure하지만 렌더링에 사용 안 함
- `users` — fetch하고 destructure하지만 렌더링에 사용 안 함
- `searchQuery` — 선언만 하고 어디에도 사용 안 함
- `sortBy` / `sortDirection` — 선언만 하고 정렬 로직 없음
- `isDropdownOpen` — 선언만 하고 드롭다운 UI 없음

**개선:** 사용하지 않는 상태를 모두 제거한다. 향후 기능으로 필요하다면 그때 추가한다.

---

## 6. useEffect 의존성 배열 문제 (심각도: 중간)

```tsx
useEffect(() => {
  fetchOrders();
  fetchUsers();
}, []);
```

`fetchOrders`와 `fetchUsers`가 의존성 배열에 포함되지 않았다. Zustand store 함수는 참조가 안정적이라 실제 동작에는 문제가 없지만, `react-hooks/exhaustive-deps` ESLint 규칙 위반이다.

**개선:** 의존성 배열에 추가하거나, 컴포넌트 외부에서 store를 직접 호출하는 패턴을 사용한다.

---

## 7. Zustand store가 컴포넌트 파일에 정의됨 (심각도: 중간)

store가 컴포넌트와 같은 파일에 있어서:
- 다른 컴포넌트에서 재사용할 수 없다.
- 관심사 분리가 안 된다.
- 테스트하기 어렵다.

**개선:** `src/stores/dashboardStore.ts`로 분리한다.

---

## 8. 페이지네이션이 불완전 (심각도: 낮음)

`page` 상태와 slice 로직은 있지만, 페이지 이동 UI(이전/다음 버튼, 총 페이지 수)가 없다. `page`는 항상 1이라 사실상 첫 10개만 보인다.

또한 `filter` 변경 시 `page`를 1로 리셋하는 별도의 `useEffect`가 있는데, 이것도 이벤트 핸들러에서 직접 처리하는 것이 맞다:

```tsx
const handleFilterChange = (newFilter: string) => {
  setFilter(newFilter);
  setPage(1); // 이벤트 핸들러에서 직접 리셋
};
```

---

## 9. `'use client'`에서의 데이터 페칭 (심각도: 낮음)

Next.js App Router에서 `'use client'` 컴포넌트 내 `useEffect`로 데이터를 가져오고 있다. 이 패턴은:
- SEO에 불리하다 (초기 HTML에 데이터 없음).
- 워터폴 문제가 있다 (JS 다운로드 -> 실행 -> fetch 시작).

**개선 방향:** Server Component에서 데이터를 fetch하고 Client Component에는 인터랙션만 맡기는 구조로 변경하거나, TanStack Query 등을 사용해 캐싱/재검증을 관리한다.

---

## 요약

| # | 문제 | 심각도 | 핵심 |
|---|------|--------|------|
| 1 | 파생 상태를 `useState`+`useEffect`로 관리 | 높음 | `useMemo`로 교체, `useEffect` 3개 + `useState` 3개 제거 |
| 2 | TypeScript 타입 부재 | 높음 | store, 데이터 모델에 타입 정의 |
| 3 | fetch 에러 처리 없음 | 높음 | `try/catch`, `res.ok` 체크, 에러 상태 추가 |
| 4 | 로딩 상태 없음 | 중간 | `isLoading` 상태 + 로딩 UI |
| 5 | 미사용 상태 변수 5개 | 중간 | 전부 제거 |
| 6 | useEffect 의존성 누락 | 중간 | 의존성 추가 또는 호출 패턴 변경 |
| 7 | store가 컴포넌트 파일 내부에 정의 | 중간 | 별도 파일로 분리 |
| 8 | 불완전한 페이지네이션 | 낮음 | UI 추가 또는 제거, filter 리셋은 이벤트 핸들러에서 |
| 9 | CSR 데이터 페칭 | 낮음 | Server Component 활용 검토 |
