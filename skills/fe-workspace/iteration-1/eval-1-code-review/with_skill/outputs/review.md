# Code Review: `src/components/Dashboard.tsx`

## 요약

이 컴포넌트에는 프로젝트 컨벤션에서 명시적으로 금지하는 안티패턴이 다수 포함되어 있다. 서버 데이터를 Zustand에 저장하고, `useEffect` + `fetch`로 데이터를 가져오며, 파생 값을 별도 state로 관리하는 구조가 핵심 문제다.

---

## 1. [Critical] 서버 데이터를 Zustand에 저장

**위치**: `useDashboardStore` 전체 (line 6~20)

**문제**: `orders`, `users`는 서버에서 가져오는 데이터다. 프로젝트 상태 분류 기준에 따르면 **서버 상태는 TanStack Query**로 관리해야 한다. Zustand에 서버 데이터를 넣으면:

- 캐싱 전략이 없다 (staleTime, gcTime 없음)
- 자동 refetch가 없다 (탭 전환, 네트워크 복구 시)
- 에러/로딩 상태 관리가 없다
- 캐시 무효화 메커니즘이 없다

> `state-management.md` §6 안티패턴: _"❌ 서버 데이터를 Zustand에 저장 — TanStack Query를 쓰세요!"_

**개선 방향**:

```tsx
// hooks/useOrders.ts
export function useOrders(filters: OrderFilters) {
  return useSuspenseQuery({
    queryKey: ['orders', 'list', filters],
    queryFn: () => fetchOrders(filters),
    staleTime: 30_000,
  });
}

// hooks/useUsers.ts
export function useUsers() {
  return useSuspenseQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
    staleTime: 30_000,
  });
}
```

---

## 2. [Critical] `useEffect` + `fetch`로 데이터 패칭

**위치**: `useEffect(() => { fetchOrders(); fetchUsers(); }, [])` (line 33~36)

**문제**: `useEffect` + `fetch` 패턴은 프로젝트에서 명시적으로 금지된 안티패턴이다.

- 경쟁 조건(race condition) 발생 가능
- 캐싱 없음 — 매번 네트워크 요청
- 에러 처리 없음 — `res.ok` 체크 없이 `res.json()` 호출
- 로딩 상태 수동 관리 필요
- 컴포넌트 언마운트 시 cleanup 없음

> `react-effects.md` §4: _"Effect에서 직접 fetch하지 않는다. 프레임워크/라이브러리를 사용한다."_
> `data-fetching.md` 안티패턴: _"useEffect + useState로 데이터 페칭 → TanStack Query가 캐싱, 에러, 로딩, 재시도를 다 해줌"_

**개선 방향**: TanStack Query `useSuspenseQuery`로 교체. 부모에서 `<Suspense>` + `<ErrorBoundary>`로 감싸는 선언적 패턴 적용.

---

## 3. [Critical] 파생 값을 별도 state + useEffect로 관리

**위치**: `filteredOrders`, `totalRevenue`, `activeOrderCount` (line 38~55)

**문제**: 세 값 모두 `orders`와 `filter`에서 계산 가능한 **파생 값(derived state)**이다. 이를 별도 `useState` + `useEffect`로 관리하면:

- 불필요한 리렌더링이 발생한다 (setState 호출마다 추가 렌더링)
- 한 프레임 동안 stale 값이 표시될 수 있다
- Effect 체인이 복잡해진다

> `react-effects.md` §2.1: _"기존 state에서 계산 가능한 값은 state로 만들지 않는다."_
> `state-management.md` §6: _"❌ derived state를 별도 상태로 관리"_

**개선 방향**: 렌더링 중 직접 계산하거나 `useMemo`로 캐싱한다.

```tsx
const filteredOrders = useMemo(
  () => orders.filter(order => filter === 'all' || order.status === filter),
  [orders, filter],
);

const totalRevenue = useMemo(
  () => orders.reduce((sum, o) => sum + o.amount, 0),
  [orders],
);

// 간단한 계산은 useMemo 없이도 충분
const activeOrderCount = orders.filter(o => o.status === 'active').length;
```

---

## 4. [Major] filter 변경 시 page 리셋을 useEffect로 처리

