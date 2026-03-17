---
name: structuring-react-layers
description: React Page·Component·Hook 3-layer architecture guide. Page as layout shell, Feature Component as self-contained unit, Hook as role-based logic abstraction layer. Framework-agnostic (Next.js, Vite, Remix) and data-fetching library-agnostic (TanStack Query, SWR, Apollo). Use when — (1) designing new pages/components, (2) Page has data fetching, state, or handlers that need separation, (3) Feature component loses self-containment, (4) Hook mixes multiple roles and needs splitting, (5) detecting layer violations in code review, (6) project growth requires widget decomposition, entity layer, or feature-oriented cohesion. Triggers — page structure design, component responsibility separation, Hook splitting, Suspense boundary placement, code review. See references/tanstack-query.md for TanStack Query naming/patterns.
---

# Compositional Page Architecture

Page를 레이아웃 셸로, 자식을 자기 완결적 Feature 컴포넌트로 구성하는 3계층 아키텍처.

> 핵심 원리: Page는 "무엇을 배치할지"만 결정하고, 각 Feature 컴포넌트가 "어떻게 동작할지"를 스스로 소유한다.

## 3계층 구조

| 레이어 | 역할 | 규칙 |
|--------|------|------|
| **Page (Layout Shell)** | 라우팅 엔트리포인트, 레이아웃, 비동기 경계 | 클라이언트 데이터 패칭·UI 상태·비즈니스 로직 금지 |
| **Feature Component** | 자기 완결적 UI 단위 | Hook을 통해 자체 데이터·상태·액션 소유 |
| **Hook Layer** | 로직 추상화 | 읽기 / 상태 / 액션 역할별 분리 |

---

## 1. Page는 Layout Shell이다

Page 컴포넌트는 레이아웃 구조와 비동기 경계를 정의한다. 클라이언트 데이터 패칭, UI 상태, 이벤트 핸들러를 직접 갖지 않는다.

**예외**: Page의 비동기 데이터가 하나이고, 그 데이터를 소비하는 컴포넌트도 하나뿐이라면 Page에서 직접 Hook을 호출해도 된다. Feature가 둘 이상이 되거나, 로딩/에러 경계를 독립적으로 제어할 필요가 생기면 그때 분리한다.

### CSR Page

```tsx
// ❌ BAD: Page가 데이터 패칭과 상태를 직접 관리
function MenuPage() {
  const { data } = useCategories();
  const [selected, setSelected] = useState('all');
  return (
    <>
      <Tab categories={data} selected={selected} onChange={setSelected} />
      <ItemList />
    </>
  );
}
```

```tsx
// ✅ GOOD: Page는 레이아웃 + 비동기 경계만 담당
function MenuPage() {
  return (
    <>
      <Top title="주제" />
      <Suspense fallback={<TabSkeleton />}><TabNavigation /></Suspense>
      <Suspense fallback={<ListSkeleton />}><CatalogItemList /></Suspense>
      <CartCTA />
    </>
  );
}
```

---

## 2. Feature 컴포넌트는 자기 완결적이다

각 Feature 컴포넌트는 자신의 **비동기 데이터를 Hook으로 직접 소유**하는 것이 기본이다.

**Props로 전달이 허용되는 경우:**
- 식별자 (route params, ID)
- RSC에서 서버 패칭한 데이터
- Lifted state (형제 컴포넌트 간 공유 UI 상태)

**Props 전달이 금지되는 경우:**
- 부모가 **클라이언트에서** 데이터를 fetch하여 자식에게 내려주는 것 → Feature가 직접 fetch

```tsx
// ❌ BAD: 부모가 클라이언트에서 fetch하여 props로 전달
function MenuPage() {
  const { data: categories } = useCategories();
  return <TabNavigation categories={categories} />;
}
```

