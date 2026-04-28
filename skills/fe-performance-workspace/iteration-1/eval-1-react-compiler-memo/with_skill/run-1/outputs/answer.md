# PR 리뷰: React.memo / useCallback / useMemo 전면 도배 — 반려 의견

> **결론**: 이 PR은 반려합니다. React Compiler를 도입한 프로젝트에서 수동 메모이제이션을 선제적으로 전면 적용하는 것은 공식 문서가 명시적으로 권고하지 않는 방식이며, 실질적인 성능 이득 없이 코드 복잡도만 높입니다.

---

## 1. 이 프로젝트의 전제 — React Compiler는 "now stable"

이 프로젝트는 React 19 + React Compiler를 도입했습니다. React Compiler는 더 이상 실험적 도구가 아닙니다.

> "React Compiler is a new build-time tool that automatically optimizes your React app. It works with plain JavaScript, and understands the Rules of React, so you don't need to rewrite any code to use it."
>
> "We encourage everyone to start using React Compiler. While the compiler is still an optional addition to React today, in the future some features may require the compiler in order to fully work."
>
> — [React Docs · React Compiler / Introduction](https://react.dev/learn/react-compiler/introduction)

공식 문서는 React Compiler를 **"now stable"**로 표기하며 Meta 등에서 프로덕션 사용 중임을 명시합니다. **컴파일러는 빌드 타임에 컴포넌트와 값을 자동으로 메모이제이션하며, 수동 `memo`/`useMemo`/`useCallback`을 대체하는 것이 목적입니다.**

---

## 2. 공식 문서의 명시적 권고 — 신규 코드는 컴파일러에 맡긴다

> "**For new code**, we recommend relying on the compiler for memoization and using `useMemo`/`useCallback` where needed to achieve precise control."
>
> "By default, React Compiler will memoize your code based on its analysis and heuristics. **In most cases, this memoization will be as precise, or moreso, than what you may have written.**"
>
> "However, in some cases developers may need more control over memoization. The `useMemo` and `useCallback` hooks can continue to be used **as an escape hatch**."
>
> — [React Docs · React Compiler / Introduction](https://react.dev/learn/react-compiler/introduction)

신규 코드에서 `useMemo`/`useCallback`은 **escape hatch(탈출구)**입니다. 기본값이 아닙니다. 이 PR은 escape hatch를 전체 코드베이스에 기본 적용한 셈입니다.

---

## 3. "안전 차원에서 다 메모이제이션하자"가 안 되는 이유

### 3.1 메모이제이션은 캐시를 보장하지 않는다

> "**성능 최적화를 위해서만 `useMemo`를 사용해야 합니다.** 이 기능이 없어서 코드가 작동하지 않는다면 근본적인 문제를 먼저 찾아서 수정하세요."
>
> "React는 캐싱 된 값을 버려야 할 특별한 이유가 없는 한 버리지 않습니다."
>
> — [React 문서 · useMemo](https://react.dev/reference/react/useMemo)

> "메모이제이션은 성능을 최적화하는 것이지, 보장하는 것은 아니기 때문에 React는 여전히 다시 렌더링될 수도 있습니다."
>
> — [React 문서 · memo](https://react.dev/reference/react/memo)

**"안전 차원"이라는 전제 자체가 틀렸습니다.** `React.memo`로 감싸도 React는 필요 시 언제든 캐시를 버릴 수 있습니다. 정확성을 메모이제이션에 의존하는 코드는 잘못된 코드입니다.

### 3.2 `React.memo` 4가지 조건 체크리스트

공식 문서는 `memo`가 유용한 조건을 다음과 같이 제시합니다.

> "`memo`로 최적화하는 것은 컴포넌트가 정확히 동일한 Props로 자주 리렌더링 되고, 리렌더링 로직이 비용이 많이 드는 경우에만 유용합니다. ... **`memo`는 객체 또는 렌더링 중에 정의된 일반 함수처럼 *항상 다른* Props가 컴포넌트에 전달되는 경우에 완전히 무용지물입니다.**"
>
> — [React 문서 · memo](https://react.dev/reference/react/memo)

`memo`를 적용하려면 **아래 4가지 모두 YES**여야 합니다. 하나라도 NO면 비교 비용만 더하고 효과가 없습니다.

- [ ] **같은 props로 자주 리렌더링**되는가? (부모는 자주 리렌더되지만 이 컴포넌트의 props는 안 바뀌는 상황)
- [ ] **렌더링 비용이 큰가?** (복잡한 DOM 트리, 자식 컴포넌트 수, 내부 계산 비용)
- [ ] **React DevTools Profiler로 인지할 수 있는 지연이 확인**되는가? (추측 금지 — 측정 필수)
- [ ] **props가 매번 다른 참조는 아닌가?** (인라인 객체/함수가 prop으로 들어가면 `memo`는 즉시 무력화됨)

이 PR의 컴포넌트들은 Profiler 측정 없이 위 조건들을 통과했는지 알 수 없습니다.

### 3.3 `memo` + 인라인 prop 조합은 즉시 무력화된다

> "React는 기본적으로 `Object.is`로 각 Props를 비교합니다. 즉, 각각의 새로운 Prop가 이전 Prop와 참조가 동일한지 여부를 고려합니다."
>
> — [React 문서 · memo](https://react.dev/reference/react/memo)

```tsx
// ❌ memo 무용지물 — config와 onClick이 매 렌더마다 새 참조
const UserCard = memo(function UserCard({ config, onClick }) { ... });

<UserCard config={{ theme: 'dark' }} onClick={() => log()} />
```

이 PR에서 `memo`로 감싼 컴포넌트에 인라인 객체나 인라인 함수를 prop으로 넘기는 코드가 있다면, `memo`는 즉시 무력화되어 **비교 비용만 추가**됩니다.

### 3.4 `memo` 없는 자식에 `useCallback`은 무용지물

`useCallback`의 공식 사용 조건:

> **`useCallback`으로 함수를 캐싱하는 것은 몇 가지 경우에만 가치 있습니다.**
> - `memo`로 감싸진 컴포넌트에 prop으로 넘깁니다. 이 값이 변하지 않으면 리렌더링을 건너뛰고 싶습니다.
> - 넘긴 함수가 나중에 어떤 Hook의 의존성으로 사용됩니다.
>
> **다른 경우에서 `useCallback`으로 함수를 감싸는 것은 아무런 이익이 없습니다.**
>
> — [React 문서 · useCallback](https://react.dev/reference/react/useCallback)

`memo` 없는 자식은 어차피 부모 리렌더 시 함께 리렌더됩니다. 부모에서 함수 참조를 안정화해도 자식 입장에서 얻는 것이 없습니다.

### 3.5 `useMemo`의 공식 사용 조건 — 1ms 룰

> **`useMemo`로 최적화하는 것은 몇몇 경우에만 유용합니다.**
> - `useMemo`에 입력하는 계산이 눈에 띄게 느리고 종속성이 거의 변경되지 않는 경우.
> - `memo`로 감싸진 컴포넌트에 prop로 전달할 경우.
> - 전달한 값을 나중에 다른 Hook의 종속성으로 이용할 경우.
>
> **이 외는 계산을 `useMemo`로 감싸는 것에 대한 이득이 없습니다.**
>
> — [React 문서 · useMemo](https://react.dev/reference/react/useMemo)

공식 문서가 제시하는 판단 기준은 **1ms**입니다.

> "전체적으로 기록된 시간이 클 때(예시: `1ms` 이상) 해당 계산을 메모해 두는 것이 좋습니다."
>
> — [React 문서 · useMemo](https://react.dev/reference/react/useMemo)

```tsx
// ❌ 절대 1ms를 넘지 않는 단순 연산 — useMemo 낭비
const fullName = useMemo(() => `${first} ${last}`, [first, last]);
const isActive = useMemo(() => status === 'active', [status]);

// ✅ 비싼 정렬/필터링/파싱 (console.time으로 1ms 이상 확인 후 적용)
const sortedOrders = useMemo(
  () => orders.sort((a, b) => b.createdAt - a.createdAt),
  [orders]
);
```

---

## 4. 메모이제이션 전에 먼저 시도할 구조 개선

공식 문서는 메모이제이션 전에 다음 5가지 구조적 개선을 우선 시도하라고 권고합니다.

> 1. 컴포넌트가 다른 컴포넌트를 감싼다면 "JSX를 자식으로 받게 하세요"
> 2. "가능한 한 로컬 State를 선호하고, 컴포넌트 간 상태 공유를 필요 이상으로 하지 마세요"
> 3. "렌더링 로직을 순수하게 유지하세요"
> 4. "State를 업데이트하는 불필요한 Effect를 피하세요"
> 5. "Effect에서 불필요한 의존성을 제거하세요"
>
> — [React 문서 · useCallback](https://react.dev/reference/react/useCallback)

메모이제이션은 구조 문제를 가리는 도구가 아닙니다. 특히 Wrapper 컴포넌트는 `memo` 대신 `children` composition이 더 근본적인 해결책입니다.

```tsx
// ❌ Wrapper에 memo — 새 prop이 추가될 때마다 안정화 책임이 늘어난다
const Shell = memo(function Shell({ header, sidebar, content }) {
  return (
    <div className="shell">
      <div className="shell__header">{header}</div>
      <div className="shell__sidebar">{sidebar}</div>
      <div className="shell__content">{content}</div>
    </div>
  );
});

// ✅ children composition — Shell은 단순해지고, 자식 렌더는 부모가 관리
function Shell({ children }: { children: React.ReactNode }) {
  return <div className="shell">{children}</div>;
}
```

`children`으로 받는 구조에서는 부모가 리렌더돼도 `children` 참조가 안정적이어서 `memo` 없이도 자식 트리 리렌더를 회피할 수 있습니다.

---

## 5. 정말 수동 메모이제이션이 필요한 Escape Hatch 3가지

React Compiler를 사용하는 신규 코드에서 수동 메모이제이션이 정당화되는 경우는 다음으로 한정됩니다.

> "The `useMemo` and `useCallback` hooks can continue to be used **as an escape hatch**. **A common use-case for this is if a memoized value is used as an effect dependency**."
>
> — [React Docs · React Compiler / Introduction](https://react.dev/learn/react-compiler/introduction)

| # | Escape Hatch | 이유 |
|---|---|---|
| **1** | 메모이즈된 값/함수가 `useEffect` 의존성으로 들어가 effect 재실행을 막아야 할 때 | 컴파일러 휴리스틱과 무관하게 참조 안정성이 `useEffect` 정확성에 영향 |
| **2** | 컴파일러 휴리스틱보다 더 정밀한 제어가 필요한 특수 케이스 | 예: 렌더 중 비싼 계산이 1ms 이상임을 console.time으로 확인한 경우 |
| **3** | 특정 컴포넌트에서 컴파일이 문제를 일으킬 때 | `"use no memo"` 디렉티브 + TODO 주석 + 트래킹 이슈로 관리 |

```tsx
// Escape Hatch 1 — effect 의존성으로 인한 참조 안정화
function Search({ onResults }: { onResults: (r: Result[]) => void }) {
  useEffect(() => {
    fetchResults(query).then(onResults);
  }, [query, onResults]); // onResults가 매 렌더마다 새 참조면 무한 재실행
  return null;
}

// Escape Hatch 3 — 컴파일 제외
function ProblematicComponent() {
  "use no memo"; // TODO: [ISSUE-123] 컴파일러 호환성 확인 후 제거
  // ...
}
```

---

## 6. 요청하는 수정 방향

1. **모든 컴포넌트의 `React.memo` 제거** — 컴파일러가 자동 처리. Profiler에서 실제 성능 문제가 확인된 컴포넌트에만 위 4가지 조건 체크리스트를 통과한 뒤 재적용.
2. **모든 함수의 `useCallback` 제거** — `memo` 자식의 prop 전달 또는 `useEffect` 의존성 목적이 아닌 것은 전부 제거.
3. **모든 계산의 `useMemo` 제거** — `console.time`으로 1ms 이상임을 확인했거나, `memo` 자식 prop 전달 또는 `useEffect` 의존성 목적이 아닌 것은 전부 제거.
4. 제거 후에도 성능 문제가 실제로 측정되는 곳이 있다면, **React DevTools Profiler + Chrome DevTools Performance (CPU 4x slowdown)** 결과를 PR에 첨부하고 재논의.

---

## 참고 문서

- [React Docs · React Compiler / Introduction](https://react.dev/learn/react-compiler/introduction)
- [React 문서 · useMemo](https://react.dev/reference/react/useMemo)
- [React 문서 · useCallback](https://react.dev/reference/react/useCallback)
- [React 문서 · memo](https://react.dev/reference/react/memo)
- [Rules of React](https://react.dev/reference/rules)
