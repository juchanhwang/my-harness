# TanStack Query 특화 패턴

> 이 문서는 [structuring-react-layers](../SKILL.md) 스킬을 TanStack Query(React Query v5+) 환경에서 적용할 때의 구체적인 네이밍, 패턴, 코드 예시를 제공한다.

## 목차

1. [Hook 네이밍 규칙](#hook-네이밍-규칙)
2. [AsyncBoundary 패턴](#asyncboundary-패턴)
3. [Suspense 기반 Page 구성](#suspense-기반-page-구성)
4. [Optimistic Update와 Composite Hook](#optimistic-update와-composite-hook)

---

## Hook 네이밍 규칙

| 패턴 | 역할 | 래핑 대상 | 예시 |
|------|------|-----------|------|
| `useGet*` | 데이터 패칭 | `useQuery` | `useGetCategories`, `useGetMe` |
| `useSuspenseGet*` | 데이터 패칭 (Suspense) | `useSuspenseQuery` | `useSuspenseGetMe`, `useSuspenseGetProduct` |
| `use*` | UI 상태 관리 | `useState` 등 | `useItemQuantity`, `useSocialLogin` |
| `use<동사>[목적어]` | 사이드 이펙트 | `useMutation` | `useSignup`, `useCreatePost`, `useDeleteUser` |

> `useSuspenseGet*`은 반드시 Suspense 경계 안에서 사용한다. `useGet*`은 컴포넌트 내부에서 `isLoading`/`isError`를 직접 처리한다.

---

## AsyncBoundary 패턴

`QueryErrorResetBoundary` + `ErrorBoundary` + `Suspense`를 하나의 래퍼로 통합한 패턴.

```tsx
import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';
import { Suspense } from 'react';

function AsyncBoundary({ children, pendingFallback, rejectedFallback }) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary onReset={reset} fallbackRender={rejectedFallback}>
          <Suspense fallback={pendingFallback}>
            {children}
          </Suspense>
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}
```

이점:
- `useSuspenseQuery` 에러 시 `ErrorBoundary`가 포착
- `QueryErrorResetBoundary`로 에러 후 재시도 가능
- `Suspense`로 로딩 UI 선언적 처리

---

## Suspense 기반 Page 구성

```tsx
// Page는 AsyncBoundary + Feature 컴포넌트 조합
function MenuPage() {
  return (
    <>
      <Top title="커피 사일로" />
      <AsyncBoundary pendingFallback={<TabSkeleton />}>
        <TabNavigation />
      </AsyncBoundary>
      <AsyncBoundary pendingFallback={<ListSkeleton />}>
        <CatalogItemList />
      </AsyncBoundary>
      <CartCTA />
    </>
  );
}

// Feature 컴포넌트는 useSuspenseGet*으로 데이터 소유
function TabNavigation() {
  const { data: categories } = useSuspenseGetCategories();
  const { selected, onChange } = useCategoryFilter();
  return (
    <Tab>
      {categories.map((c) => (
        <Tab.Item key={c.id} selected={c.id === selected} onClick={() => onChange(c.id)} />
      ))}
    </Tab>
  );
}
```

---

## Optimistic Update와 Composite Hook

query와 mutation이 본질적으로 결합된 경우, 역할별 분리 대신 **composite hook**으로 유지한다.

```tsx
// ✅ Optimistic update — composite hook이 적절
function useOptimisticTodos() {
  const query = useQuery({ queryKey: ['todos'], queryFn: fetchTodos });

  const mutation = useMutation({
    mutationFn: addTodo,
    onMutate: async (newTodo) => {
      await queryClient.cancelQueries({ queryKey: ['todos'] });
      const previous = queryClient.getQueryData(['todos']);
      queryClient.setQueryData(['todos'], (old) => [...old, newTodo]);
      return { previous };
    },
    onError: (_err, _newTodo, context) => {
      queryClient.setQueryData(['todos'], context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
    },
  });

  return { todos: query.data, addTodo: mutation.mutate, isAdding: mutation.isPending };
}
```

> `useGetTodos` + `useAddTodo`로 분리하면 optimistic update의 rollback 로직이 찢어진다. 이 경우 응집도를 위해 하나의 Hook으로 유지한다.
