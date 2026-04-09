# Data Fetching

> 핵심 메시지: **"서버 컴포넌트에서 fetch, 클라이언트에서 TanStack Query. 이 두 가지면 충분하다."**

***

## 1. 판단 기준

| 상황             | 방법                           | 이유               |
| -------------- | ---------------------------- | ---------------- |
| 초기 페이지 로드 데이터  | 서버 컴포넌트 `fetch`              | SEO + 빠른 FCP     |
| 사용자 인터랙션 후 데이터 | TanStack Query               | 캐싱 + 리페칭 + 상태 관리 |
| 실시간 데이터        | WebSocket + TanStack Query   | 자동 업데이트          |
| 폼 제출           | TanStack Query `useMutation` | 낙관적 업데이트 + 에러 처리 |

***

## 2. 서버 컴포넌트 패칭

```tsx
// ✅ 서버 컴포넌트에서 직접 fetch
async function DashboardPage() {
  const stats = await fetch('https://api.example.com/stats', {
    next: { revalidate: 60 },  // 60초 ISR
  }).then(r => r.json());

  return <DashboardView stats={stats} />;
}

// ✅ 병렬 페칭
async function DashboardPage() {
  const [stats, users, orders] = await Promise.all([
    fetchStats(),
    fetchUsers(),
    fetchOrders(),
  ]);

  return <DashboardView stats={stats} users={users} orders={orders} />;
}
```

**주의:** 서버 컴포넌트에서 순차 fetch 금지. 항상 `Promise.all`로 병렬화.

***

## 3. TanStack Query 패턴

### 기본 사용

```tsx
function useUsers(filters: UserFilters) {
  return useQuery({
    queryKey: ['users', filters],
    queryFn: () => fetchUsers(filters),
    staleTime: 5 * 60 * 1000,  // 5분 동안 fresh
    gcTime: 30 * 60 * 1000,    // 30분 동안 캐시 유지
  });
}
```

### Mutation + 캐시 무효화

```tsx
function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('사용자가 생성되었습니다');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });
}
```

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

***

## 4. 캐싱 전략

| 데이터 유형  | staleTime    | 이유      |
| ------- | ------------ | ------- |
| 사용자 프로필 | 5분           | 자주 안 바뀜 |
| 대시보드 지표 | 1분           | 거의 실시간  |
| 설정 데이터  | 30분          | 거의 불변   |
| 검색 결과   | 0 (즉시 stale) | 매번 최신   |

***

## 5. Prefetching

```tsx
// 호버 시 프리페치
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

## ❌ 안티패턴

* **useEffect + useState로 데이터 페칭**: TanStack Query가 캐싱, 에러, 로딩, 재시도를 다 해줌
* **순차 fetch (waterfall)**: `Promise.all`로 병렬화
* **staleTime 미설정**: 기본값 0 → 불필요한 리페칭 → 적절한 staleTime 필수
* **queryKey에 불필요한 값 포함**: 리렌더링마다 새 쿼리 발생
* **서버 컴포넌트에서 TanStack Query**: 서버 컴포넌트는 직접 fetch, 클라이언트만 TanStack Query

***

> 📎 관련: [async-patterns.md](async-patterns.md) · [state-management.md](state-management.md)