**위치**: `useEffect(() => { if (filter !== 'all') setPage(1); }, [filter])` (line 57~60)

**문제**: filter 변경은 사용자 이벤트(select onChange)가 원인이다. 이벤트의 결과를 Effect로 처리하면 불필요한 리렌더링이 발생하고, "왜 page가 1로 바뀌었는지" 추적이 어렵다.

> `react-effects.md` §1 핵심 판단 기준: _"사용자가 무언가를 했다 → 이벤트 핸들러에 둔다"_

**개선 방향**: 이벤트 핸들러에서 일괄 처리한다.

```tsx
function handleFilterChange(newFilter: string) {
  setFilter(newFilter);
  setPage(1);
}

// JSX
<select value={filter} onChange={e => handleFilterChange(e.target.value)}>
```

---

## 5. [Major] TypeScript 타입 부재

**문제**: `create((set) => (...))` 에 제네릭 타입이 없다. store의 `orders`, `users`가 `any[]`로 추론되어 타입 안전성이 전혀 없다. 컴포넌트 내 `useState([])`도 마찬가지.

**개선 방향**: store에 인터페이스를 정의하고, `create<DashboardState>()`처럼 제네릭을 명시한다.

```tsx
interface Order {
  id: string;
  name: string;
  amount: number;
  status: 'active' | 'completed';
}

interface DashboardState {
  orders: Order[];
  // ...
}
```

---

## 6. [Major] filter, page, sortBy 등 URL 상태를 useState로 관리

**위치**: `filter`, `page`, `sortBy`, `sortDirection`, `searchQuery` (line 29~32)

**문제**: 필터, 페이지네이션, 정렬은 **공유 가능하고 북마크 가능해야 하는 URL 상태**다. `useState`로 관리하면 새로고침 시 초기화되고, URL 공유가 불가능하다.

> `state-management.md` §4: _"필터, 페이지네이션, 정렬 등 공유 가능하고 북마크 가능해야 하는 상태는 URL에 둔다."_

**개선 방향**: `useSearchParams` 또는 `nuqs`로 URL 상태 관리.

---

## 7. [Major] 에러 처리 부재 + Suspense/ErrorBoundary 미사용

**문제**:
- `fetch` 응답의 `res.ok` 체크가 없다 — 404/500 응답도 정상 처리됨
- 로딩 상태 UI가 없다 — 데이터 도착 전까지 빈 화면
- ErrorBoundary, Suspense가 없다

> `async-patterns.md` §2: _"로딩 상태를 명령형(if/else)이 아닌 선언적(Suspense)으로 처리한다."_

**개선 방향**:

```tsx
function DashboardPage() {
  return (
    <ErrorBoundary fallback={(error, reset) => <ErrorFallback error={error} onRetry={reset} />}>
      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard />
      </Suspense>
    </ErrorBoundary>
  );
}
```

---

## 8. [Minor] 컴포넌트 응집도 — 하나의 컴포넌트에 모든 책임

**문제**: Dashboard 컴포넌트가 데이터 패칭, 필터링, 정렬, 페이지네이션, 통계 계산, 렌더링을 모두 담당한다. 변경 이유가 5개 이상인 "God Component"다.

> `code-quality.md` §4.1: _"변경 이유(reason to change)가 2개 이상이면 분리의 신호다."_

**개선 방향**: 관심사를 분리한다.
- 데이터 패칭 → 커스텀 훅 (`useOrders`, `useUsers`)
- 통계 계산 → 커스텀 훅 또는 파생 값
- 필터/정렬 UI → 별도 컴포넌트
- 주문 목록 → 별도 컴포넌트

---

## 9. [Minor] Zustand store를 컴포넌트 파일에 인라인 정의

**문제**: store 정의가 컴포넌트 파일 안에 있다. store를 다른 컴포넌트에서 재사용하려면 import 경로가 `components/Dashboard`가 되어 의미적으로 맞지 않다.

**개선 방향**: `stores/` 디렉토리에 분리하거나, 이 리뷰의 결론대로 TanStack Query로 전환하면 store 자체가 불필요해진다.

---

