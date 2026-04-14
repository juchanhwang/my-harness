# Async Patterns

> 토스 스타일의 선언적 비동기 처리 패턴. React Query + Suspense + Error Boundary를 중심으로 한 3-Layer 에러 처리 아키텍처.

## 목차

1. [1. 3-Layer 에러 처리 아키텍처](#1-3-layer-에러-처리-아키텍처) — Axios Interceptor / React Query / Error Boundary
2. [2. Suspense 선언적 로딩 패턴](#2-suspense-선언적-로딩-패턴) — 중첩 Suspense, 섹션별 독립 로딩
3. [3. Mutation 에러 처리](#3-mutation-에러-처리) — Toast/Alert 기반
4. [4. Error Boundary 세분화 전략](#4-error-boundary-세분화-전략) — 배치 원칙, 재시도 fallback
5. [5. 서버 컴포넌트 데이터 패칭](#5-서버-컴포넌트-데이터-패칭) — fetch + Promise.all 병렬화
6. [6. Infinite Query / Prefetching](#6-infinite-query--prefetching)
7. [7. 캐싱 전략 — staleTime 기준](#7-캐싱-전략--staletime-기준)
8. [8. 비동기 패턴 결정 가이드](#8-비동기-패턴-결정-가이드)
9. [9. React Query 설정 가이드](#9-react-query-설정-가이드) — defaultOptions, Query Key 컨벤션

***

## 1. 3-Layer 에러 처리 아키텍처

비동기 에러를 세 단계에서 처리한다. 각 레이어는 명확한 책임을 가진다.

### Layer 1: Axios Interceptor — 네트워크/인증 레벨

API 클라이언트 수준에서 공통 에러를 처리한다. 인증 만료, 네트워크 오류 등 모든 API 호출에 공통인 에러를 여기서 잡는다.

```tsx
// lib/api-client.ts
import axios from 'axios';

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  timeout: 10000,
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { response } = error;

    // 401: 인증 만료 → 토큰 갱신 시도
    if (response?.status === 401) {
      try {
        await refreshToken();
        return apiClient(error.config); // 원래 요청 재시도
      } catch {
        redirectToLogin();
        return Promise.reject(error);
      }
    }

    // 500: 서버 에러 → 공통 에러 리포팅
    if (response?.status && response.status >= 500) {
      reportError(error);
    }

    // 나머지 에러는 상위 레이어로 전파
    return Promise.reject(error);
  }
);

export default apiClient;
```

#### fetch 기반 대안 (Next.js App Router)

PA 프로젝트처럼 Next.js App Router를 사용하는 경우, Axios 대신 `fetch` 래퍼를 사용할 수 있다.

```tsx
// lib/api-client.ts
const API_BASE = process.env.NEXT_PUBLIC_API_URL;

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (res.status === 401) {
    redirectToLogin();
    throw new Error('Unauthorized');
  }

  if (res.status >= 500) {
    const error = new Error(`Server error: ${res.status}`);
    reportError(error);
    throw error;
  }

  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }

  return res.json();
}

export { apiFetch };
```

> **선택 기준**: Axios는 interceptor/cancel/retry가 내장. fetch는 Next.js 캐싱(`next: { revalidate }`)과 자연스럽게 통합. 프로젝트 스택에 맞춰 선택한다.

### Layer 2: React Query — 데이터 패칭 레벨

React Query가 에러 상태를 관리하고, `throwOnError` 옵션으로 Error Boundary에 에러를 위임한다.

```tsx
// hooks/useOrders.ts
import { useSuspenseQuery } from '@tanstack/react-query';

export function useOrders() {
  return useSuspenseQuery({
    queryKey: ['orders'],
    queryFn: () => apiClient.get('/orders').then(res => res.data),
    retry: 2,
    staleTime: 30_000,
  });
}
```

`useSuspenseQuery`는 자동으로:

* 로딩 중 → Suspense fallback 트리거
* 에러 발생 → 가장 가까운 Error Boundary로 에러 throw

### Layer 3: UI — Error Boundary + Toast

사용자에게 에러를 보여주는 레이어. Error Boundary는 페이지/섹션 단위 에러를, Toast는 액션(mutation) 에러를 처리한다.

> **⚠️ 먼저 선택지를 확인하라.** 아래 클래스 구현은 **Next.js App Router 외부**(순수 React SPA, 섹션 단위 미세 제어) 또는 학습용 참고를 위한 것이다. 실무에서는 다음을 우선 사용한다:
>
> 1. **Next.js App Router** → `app/error.tsx` / `app/global-error.tsx` 파일 컨벤션. 라우트 세그먼트 자동 경계, `reset()` 기본 제공. (→ `vercel:nextjs` 자동 주입 스킬 참조)
> 2. **세그먼트 내부 섹션 경계가 필요한 경우** → [`react-error-boundary`](https://github.com/bvaughn/react-error-boundary) 라이브러리. `<ErrorBoundary>` + `useErrorBoundary()` 훅 제공, `fallbackRender`/`onReset`/`resetKeys` 등 기본 내장.
> 3. **위 두 가지로 해결 안 되는 특수 요구**(예: 커스텀 에러 타입 분기, 외부 로거 강제 주입) → 아래 클래스 구현 참고.

```tsx
// components/ErrorBoundary.tsx — 순수 React 또는 특수 케이스용 참고 구현
'use client';

import { Component, type ReactNode } from 'react';

interface Props {
  fallback: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      const { fallback } = this.props;
      return typeof fallback === 'function'
        ? fallback(this.state.error, this.reset)
        : fallback;
    }
    return this.props.children;
  }
}
```

***

## 2. Suspense 선언적 로딩 패턴

로딩 상태를 명령형(if/else)이 아닌 **선언적(Suspense)**으로 처리한다.

### 기본 패턴

```tsx
// ❌ 명령형 로딩 처리
function OrderList() {
  const { data, isLoading, error } = useQuery({ queryKey: ['orders'], queryFn: fetchOrders });

  if (isLoading) return <Skeleton />;
  if (error) return <ErrorMessage error={error} />;
  if (!data) return null;

  return <OrderTable orders={data} />;
}

// ✅ 선언적 로딩 처리
function OrderPage() {
  return (
    <ErrorBoundary fallback={(error, reset) => <ErrorFallback error={error} onRetry={reset} />}>
      <Suspense fallback={<OrderSkeleton />}>
        <OrderList />
      </Suspense>
    </ErrorBoundary>
  );
}

function OrderList() {
  const { data: orders } = useSuspenseQuery({
    queryKey: ['orders'],
    queryFn: fetchOrders,
  });

  // data는 항상 존재 — undefined 체크 불필요
  return <OrderTable orders={orders} />;
}
```

### Suspense의 장점

1. **컴포넌트가 "성공 케이스"에만 집중** — 로딩/에러 처리를 상위로 위임
2. **data가 항상 존재** — `useSuspenseQuery`는 undefined를 반환하지 않음
3. **세분화된 로딩 경험** — Suspense 바운더리를 원하는 곳에 배치
4. **Streaming SSR 호환** — Next.js App Router와 자연스럽게 연동

### 중첩 Suspense 패턴

```tsx
function DashboardPage() {
  return (
    <ErrorBoundary fallback={<PageErrorFallback />}>
      {/* 전체 페이지 레이아웃은 즉시 렌더링 */}
      <DashboardLayout>
        {/* 각 섹션이 독립적으로 로딩 */}
        <Suspense fallback={<StatsSkeleton />}>
          <StatsSection />
        </Suspense>
        <Suspense fallback={<ChartSkeleton />}>
          <ChartSection />
        </Suspense>
        <Suspense fallback={<TableSkeleton />}>
          <RecentOrdersSection />
        </Suspense>
      </DashboardLayout>
    </ErrorBoundary>
  );
}
```

***

## 3. Mutation 에러 처리

데이터 변경(mutation)의 에러는 Error Boundary가 아닌 **Toast/Alert**로 처리한다. 페이지 전체를 에러 상태로 만들 필요가 없기 때문.

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

function useCreateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateOrderPayload) =>
      apiClient.post('/orders', payload).then(res => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('주문이 생성되었습니다.');
    },
    onError: (error) => {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        toast.error('이미 처리된 주문입니다.');
      } else {
        toast.error('주문 생성에 실패했습니다. 다시 시도해주세요.');
      }
    },
  });
}
```

***

## 4. Error Boundary 세분화 전략

에러 바운더리를 **어디에 배치하느냐**가 UX를 결정한다.

```
App (최상위 Error Boundary — 앱 크래시 방지)
└── Page (페이지 Error Boundary — 페이지 단위 에러)
    ├── Section A (섹션 Error Boundary — 독립 섹션)
    ├── Section B
    └── Section C
```

**원칙:**

* **독립적으로 로딩/실패할 수 있는 섹션**에는 별도 Error Boundary
* **사용자의 다른 작업을 방해하지 않도록** 에러 범위를 최소화
* **재시도 가능한 Error Fallback** 제공 (reset 함수 활용)

```tsx
function ErrorFallback({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-4 p-8">
      <p className="text-gray-600">데이터를 불러오는 데 실패했습니다.</p>
      <button onClick={onRetry} className="btn-primary">
        다시 시도
      </button>
    </div>
  );
}
```

***

## 5. 서버 컴포넌트 데이터 패칭

서버 컴포넌트에서는 TanStack Query를 쓰지 않고 **`fetch`를 직접 호출**한다. Next.js `fetch`는 캐싱(`next: { revalidate }`)과 자연스럽게 통합된다.

```tsx
// ✅ 병렬 페칭 — 순차 fetch(waterfall) 금지
async function DashboardPage() {
  const [stats, users, orders] = await Promise.all([
    fetchStats(),
    fetchUsers(),
    fetchOrders(),
  ]);
  return <DashboardView stats={stats} users={users} orders={orders} />;
}
```

***

## 6. Infinite Query / Prefetching

### Infinite Query (무한 스크롤)

```tsx
function useInfiniteUsers() {
  return useInfiniteQuery({
    queryKey: ['users', 'infinite'],
    queryFn: ({ pageParam }) => fetchUsers({ cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}
```

### Prefetching (hover 시)

```tsx
<Link
  href={`/users/${user.id}`}
  onMouseEnter={() => {
    queryClient.prefetchQuery({
      queryKey: ['user', user.id],
      queryFn: () => fetchUser(user.id),
    });
  }}
>
  {user.name}
</Link>
```

***

## 7. 캐싱 전략 — staleTime 기준

| 데이터 유형 | staleTime | 이유 |
|---|---|---|
| 설정/메타데이터 | 30분 | 거의 불변 |
| 사용자 프로필 | 5분 | 자주 안 바뀜 |
| 대시보드 지표 | 1분 | 거의 실시간 |
| 검색 결과 | 0 (즉시 stale) | 매번 최신 필요 |

***

## 8. 비동기 패턴 결정 가이드

| 상황                | 패턴                               |
| ----------------- | -------------------------------- |
| 페이지 초기 데이터 로딩     | `useSuspenseQuery` + Suspense    |
| 여러 독립 섹션 로딩       | 중첩 Suspense (각 섹션별)              |
| 사용자 액션 (생성/수정/삭제) | `useMutation` + Toast            |
| 폼 제출              | `useMutation` + 인라인 에러           |
| 무한 스크롤            | `useSuspenseInfiniteQuery`       |
| 실시간 데이터           | `useQuery` + refetchInterval     |
| 낙관적 업데이트          | `useMutation` + optimisticUpdate |

***

## 9. React Query 설정 가이드

```tsx
// lib/query-client.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,        // 30초간 fresh
      gcTime: 5 * 60_000,       // 5분간 캐시 유지
      retry: 2,                  // 2회 재시도
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,                  // mutation은 재시도 안 함
    },
  },
});
```

### Query Key 컨벤션

```tsx
// 계층적 query key로 invalidation 효율화
const queryKeys = {
  orders: {
    all: ['orders'] as const,
    lists: () => [...queryKeys.orders.all, 'list'] as const,
    list: (filters: OrderFilters) => [...queryKeys.orders.lists(), filters] as const,
    details: () => [...queryKeys.orders.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.orders.details(), id] as const,
  },
};

// 사용
useQuery({ queryKey: queryKeys.orders.detail(orderId), queryFn: ... });

// 전체 주문 관련 캐시 무효화
queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
```

***

> 📎 관련: [state-management.md](state-management.md) · [code-quality.md](code-quality.md)
