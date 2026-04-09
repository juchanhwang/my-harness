# State Colocation

> "Place code as close to where it's relevant as possible." — Kent C. Dodds

State Colocation은 상태를 **사용되는 곳과 최대한 가까이** 배치하는 원칙이다. 이를 통해 **유지보수성**(찾고 수정하기 쉬움)과 **성능**(불필요한 리렌더링 감소)을 동시에 개선한다.

참고 자료:

- [State Colocation will make your React app faster](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster)
- [Application State Management with React](https://kentcdodds.com/blog/application-state-management-with-react)

서버 캐시(Server Cache)와 UI 상태(UI State)는 본질적으로 다른 문제이므로 혼합하지 않는다. 상태 분류에 대한 자세한 내용은 [state-management.md](state-management.md)를 참조한다.

***

## 1. 상태 배치 의사결정 플로우차트

Kent C. Dodds의 의사결정 트리 기반:

```
1. useState()로 시작
          │
          ▼
2. 이 컴포넌트만 사용하는가?
     ├── Yes ──→ Leave it (로컬 유지) ──────────────→ 5
     └── No
          │
          ▼
3. 하나의 자식만 사용하는가?
     ├── Yes ──→ Push state down (상태를 자식으로) ───→ 5
     └── No
          │
          ▼
4. 형제 또는 부모가 사용하는가?
     ├── Yes ──→ Lift state (가장 가까운 공통 부모로) ─→ 5
     └── No ───→ 다시 분석

5. Prop drilling 문제가 있는가?
     ├── No ───→ Ship it!
     └── Yes
          │
          ▼
6. 자식이 부모 밖에서 독립적으로 동작할 수 있는가?
     ├── Yes ──→ Context Provider
     └── No ───→ Component Composition (children)

→ Ship it! 요구사항이 변하면 1단계부터 다시 평가한다.
```

***

## 2. 패턴별 코드 예시

### 2-1. Leave It (로컬 유지)

이 컴포넌트만 사용하는 상태. 로컬에 둔다.

```tsx
function SearchBox() {
  const [query, setQuery] = useState("");
  return <input value={query} onChange={(e) => setQuery(e.target.value)} />;
}
```

### 2-2. Push State Down (상태를 자식으로 내리기)

하나의 자식만 사용하는 상태. 자식으로 옮겨서 부모의 불필요한 리렌더링을 방지한다.

```tsx
// ❌ BAD: 부모가 사용하지 않는 상태를 들고 있음
function Parent() {
  const [count, setCount] = useState(0);
  return (
    <div>
      <Header />
      <Counter count={count} setCount={setCount} />
      <Footer />
    </div>
  );
}

// ✅ GOOD: 상태가 사용되는 곳에 배치
function Parent() {
  return (
    <div>
      <Header />
      <Counter />
      <Footer />
    </div>
  );
}

function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount((c) => c + 1)}>{count}</button>;
}
```

> 성능 이점: `count`가 변경되면 React는 `Counter`만 리렌더링한다. 이전에는 `Header`와 `Footer`도 확인해야 했다 — "빠르게 만드는 최선의 방법은 할 일을 줄이는 것이다."

### 2-3. Lift State (끌어올리기)

형제나 부모가 같은 상태를 필요로 할 때. **가장 가까운 공통 부모까지만** 끌어올린다 — 그 이상은 올리지 않는다.

```tsx
function Parent() {
  const [filter, setFilter] = useState("all");
  return (
    <div>
      <FilterButtons filter={filter} setFilter={setFilter} />
      <ItemList filter={filter} />
    </div>
  );
}
```

> 규칙: 기능 개발 시 상태를 올리는 것은 자연스럽다. 하지만 리팩토링 시 상태를 다시 내릴 수 있는지 반드시 검토한다 — Colocation 여부와 관계없이 앱은 "동작"하므로, 의도적으로 관리해야 한다.

### 2-4. Component Composition (children)

Prop drilling이 발생하지만, 자식이 부모와 강하게 결합되어 있는 경우 (독립적으로 동작 불가).

```tsx
// ❌ BAD: Header와 Sidebar가 user를 사용하지 않으면서 전달만 함
function App() {
  const [user, setUser] = useState(null);
  return <Layout user={user} />;
}
function Layout({ user }) {
  return <Sidebar user={user} />;
}
function Sidebar({ user }) {
  return <UserInfo user={user} />;
}

// ✅ GOOD: Composition으로 중간 컴포넌트를 제거
function App() {
  const [user, setUser] = useState(null);
  return (
    <Layout>
      <Sidebar>
        <UserInfo user={user} />
      </Sidebar>
    </Layout>
  );
}

function Layout({ children }) {
  return <div className="layout">{children}</div>;
}
function Sidebar({ children }) {
  return <aside>{children}</aside>;
}
```

> 장점: 중간 컴포넌트가 `user`에 대해 전혀 알 필요 없다. 더 유연하고, Context 오버헤드도 없다.

### 2-5. Context Provider

Prop drilling이 발생하고, 자식이 독립적으로 동작할 수 있는 경우. 또는 theme, auth, locale 같은 진정한 전역 상태.

```tsx
const AuthContext = createContext<AuthContextType | null>(null);

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  return (
    <AuthContext.Provider value={{ user, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

function UserMenu() {
  const { user } = useAuth();
  return user ? <ProfileMenu /> : <LoginButton />;
}
```

> 핵심: 모든 Provider가 앱 루트에 있을 필요는 없다. **필요한 곳과 최대한 가까이** 배치한다 — `NotificationsProvider`는 알림 페이지만 감싸면 된다, 앱 전체가 아니라.

***

## 3. 안티패턴

### Context를 너무 빨리 사용하는 것

Composition을 먼저 시도한다. Context는 간접 참조(indirection)를 추가하고, 값이 변경되면 모든 Consumer가 리렌더링된다.

결정 순서: **Local state → Composition → Context**

### 상태를 다시 내리지 않는 것

기능 개발 시 상태를 끌어올리는 것은 자연스럽다. 하지만 리팩토링 시 상태를 다시 내릴 생각은 거의 하지 않는다. 유지보수 과정에서 Colocation 기회를 적극적으로 찾아야 한다.

***

## 4. Decision Checklist

- [ ] 이 상태를 몇 개의 컴포넌트가 사용하는가?
- [ ] 상태가 가장 가까운 공통 조상에 있는가 (더 위가 아닌)?
- [ ] 여기서 상태가 변경되면 불필요한 리렌더링이 발생하는가?
- [ ] Prop drilling이 3단계 이상인가? → Composition을 먼저 시도하고, 그 다음 Context
- [ ] 자식 컴포넌트가 부모 밖에서 독립적으로 동작할 수 있는가?
- [ ] 서버 캐시인가 UI 상태인가? → 각각에 맞는 도구를 사용

***

> 관련: [state-management.md](state-management.md)