```tsx
// ✅ GOOD: Feature 컴포넌트가 자체 Hook으로 데이터 소유
function TabNavigation() {
  const { data: categories } = useCategories();
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

```tsx
// ✅ GOOD: Lifted state — 형제 간 공유 상태는 props 전달 허용
function Dashboard() {
  const [dateRange, setDateRange] = useState(defaultRange);
  return (
    <>
      <DatePicker value={dateRange} onChange={setDateRange} />
      <SalesChart dateRange={dateRange} />
      <RevenueTable dateRange={dateRange} />
    </>
  );
}
```

> 판단 기준: "이 데이터를 가져오는 주체가 누구인가?" Feature가 자신의 비동기 데이터를 직접 소유하면 **독립적으로 테스트·이동·삭제**할 수 있다.

---

## 3. Hook은 Feature의 로직 추상화 레이어다

하나의 Hook이 데이터 읽기 + UI 상태 + 사이드 이펙트를 모두 담당하지 않는다. 역할별로 분리한다.

```tsx
// ❌ BAD: 한 Hook이 모든 역할을 담당
function useDetail(itemId: string) {
  const { data } = useFetchItem(itemId);
  const [quantity, setQuantity] = useState(1);
  const handleAddToCart = () => { /* mutation */ };
  return { data, quantity, setQuantity, handleAddToCart };
}
```

```tsx
// ✅ GOOD: 역할별로 Hook 분리
const useItemDetail = (itemId: string) => useFetchItem(itemId);         // 읽기
const useItemQuantity = () => { const [q, setQ] = useState(1); return { q, setQ }; }; // 상태
const useAddToCart = () => { /* mutation hook */ };                      // 액션
```

### Hook 역할 분류

| 역할 | 설명 | 네이밍 예시 |
|------|------|-------------|
| **읽기** | 서버 데이터 패칭 | `useCategories`, `useProduct` |
| **상태** | UI 상태 관리 | `useItemQuantity`, `useFilter` |
| **액션** | 사이드 이펙트 (mutation) | `useAddToCart`, `useSignup` |

> 네이밍 컨벤션은 팀/라이브러리에 따라 결정한다. TanStack Query 특화 네이밍은 [references/tanstack-query.md](references/tanstack-query.md) 참조.

**예외 — Composite Hook**: query와 mutation이 본질적으로 결합된 경우(optimistic update 등) 하나의 Hook으로 유지한다.

> 판단 기준: Hook의 반환값 중 서로 다른 역할이 섞여 있으면 분리를 검토한다. 단, 분리 시 응집도가 오히려 떨어지면 composite hook을 유지한다.

### Hook 위치: 로컬 우선

| 위치 | 용도 | 판단 기준 |
|------|------|-----------|
| 라우트/페이지 디렉토리 | 해당 라우트 전용 Hook | 1개 라우트에서만 사용 |
| 공통 hooks 디렉토리 | 공유 Hook | 2개 이상의 라우트에서 사용 |

기본적으로 **로컬에 먼저 배치**한다. 다른 라우트에서도 필요해지면 그때 공통 디렉토리로 승격한다.

---

## 4. 비동기 경계는 Feature 단위로 건다

Feature 컴포넌트마다 비동기 경계를 배치하여, 한 컴포넌트의 로딩이 다른 컴포넌트를 블로킹하지 않게 한다.

### Suspense 기반

```tsx
// ✅ Feature 단위로 Suspense + ErrorBoundary 분리
function MenuPage() {
  return (
    <>
      <ErrorBoundary fallback={<TabError />}>
        <Suspense fallback={<TabSkeleton />}><TabNavigation /></Suspense>
      </ErrorBoundary>
      <ErrorBoundary fallback={<ListError />}>
        <Suspense fallback={<ListSkeleton />}><CatalogItemList /></Suspense>
      </ErrorBoundary>
      <CartCTA /> {/* 비동기 데이터 없음 — 경계 불필요 */}
    </>
  );
}
```

### 명시적 로딩 (non-Suspense)

Suspense를 사용하지 않는 경우, Feature 컴포넌트 내부에서 로딩/에러 상태를 직접 처리한다.

```tsx
function TabNavigation() {
  const { data, isLoading, isError } = useCategories();
  if (isLoading) return <TabSkeleton />;
  if (isError) return <TabError />;
  return <Tab>{/* ... */}</Tab>;
}
```

**예외**: 의미적으로 하나의 단위인 Feature 그룹은 공유 경계를 사용할 수 있다.

> 판단 기준: 비동기 데이터를 사용하는 Feature 컴포넌트는 각각 독립 비동기 경계를 갖는다. 단, 의미적 그룹은 공유 허용.

---

## 체크리스트

- [ ] Page에 클라이언트 데이터 패칭, `useState`, 이벤트 핸들러가 없는가?
- [ ] RSC Page라면 서버 패칭 → Client props 전달 패턴을 활용하고 있는가?
- [ ] Feature 컴포넌트가 자체 Hook으로 비동기 데이터를 소유하는가?
- [ ] Hook이 역할별로 분리되어 있는가? (읽기 / 상태 / 액션)
- [ ] Hook이 로컬 우선으로 배치되어 있는가?
- [ ] 비동기 데이터를 사용하는 Feature마다 독립 경계가 있는가?

---

## 프로젝트 성장 시 확장 패턴

> 현재 3계층으로 충분하지 않은 시점에 단계적으로 도입한다. 자세한 가이드는 [references/growth-patterns.md](references/growth-patterns.md) 참조.

| 복잡도 축 | 패턴 | 적용 시점 | 핵심 질문 |
|-----------|------|-----------|-----------|
| **화면** | 위젯 분해 | Page의 Feature가 많아 return문이 한 화면에 안 들어올 때 | "**어디에** 배치할 것인가?" |
| **데이터** | 엔티티 레이어 | 같은 DTO 변환을 수정할 때 다른 파일도 함께 수정해야 할 때 | "**무엇을** 표시할 것인가?" |
| **행동** | 기능 중심 응집 | 하나의 행동을 수정하려면 여러 폴더를 오가야 할 때 | "**왜/어떤 맥락에서** 다룰 것인가?" |

> TanStack Query 특화 패턴(AsyncBoundary, Hook 네이밍 등)은 [references/tanstack-query.md](references/tanstack-query.md) 참조.
