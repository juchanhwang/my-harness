---
name: frontend-code-quality
description: Frontend code quality principles covering readability, predictability, cohesion, and coupling. Apply when writing, reviewing, or refactoring frontend components to ensure maintainability. Triggers on component design, code review, refactoring, or code structure decisions.
---

# Frontend Code Quality

Good code is code that is easy to change. Apply these four principles in order of priority.

Source: https://frontend-fundamentals.com/code-quality/code/

## 1. Readability

Minimize the context a reader must hold at once. Code should read naturally from top to bottom.

### Reduce Context

**Separate code paths that never execute together**: Split branches based on permissions or state into separate components.

```tsx
// BAD
const SubmitButton = ({ isViewer }) => {
  if (isViewer) return <button>View Only</button>;
  return <button>Submit</button>;
};

// GOOD
const ViewerSubmitButton = () => <button>View Only</button>;
const AdminSubmitButton = () => <button>Submit</button>;
```

> Criteria: If code paths never execute simultaneously, split them to reduce cognitive load.

**Abstract implementation details**: Separate cross-cutting concerns (auth, logging) from business logic.

```tsx
// BAD
const MissionPage = () => {
  const { isLogin } = useAuth();
  if (!isLogin) return <LoginRedirect />;
  return <MissionList />;
};

// GOOD
const MissionPage = () => (
  <AuthGuard>
    <MissionList />
  </AuthGuard>
);
```

**Extract data fetching into hooks**: Components should know _what_ data they need, not _how_ to fetch it.

```tsx
// BAD: component knows fetching details
function TabNavigation() {
  const { data: categories } = useSuspenseQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
  });
  return <Tab>{categories.map(...)}</Tab>;
}

// GOOD: component only expresses "I need categories"
function TabNavigation() {
  const { data: categories } = useGetCategories();
  return <Tab>{categories.map(...)}</Tab>;
}
```

> Criteria: Data fetching is a cross-cutting concern. queryKey, queryFn, staleTime configs belong in hooks, not components.

**Split hooks by responsibility**: Prevent a single hook from accumulating unbounded state and logic.

```tsx
// BAD
const usePageState = () => {
  const cardId = useQueryParam("cardId");
  const date = useQueryParam("date");
  return { cardId, date };
};

// GOOD
const useCardIdQueryParam = () => useQueryParam("cardId");
const useDateRangeQueryParam = () => useQueryParam("date");
```

> Criteria: If a hook's responsibilities can grow unboundedly, split by domain.

### Name Things

**Name complex conditions**: Extract compound boolean expressions into meaningful variables.

```tsx
// BAD
if (user.age > 19 && user.hasLicense && !user.isBanned) { ... }

// GOOD
const canDrive = user.age > 19 && user.hasLicense && !user.isBanned;
if (canDrive) { ... }
```

**Name magic numbers**: Replace unexplained numeric literals with named constants.

```tsx
// BAD
setTimeout(handleClose, 300);

// GOOD
const MODAL_CLOSE_DELAY_MS = 300;
setTimeout(handleClose, MODAL_CLOSE_DELAY_MS);
```

### Top-to-Bottom Flow

**Minimize context switching**: Keep closely related logic physically close to reduce jumping between files.

**Simplify ternaries**: When ternaries nest 2+ levels deep, convert to if/early return.

```tsx
// BAD
return isLogin ? isAdmin ? <Admin /> : <User /> : <Guest />;

// GOOD
if (!isLogin) return <Guest />;
return isAdmin ? <Admin /> : <User />;
```

**Left-to-right range comparisons**: Write range checks like math inequalities.

```tsx
// BAD
if (score >= 80 && score <= 100)

// GOOD
if (80 <= score && score <= 100)
```

## 2. Predictability

A function's behavior should be predictable from its name, parameters, and return type alone.

**Consistent naming**: Same name = same behavior. Different behavior = different name.

**Unified return types**: Functions of the same category should return consistent structures.

```tsx
// BAD: inconsistent return shapes
const useUser = () => ({ user, loading });
const usePosts = () => [posts, isLoading];

// GOOD: unified return shape
const useUser = () => ({ data: user, isLoading });
const usePosts = () => ({ data: posts, isLoading });
```

**No hidden side effects**: Functions should not execute effects unpredictable from their signature.

```tsx
// BAD
const fetchBalance = () => {
  const data = api.get("/balance");
  logging.log("Balance checked"); // hidden side effect
  return data;
};

// GOOD
const balance = fetchBalance();
logging.log("Balance checked"); // explicit at call site
```

> Criteria: If a side effect can't be predicted from the function name or parameters (logging, global state mutation), extract it.

## 3. Cohesion

Code that changes together should live together.

**Centralize related constants**: If the same semantic value is scattered across files, consolidate it.

**Form management granularity**: If field A depends on field B, manage the entire form as a unit. If fields are independent, manage per-field.

**Directory colocation**: Files that change together belong in the same directory.

## 4. Coupling

Minimize the blast radius of changes.

**Allow duplication over premature abstraction**: Prefer duplication when shared code would require checking all dependents on every change.

```tsx
// BAD: forced abstraction with complex conditionals
const useCommonModal = () => { /* branching everywhere */ };

// GOOD: separate hooks when requirements may diverge
const useMissionModal = () => { ... };
const useAdminModal = () => { ... };
```

> Criteria: If modifying shared code requires auditing all consumers, allow duplication instead.

**Eliminate props drilling with composition**: When component depth increases, prefer composition over drilling.

```tsx
// BAD: intermediate components pass unused props
<Child user={user} /> // Child doesn't use user

// GOOD: composition eliminates drilling
<Child>
  <UserAvatar user={user} />
</Child>
```

> Criteria: When depth increases, try composition first before Context.

## Resolving Principle Conflicts

- **Readability vs Cohesion**: If separating code risks bugs from unsynchronized changes, prioritize cohesion. If the risk is low, prioritize readability.
- **Cohesion vs Coupling**: If increasing internal cohesion raises external coupling excessively, abstract the interface or redistribute responsibilities.
