# State Management

> 상태를 올바르게 분류하고, 각 상태에 맞는 도구를 사용한다.

## 목차

1. [1. 상태 분류](#1-상태-분류) — 서버/전역/로컬/URL/Server Action 상태와 판단 흐름
2. [2. Zustand — 클라이언트 전역 상태](#2-zustand--클라이언트-전역-상태) — Selector, Slice 패턴
3. [3. TanStack Query — 서버 상태](#3-tanstack-query--서버-상태) — 낙관적 업데이트
4. [4. URL 상태](#4-url-상태) — 필터/페이지네이션, searchParams
5. [5. 선언적 상태 전이](#5-선언적-상태-전이) — useReducer, 타입 안전 상태 머신
6. [6. 안티패턴](#6-안티패턴)
7. [Server Actions 패턴 (Next.js App Router)](#server-actions-패턴-nextjs-app-router) — useActionState

***

## 1. 상태 분류

| 분류                   | 설명                   | 도구                   | 예시                |
| -------------------- | -------------------- | -------------------- | ----------------- |
| **서버 상태**            | 서버에서 가져온 데이터         | TanStack Query       | 주문 목록, 사용자 정보     |
| **클라이언트 전역 상태**      | 앱 전체에서 공유하는 클라이언트 상태 | Zustand              | 인증 토큰, 사이드바 열림 여부 |
| **UI 로컬 상태**         | 컴포넌트 내부 상태           | useState/useReducer  | 폼 입력값, 드롭다운 열림    |
| **URL 상태**           | URL에 반영되는 상태         | Next.js searchParams | 필터, 페이지네이션, 정렬    |
| **Server Action 상태** | 폼 제출/mutation의 서버 응답 | useActionState       | 폼 에러, 서버 검증 결과    |

### 판단 흐름

```
이 상태는 서버 데이터인가?
├── Yes → TanStack Query
└── No → 여러 컴포넌트가 공유하는가?
    ├── Yes → URL에 반영되어야 하는가?
    │   ├── Yes → URL 상태 (searchParams)
    │   └── No → Zustand (전역)
    └── No → useState/useReducer (로컬)
```

***

## 2. Zustand — 클라이언트 전역 상태

### 기본 패턴

```tsx
// stores/auth-store.ts
import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';

interface AuthState {
  user: User | null;
  token: string | null;
  login: (user: User, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  devtools(
    persist(
      (set) => ({
        user: null,
        token: null,
        login: (user, token) => set({ user, token }),
        logout: () => set({ user: null, token: null }),
      }),
      { name: 'auth-storage' }
    )
  )
);
```

### Selector 패턴 — 불필요한 리렌더링 방지

```tsx
// ❌ 전체 store 구독 — store의 어떤 값이 변해도 리렌더링
const { user } = useAuthStore();

// ✅ selector로 필요한 값만 구독
const user = useAuthStore((state) => state.user);
const isLoggedIn = useAuthStore((state) => state.user !== null);
```

### Slice 패턴 — 큰 store 분리

```tsx
// stores/slices/ui-slice.ts
interface UISlice {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
}

const createUISlice = (set: SetState): UISlice => ({
  sidebarOpen: true,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
});

// stores/slices/notification-slice.ts
interface NotificationSlice {
  notifications: Notification[];
  addNotification: (n: Notification) => void;
  clearNotifications: () => void;
}

const createNotificationSlice = (set: SetState): NotificationSlice => ({
  notifications: [],
  addNotification: (n) =>
    set((state) => ({ notifications: [...state.notifications, n] })),
  clearNotifications: () => set({ notifications: [] }),
});

// stores/app-store.ts — 합성
export const useAppStore = create<UISlice & NotificationSlice>()((...a) => ({
  ...createUISlice(...a),
  ...createNotificationSlice(...a),
}));
```

***

## 3. TanStack Query — 서버 상태

### 핵심 개념

서버 상태는 **캐시**다. TanStack Query는 서버 데이터의 캐싱, 동기화, 무효화를 자동으로 관리한다.

```tsx
// hooks/useOrders.ts
import { useSuspenseQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// 조회
export function useOrders(filters: OrderFilters) {
  return useSuspenseQuery({
    queryKey: ['orders', 'list', filters],
    queryFn: () => fetchOrders(filters),
    staleTime: 30_000,
  });
}

// 생성
export function useCreateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createOrder,
    onSuccess: () => {
      // 주문 목록 캐시 무효화 → 자동 refetch
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}
```

### 낙관적 업데이트

사용자 경험을 위해 서버 응답 전에 UI를 먼저 업데이트한다.

```tsx
function useToggleFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (productId: string) => toggleFavoriteAPI(productId),
    onMutate: async (productId) => {
      await queryClient.cancelQueries({ queryKey: ['products'] });
      const previous = queryClient.getQueryData(['products']);

      queryClient.setQueryData(['products'], (old: Product[]) =>
        old.map(p =>
          p.id === productId ? { ...p, isFavorite: !p.isFavorite } : p
        )
      );

      return { previous };
    },
    onError: (_err, _id, context) => {
      queryClient.setQueryData(['products'], context?.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}
```

***

## 4. URL 상태

필터, 페이지네이션, 정렬 등 **공유 가능하고 북마크 가능해야 하는 상태**는 URL에 둔다.

### URL 상태 vs `useState` 판단 기준

| 상태 종류 | 선택 |
|---|---|
| 필터, 검색, 정렬, 페이지네이션, 탭 선택 | **URL 상태** — 새로고침/공유 시 상태 유지 필요 |
| 모달 열림/닫힘, 드롭다운, 호버, 임시 UI | `useState` — 일시적이고 공유 불필요 |

URL 상태를 `useState`로 관리하면 새로고침/공유 시 상태가 사라진다. 반대로 일시 UI를 URL에 넣으면 히스토리가 오염된다.

### 추천: `nuqs`

타입 안전한 URL state 훅. 기본값·파서·직렬화를 선언적으로 제공하고 Next.js App Router와 자연스럽게 결합한다.

```tsx
import { useQueryState } from 'nuqs';

function ProductList() {
  const [category, setCategory] = useQueryState('category');
  const [sort, setSort] = useQueryState('sort', { defaultValue: 'newest' });
  const [page, setPage] = useQueryState('page', {
    parse: Number,
    defaultValue: 1,
  });
  // URL: /products?category=shoes&sort=newest&page=2
}
```

### `nuqs` 없이 — Next.js App Router 기본 API로 구현

라이브러리 추가를 피할 때는 `useSearchParams` + `useRouter`로 직접 훅을 만든다.

```tsx
'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';

function useUrlState<T extends Record<string, string>>(defaults: T) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const state = Object.fromEntries(
    Object.entries(defaults).map(([key, defaultValue]) => [
      key,
      searchParams.get(key) ?? defaultValue,
    ])
  ) as T;

  const setState = (updates: Partial<T>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value === defaults[key as keyof T]) {
        params.delete(key);
      } else {
        params.set(key, value as string);
      }
    });
    router.push(`${pathname}?${params.toString()}`);
  };

  return [state, setState] as const;
}

// 사용
function OrderListPage() {
  const [filters, setFilters] = useUrlState({
    status: 'all',
    page: '1',
    sort: 'createdAt',
  });

  // filters.status, filters.page 사용
  // setFilters({ page: '2' }) → URL 업데이트
}
```

***

## 5. 선언적 상태 전이

상태 전이를 명시적으로 정의하여 예측 가능성을 높인다.

```tsx
// useReducer로 복잡한 상태 전이 관리
type OrderState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'confirming'; order: Order }
  | { status: 'processing'; order: Order }
  | { status: 'completed'; order: Order; receipt: Receipt }
  | { status: 'error'; error: Error };

type OrderAction =
  | { type: 'SUBMIT' }
  | { type: 'CONFIRM'; order: Order }
  | { type: 'PROCESS' }
  | { type: 'COMPLETE'; receipt: Receipt }
  | { type: 'FAIL'; error: Error }
  | { type: 'RESET' };

function orderReducer(state: OrderState, action: OrderAction): OrderState {
  switch (action.type) {
    case 'SUBMIT':
      return { status: 'loading' };
    case 'CONFIRM':
      return { status: 'confirming', order: action.order };
    case 'PROCESS':
      if (state.status !== 'confirming') return state;
      return { status: 'processing', order: state.order };
    case 'COMPLETE':
      if (state.status !== 'processing') return state;
      return { status: 'completed', order: state.order, receipt: action.receipt };
    case 'FAIL':
      return { status: 'error', error: action.error };
    case 'RESET':
      return { status: 'idle' };
    default:
      return state;
  }
}
```

이 패턴의 장점:

* **타입 안전**: TypeScript가 잘못된 상태 전이를 컴파일 타임에 잡아줌
* **예측 가능**: 어떤 상태에서 어떤 액션이 가능한지 명확
* **디버깅 용이**: 상태 전이 로그로 문제 추적 가능

***

## 6. 안티패턴

```tsx
// ❌ 서버 데이터를 Zustand에 저장
const useStore = create((set) => ({
  orders: [],
  fetchOrders: async () => {
    const data = await fetchOrders();
    set({ orders: data }); // TanStack Query를 쓰세요!
  },
}));

// ❌ 모든 상태를 전역으로
const useStore = create((set) => ({
  isDropdownOpen: false, // 이건 로컬 useState로 충분
  searchQuery: '',       // 이건 URL 상태로
  orders: [],            // 이건 TanStack Query로
}));

// ❌ derived state를 별도 상태로 관리
const [items, setItems] = useState([]);
const [filteredItems, setFilteredItems] = useState([]); // items에서 파생 가능!

// ✅ derived state는 계산으로
const filteredItems = useMemo(
  () => items.filter(item => item.status === filter),
  [items, filter],
);

// → useEffect 최소화에 대한 상세 가이드: react-effects.md 참조
```

***

## Server Actions 패턴 (Next.js App Router)

> 참고: [async-patterns.md](async-patterns.md)의 fetch 기반 API 클라이언트도 함께 참조

Server Actions는 폼 제출, 간단한 mutation에 적합. `useActionState`로 서버 응답 상태를 관리한다.

```tsx
// actions/create-brand.ts
'use server';

import { z } from 'zod';

const schema = z.object({
  name: z.string().min(1, '브랜드명을 입력하세요'),
  domain: z.string().url('올바른 URL을 입력하세요'),
});

export async function createBrand(prevState: any, formData: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  // DB 저장 로직
  return { success: true };
}
```

```tsx
// components/CreateBrandForm.tsx
'use client';

import { useActionState } from 'react';
import { createBrand } from '@/actions/create-brand';

export function CreateBrandForm() {
  const [state, action, isPending] = useActionState(createBrand, null);

  return (
    <form action={action}>
      <input name="name" />
      {state?.error?.name && <p className="text-red-500">{state.error.name}</p>}
      <input name="domain" />
      <button disabled={isPending}>
        {isPending ? '생성 중...' : '브랜드 생성'}
      </button>
    </form>
  );
}
```

**선택 기준:**

* **Server Actions**: 폼 제출, 단순 mutation, progressive enhancement 필요 시
* **TanStack Query mutation**: 복잡한 낙관적 업데이트, 캐시 무효화, 에러 재시도 필요 시

***

> 📎 관련: [async-patterns.md](async-patterns.md) · [code-quality.md](code-quality.md) · [state-colocation.md](state-colocation.md)
