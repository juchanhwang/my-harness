---
name: react-state-colocation
description: React state placement guide based on Kent C. Dodds' State Colocation principle. Provides a decision flowchart for optimal state location. Use when designing state architecture, resolving prop drilling, or deciding between local state, lifting, composition, and context. Triggers on state management design, prop drilling issues, or component state decisions.
---

# React State Colocation

> "Place code as close to where it's relevant as possible."
> — Kent C. Dodds

State Colocation means keeping state as close to where it's used as possible. This improves both **maintainability** (easier to find and change) and **performance** (fewer unnecessary re-renders).

References:

- [State Colocation will make your React app faster](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster)
- [Application State Management with React](https://kentcdodds.com/blog/application-state-management-with-react)

## Server Cache vs UI State

All state falls into one of two buckets:

| Type             | Description                                                                           | Solution                                                              |
| ---------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **Server Cache** | Data stored on the server, cached on the client for quick access (users, posts, etc.) | Use a cache library (TanStack Query, SWR) — caching is a hard problem |
| **UI State**     | State only useful in the UI (modal open/closed, form input, selected tab)             | Use React's built-in primitives (useState, useReducer, useContext)    |

Do not mix the two. Server cache has inherently different problems from UI state and needs different management.

## State Placement Decision Flowchart

Based on Kent C. Dodds' decision tree:

```
1. Start with useState()
          │
          ▼
2. Used by only this component?
     ├── Yes ──→ Leave it ──────────────────────────→ 5
     └── No
          │
          ▼
3. Used by only one child?
     ├── Yes ──→ Push state down (Colocate) ────────→ 5
     └── No
          │
          ▼
4. Used by sibling or parent?
     ├── Yes ──→ Lift state to nearest common parent → 5
     └── No ───→ Re-analyze

5. Prop drilling problem?
     ├── No ───→ Ship it!
     └── Yes
          │
          ▼
6. Can the child function independently outside its parent?
     ├── Yes ──→ Context Provider
     └── No ───→ Component Composition (children)

→ Ship it! As requirements change, re-evaluate from step 1.
```

## Patterns

### 1. Leave It

State is only used by the current component. Keep it local.

```tsx
function SearchBox() {
  const [query, setQuery] = useState("");
  return <input value={query} onChange={(e) => setQuery(e.target.value)} />;
}
```

### 2. Push State Down (Colocate)

State is only used by one child. Move it into that child to avoid unnecessary parent re-renders.

```tsx
// BAD: parent holds state it doesn't use
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

// GOOD: state lives where it's used
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

> Why it's faster: When `count` changes, React only re-renders `Counter`. Before, it had to check `Header` and `Footer` too — "the best way to make something fast is to do less stuff."

### 3. Lift State

Siblings or parent need the same state. Lift to the **nearest common parent** only — not higher.

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

> Rule: Lifting is natural when building features. But revisit and push state back down during refactoring — apps "work" whether you colocate or not, so be intentional.

### 4. Component Composition

Prop drilling occurs, but the child is tightly coupled to its parent (can't function independently).

```tsx
// BAD: Header and Sidebar drill `user` without using it
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

// GOOD: composition eliminates the middlemen
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

> Advantages: Intermediate components don't know about `user` at all. More flexible, no Context overhead.

### 5. Context Provider

Prop drilling occurs, and the child can function independently (used in different parts of the tree). Or the state is truly global (theme, auth, locale).

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

> Key insight: Not all providers belong at the app root. Place them as close to where they're needed as possible — a `NotificationsProvider` only needs to wrap the notifications page, not the entire app.

## Anti-Patterns

### Dumping everything into global state

Don't put modal open/close, form inputs, or selected tabs into Redux or a global context. These are UI state that belongs near the component that uses them.

> "I consistently see developers putting _all_ of their state into redux. Not just global application state, but local state as well." — Kent C. Dodds

### Reaching for Context too early

Try composition first. Context adds indirection and causes all consumers to re-render on any value change.

Decision order: **Local state → Composition → Context**

### Never pushing state back down

Lifting state is natural when building features. But we rarely think to push state back down during refactoring. Actively look for opportunities to colocate during maintenance.

## Decision Checklist

- [ ] How many components use this state?
- [ ] Is the state at the nearest common ancestor (not higher)?
- [ ] Would a state change here trigger re-renders in components that don't need it?
- [ ] Is prop drilling deeper than 3 levels? → Try composition first, then context
- [ ] Can the child component function independently outside its parent?
- [ ] Is this server cache or UI state? → Use the right tool for each