## 10. [Minor] 미사용 state 변수

**위치**: `isDropdownOpen`, `searchQuery`, `sortBy`, `sortDirection`, `stats` (line 29~32)

**문제**: 선언만 되고 JSX나 로직에서 사용되지 않는 state가 5개다. 불필요한 메모리 할당과 코드 노이즈를 유발한다.

**개선 방향**: 사용하지 않는 state는 제거한다. 향후 필요할 때 추가하면 된다.

---

## 11. [Minor] Zustand selector 미사용으로 인한 불필요한 리렌더링

**위치**: `const { orders, users, stats, fetchOrders, fetchUsers } = useDashboardStore()` (line 26)

**문제**: store 전체를 구조 분해 할당하면 store의 **어떤 값**이 변해도 컴포넌트가 리렌더링된다. 예를 들어 `users`가 변경되어도 `orders`만 사용하는 부분까지 리렌더링된다.

> `state-management.md` §2: _"❌ 전체 store 구독 → ✅ selector로 필요한 값만 구독"_

**개선 방향** (Zustand를 유지한다면):

```tsx
const orders = useDashboardStore((state) => state.orders);
const fetchOrders = useDashboardStore((state) => state.fetchOrders);
```

---

## 개선된 전체 구조 제안

```tsx
// hooks/useOrders.ts
export function useOrders(filters: OrderFilters) {
  return useSuspenseQuery({
    queryKey: ['orders', 'list', filters],
    queryFn: () => apiFetch<Order[]>('/api/orders', { params: filters }),
    staleTime: 30_000,
  });
}

// src/components/DashboardPage.tsx
export default function DashboardPage() {
  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard />
      </Suspense>
    </ErrorBoundary>
  );
}

// src/components/Dashboard.tsx
function Dashboard() {
  const [filters, setFilters] = useUrlState({ status: 'all', page: '1' });
  const { data: orders } = useOrders(filters);

  const totalRevenue = useMemo(
    () => orders.reduce((sum, o) => sum + o.amount, 0),
    [orders],
  );
  const activeOrderCount = orders.filter(o => o.status === 'active').length;
  const pageSize = 10;
  const paginatedOrders = orders.slice(
    (Number(filters.page) - 1) * pageSize,
    Number(filters.page) * pageSize,
  );

  function handleFilterChange(status: string) {
    setFilters({ status, page: '1' });
  }

  return (
    <div>
      <h1>Dashboard</h1>
      <div>Total Revenue: {totalRevenue}</div>
      <div>Active Orders: {activeOrderCount}</div>
      <select value={filters.status} onChange={e => handleFilterChange(e.target.value)}>
        <option value="all">All</option>
        <option value="active">Active</option>
        <option value="completed">Completed</option>
      </select>
      <div>
        {paginatedOrders.map(order => (
          <div key={order.id}>{order.name} - {order.amount}</div>
        ))}
      </div>
    </div>
  );
}
```

---

## 정리

| # | 심각도 | 문제 | 근거 |
|---|--------|------|------|
| 1 | Critical | 서버 데이터를 Zustand에 저장 | `state-management.md` §6 |
| 2 | Critical | `useEffect` + `fetch` 패칭 | `react-effects.md` §4, `data-fetching.md` |
| 3 | Critical | 파생 값을 state + useEffect로 관리 | `react-effects.md` §2.1, `state-management.md` §6 |
| 4 | Major | filter→page 리셋을 useEffect로 처리 | `react-effects.md` §1 |
| 5 | Major | TypeScript 타입 부재 | `state-management.md` §2 (제네릭 패턴) |
| 6 | Major | URL 상태를 useState로 관리 | `state-management.md` §4 |
| 7 | Major | 에러 처리 부재 + Suspense/ErrorBoundary 미사용 | `async-patterns.md` §2 |
| 8 | Minor | God Component — 관심사 미분리 | `code-quality.md` §4.1 |
| 9 | Minor | Store를 컴포넌트 파일에 인라인 정의 | `code-quality.md` §3.4 |
| 10 | Minor | 미사용 state 변수 5개 | — |
| 11 | Minor | Zustand selector 미사용 | `state-management.md` §2 |
