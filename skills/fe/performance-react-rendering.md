# Performance — React Rendering

> 핵심 메시지: **"측정 먼저, 최적화 나중. React Compiler를 우선 고려한다."**

이 문서는 **React 렌더링 성능 최적화**에 집중한다 (framework-agnostic — vanilla React, Vite, Next.js 모두 동일하게 적용). Next.js SSR 런타임 성능은 [performance-ssr.md](performance-ssr.md), 번들/빌드 영역은 [build-optimization.md](build-optimization.md), 측정은 [monitoring.md](monitoring.md) 참조.

## 목차

1. [1. React Compiler를 우선한다 (신규 코드)](#1-react-compiler를-우선한다-신규-코드) — 자동 메모이제이션, 도입 절차, 체크리스트
2. [2. 의사결정 트리 — Compiler vs 수동 Hook](#2-의사결정-트리--compiler-vs-수동-hook)
3. [3. 메모이제이션 전에 먼저 시도할 것](#3-메모이제이션-전에-먼저-시도할-것) — 구조적 개선 5가지
4. [4. 메모이제이션 대전제 — 3 API 통합 결정 규칙](#4-메모이제이션-대전제--3-api-통합-결정-규칙) — useMemo/useCallback/memo 의사결정 트리
5. [5. `useMemo` — "1ms 룰"과 측정](#5-usememo--1ms-룰과-측정)
6. [6. `useCallback` — `useMemo`의 함수 버전](#6-usecallback--usememo의-함수-버전)
7. [7. `React.memo` — 4가지 조건을 모두 만족할 때만](#7-reactmemo--4가지-조건을-모두-만족할-때만)
8. [8. 리스트 렌더링 최적화](#8-리스트-렌더링-최적화) — 가상화 (1000+ 아이템)
9. [❌ 안티패턴](#-안티패턴)

***

## 1. React Compiler를 우선한다 (신규 코드)

React Compiler는 빌드 타임에 컴포넌트와 값을 자동으로 메모이제이션한다. **수동 `memo`/`useMemo`/`useCallback`을 대체**하는 것이 목적이다.

> "React Compiler is a new build-time tool that automatically optimizes your React app. It works with plain JavaScript, and understands the Rules of React, so you don't need to rewrite any code to use it."
>
> — [React Docs · React Compiler / Introduction](https://react.dev/learn/react-compiler/introduction)

공식 문서는 React Compiler를 **"now stable"**로 표기하며 Meta 등에서 프로덕션 사용 중이다.

> "We encourage everyone to start using React Compiler. While the compiler is still an optional addition to React today, in the future some features may require the compiler in order to fully work."

### 도입 절차

```bash
npm install -D babel-plugin-react-compiler@latest
npm install -D eslint-plugin-react-hooks@latest
```

```js
// babel.config.js — React Compiler는 반드시 첫 번째에 배치
module.exports = {
  plugins: [
    'babel-plugin-react-compiler',
    // ... 다른 plugin
  ],
};
```

- **React 19**: 추가 런타임 불필요 (`react/compiler-runtime` 내장)
- **React 17/18**: `react-compiler-runtime`을 `dependencies`(devDependencies 아님)에 추가하고 `target: '18'` 명시
- 출처: [React Docs · react-compiler/Target](https://react.dev/reference/react-compiler/target)

### 도입 전 체크리스트

- [ ] `eslint-plugin-react-hooks` 위반 0건
- [ ] [Rules of React](https://react.dev/reference/rules) 준수
- [ ] `"use no memo"` 디렉티브로 임시 제외 가능 — TODO 주석 + 트래킹 이슈 권장

***

## 2. 의사결정 트리 — Compiler vs 수동 Hook

```
컴파일러를 사용 중인가?
├── YES (신규 코드)
│   └── 기본은 컴파일러에 맡긴다.
│       수동 useMemo/useCallback/memo를 선제적으로 작성하지 않는다.
│       다음 escape hatch에서만 수동 사용:
│         (1) 메모이즈 값이 useEffect 의존성으로 들어가 effect 재실행을 막아야 할 때
│         (2) 컴파일러 휴리스틱보다 더 정밀한 제어가 필요할 때
│         (3) 컴파일이 특정 컴포넌트에서 문제일 때 → "use no memo" + TODO
│
├── YES (기존 코드)
│   └── 기존 메모이제이션은 그대로 둔다.
│       제거하면 컴파일 출력이 달라지므로 신중한 테스트 후에만 제거.
│
└── NO (컴파일러 미사용)
    └── 측정 후 필요한 곳에만 수동 메모이제이션 (§4 ~ §7 참조)
```

근거:

> "By default, React Compiler will memoize your code based on its analysis and heuristics. **In most cases, this memoization will be as precise, or moreso, than what you may have written.**"
>
> "However, in some cases developers may need more control over memoization. The `useMemo` and `useCallback` hooks can continue to be used **as an escape hatch**. **A common use-case for this is if a memoized value is used as an effect dependency**."
>
> "**For new code**, we recommend relying on the compiler for memoization and using `useMemo`/`useCallback` where needed to achieve precise control."
>
> "**For existing code**, we recommend either leaving existing memoization in place... or carefully testing before removing the memoization."
>
> — [React Docs · React Compiler / Introduction](https://react.dev/learn/react-compiler/introduction)

```js
// 특정 컴포넌트만 컴파일 제외
function ProblematicComponent() {
  "use no memo"; // 임시 — TODO + 트래킹 이슈
  // ...
}
```

***

## 3. 메모이제이션 전에 먼저 시도할 것

`useMemo`/`useCallback`/`memo` 어느 것이든 추가하기 전에, 공식 문서는 다음 5가지 구조적 개선을 우선 시도하라고 권고한다.

> 1. 컴포넌트가 다른 컴포넌트를 감싼다면 "JSX를 자식으로 받게 하세요"
> 2. "가능한 한 로컬 State를 선호하고, 컴포넌트 간 상태 공유를 필요 이상으로 하지 마세요"
> 3. "렌더링 로직을 순수하게 유지하세요"
> 4. "State를 업데이트하는 불필요한 Effect를 피하세요"
> 5. "Effect에서 불필요한 의존성을 제거하세요"
>
> — [React 문서 · useCallback](https://react.dev/reference/react/useCallback)

메모이제이션은 구조 문제를 가리는 도구가 아니다. 구조부터 고치고, 측정한 뒤, 그래도 느리면 메모이제이션을 적용한다.

***

## 4. 메모이제이션 대전제 — 3 API 통합 결정 규칙

`useMemo`/`useCallback`/`memo`는 **같은 문제를 푸는 세 가지 도구**다: "매번 새로 생성되는 참조/값 때문에 발생하는 불필요한 작업을 줄인다." 셋을 따로 외우지 말고, 하나의 대전제와 하나의 결정 규칙으로 묶는다.

### 대전제 — 세 API 공통

> "**성능 최적화를 위해서만 `useMemo`를 사용해야 합니다.** 이 기능이 없어서 코드가 작동하지 않는다면 근본적인 문제를 먼저 찾아서 수정하세요."
>
> "React는 캐싱 된 값을 버려야 할 특별한 이유가 없는 한 버리지 않습니다."
>
> — [React 문서 · useMemo](https://react.dev/reference/react/useMemo)

> "메모이제이션은 성능을 최적화하는 것이지, 보장하는 것은 아니기 때문에 React는 여전히 다시 렌더링될 수도 있습니다."
>
> — [React 문서 · memo](https://react.dev/reference/react/memo)

→ 세 API 모두 **캐시를 보장하지 않는다**. React는 필요 시 언제든 캐시를 버릴 수 있다. **정확성**을 메모이제이션에 의존하는 코드는 잘못된 코드다. 메모이제이션은 오직 **성능**을 위해서만 쓴다.

### 의사결정 트리 — `useMemo` / `useCallback` / `memo`

```
0. §3의 5가지 구조 개선을 먼저 시도했는가?
   (JSX를 children으로 받기 / 로컬 상태 선호 / 순수 렌더 /
    불필요한 effect 제거 / 불필요한 의존성 제거)
│
└── 구조 개선으로 해결 안 됨 → 아래 질문으로
    │
    ├── 1. 값/함수가 다른 Hook(useEffect 등)의 의존성으로 쓰이는가?
    │      → useMemo / useCallback (effect 재실행 방지가 유일 목적)
    │         ※ 이 경우에는 자식 memo 여부와 무관하게 필요하다.
    │
    ├── 2. 자식 컴포넌트가 `memo`로 감싸져 있고 그 자식에
    │      값/함수를 prop으로 넘기는가?
    │      → useMemo / useCallback (참조 안정화 → memo의 Object.is 비교 통과)
    │
    ├── 3. 계산 자체가 "눈에 띄게" 느린가? (console.time 1ms 이상, §5)
    │      → useMemo
    │
    ├── 4. 같은 props로 자주 리렌더되고 렌더 비용이 큰 컴포넌트인가?
    │      → React.memo (단, §7의 4가지 조건을 모두 충족할 때만)
    │
    └── 위 어디에도 해당 없음 → 메모이제이션 불필요.
        React Compiler(§1~§2)가 있다면 컴파일러에 전적으로 맡긴다.
```

### 근거 인용 — 세 API의 공식 사용 조건

공식 문서는 세 API에 대해 거의 대칭적인 조건을 제시한다. 한 곳에 모아둔다.

> **`useMemo`로 최적화하는 것은 몇몇 경우에만 유용합니다.**
> - `useMemo`에 입력하는 계산이 눈에 띄게 느리고 종속성이 거의 변경되지 않는 경우.
> - `memo`로 감싸진 컴포넌트에 prop로 전달할 경우.
> - 전달한 값을 나중에 다른 Hook의 종속성으로 이용할 경우.
>
> 이 외는 계산을 `useMemo`로 감싸는 것에 대한 이득이 없습니다.
>
> — [React 문서 · useMemo](https://react.dev/reference/react/useMemo)

> **`useCallback`으로 함수를 캐싱하는 것은 몇 가지 경우에만 가치 있습니다.**
> - `memo`로 감싸진 컴포넌트에 prop으로 넘깁니다. 이 값이 변하지 않으면 리렌더링을 건너뛰고 싶습니다.
> - 넘긴 함수가 나중에 어떤 Hook의 의존성으로 사용됩니다.
>
> 다른 경우에서 `useCallback`으로 함수를 감싸는 것은 아무런 이익이 없습니다.
>
> — [React 문서 · useCallback](https://react.dev/reference/react/useCallback)

→ 두 인용은 의사결정 트리의 **1번(Hook 의존성) / 2번(memo 자식 prop) / 3번(비싼 계산, `useMemo`만)** 경로로 그대로 매핑된다. §5~§7의 세 절은 이 의사결정 트리의 각 API별 실행 가이드일 뿐이므로, 읽기 전에 위 트리를 먼저 확정한다.

***

## 5. `useMemo` — "1ms 룰"과 측정

의사결정 트리의 경로 1/2/3에서 `useMemo`가 필요하다고 판단되면, **경로 3(비싼 계산)**인 경우에 한해 "얼마나 비싼가"를 측정해야 한다. 경로 1(effect 의존성) / 경로 2(memo 자식 prop)는 측정과 무관하게 참조 안정화가 목적이므로 1ms 룰을 적용하지 않는다.

### 판단 기준 — 1ms 룰

> "전체적으로 기록된 시간이 클 때(예시: `1ms` 이상) 해당 계산을 메모해 두는 것이 좋습니다."
>
> — [React 문서 · useMemo](https://react.dev/reference/react/useMemo)

```js
console.time('filter array');
const visibleTodos = filterTodos(todos, tab);
console.timeEnd('filter array');
```

### 측정 시 주의 — 개발자 기기 함정

> "컴퓨터가 사용자의 컴퓨터보다 빠를 수 있으므로 인위적으로 속도를 낮추어 성능을 테스트하는 것이 좋습니다. ... 가장 정확한 타이밍을 얻으려면 **프로덕션용 앱을 빌드하고 사용자가 사용하는 것과 동일한 기기에서 테스트**하세요."
>
> — [React 문서 · useMemo](https://react.dev/reference/react/useMemo)

실무 체크리스트:
- [ ] Chrome DevTools → Performance → **CPU: 4x/6x slowdown** 적용
- [ ] **프로덕션 빌드** (`next build && next start`)로 측정 — dev 모드는 계측/검증 오버헤드로 과대 측정된다
- [ ] 가능하면 **실제 저사양 사용자 기기**에서 재확인

```tsx
// ❌ 단순 문자열 결합 — 1ms를 절대 넘지 않는다
const fullName = useMemo(() => `${first} ${last}`, [first, last]);

// ✅ 비싼 정렬/필터링/파싱 (1ms 룰 통과 확인 필수)
const sortedOrders = useMemo(
  () => orders.sort((a, b) => b.createdAt - a.createdAt),
  [orders]
);
```

> 📎 대전제(캐시 보장 아님)와 의사결정 트리는 §4 참조. **경로 1(effect 의존성)**에서는 1ms 룰과 무관하게 `useMemo`가 필요하다.

***

## 6. `useCallback` — `useMemo`의 함수 버전

공식 문서가 직접 보여주는 단순화된 구현 — `useCallback`은 `useMemo`의 특수형이다:

```js
function useCallback(fn, dependencies) {
  return useMemo(() => fn, dependencies);
}
```
— [React 문서 · useCallback](https://react.dev/reference/react/useCallback)

→ **결정 규칙은 §4 트리와 동일**하다. 차이는 안정화 대상이 "값"이 아니라 "함수 참조"라는 점뿐. 따라서 `useCallback`이 가치 있는 경우는 의사결정 트리의 **경로 1(Hook 의존성)** 과 **경로 2(memo 자식 prop)** 둘뿐이다. 경로 3(1ms 룰)은 함수 자체가 아니라 함수 *내부 계산*에 적용되므로 `useMemo`를 쓴다.

### 핵심 함정 — `memo` 없는 자식에 `useCallback`은 무용지물

자식이 `memo`로 감싸지지 않았다면, 자식은 어차피 부모 리렌더 시 함께 리렌더된다. 부모에서 함수 참조를 안정화해도 자식 입장에서 얻는 게 아무것도 없다.

```tsx
// ✅ memo + useCallback (한 쌍) — 경로 2
const ShippingForm = memo(function ShippingForm({ onSubmit }) {
  return <form onSubmit={onSubmit}>...</form>;
});

function ProductPage({ productId }: { productId: string }) {
  const handleSubmit = useCallback(
    (data: FormData) => submit(productId, data),
    [productId]
  );
  return <ShippingForm onSubmit={handleSubmit} />;
}

// ❌ memo 없는 자식 — useCallback은 효과 없음
function Parent() {
  const handleClick = useCallback(() => {}, []); // 무의미
  return <Child onClick={handleClick} />; // Child에 memo 없음
}

// ✅ 예외 — 경로 1: 자식 내부에서 effect 의존성으로 쓰임
function Search({ onResults }: { onResults: (r: Result[]) => void }) {
  // memo가 없어도 onResults 참조가 안정적이어야 effect가 무한 재실행되지 않는다
  useEffect(() => {
    fetchResults(query).then(onResults);
  }, [query, onResults]);
  return null;
}
```

→ `memo` 없는 자식에 `useCallback`을 쓰는 게 정당화되는 유일한 경우는 **자식 내부에서 그 함수가 Hook 의존성으로 쓰일 때**다 (위 `Search` 예시).

***

## 7. `React.memo` — 4가지 조건을 모두 만족할 때만

### 공식 기준

> "`memo`로 최적화하는 것은 컴포넌트가 정확히 동일한 Props로 자주 리렌더링 되고, 리렌더링 로직이 비용이 많이 드는 경우에만 유용합니다. ... **`memo`는 객체 또는 렌더링 중에 정의된 일반 함수처럼 *항상 다른* Props가 컴포넌트에 전달되는 경우에 완전히 무용지물입니다.**"
>
> — [React 문서 · memo](https://react.dev/reference/react/memo)

### 4가지 조건 체크리스트

`memo`를 적용하기 전에 **네 항목 모두 YES**여야 한다. 하나라도 NO면 `memo`는 비교 비용만 더하고 효과가 없다.

- [ ] **같은 props로 자주 리렌더링**되는가? (부모는 자주 리렌더되지만 이 컴포넌트의 props는 안 바뀌는 상황)
- [ ] **렌더링 비용이 큰가?** (복잡한 DOM 트리, 자식 컴포넌트 수, 내부 계산 비용)
- [ ] **Profiler로 인지할 수 있는 지연이 확인**되는가? (React DevTools Profiler — 추측 금지)
- [ ] **props가 매번 다른 참조는 아닌가?** (인라인 객체/함수가 prop으로 들어가면 §5/§6으로 먼저 안정화)

### Props 비교는 얕은 비교 (`Object.is`)

> "React는 기본적으로 `Object.is`로 각 Props를 비교합니다. 즉, 각각의 새로운 Prop가 이전 Prop와 참조가 동일한지 여부를 고려합니다."
>
> — [React 문서 · memo](https://react.dev/reference/react/memo)

→ `memo`는 **참조 동일성**만 본다. 인라인 `{}`, 인라인 `() => {}`는 매번 새 참조라 즉시 무력화된다. 4번째 체크박스가 핵심인 이유다.

```tsx
// ❌ 인라인 객체/함수 — memo 무용지물
<UserCard config={{ theme: 'dark' }} onClick={() => log()} />

// ✅ 참조 안정화 후 memo
const config = useMemo(() => ({ theme: 'dark' }), []);
const handleClick = useCallback(() => log(), []);
<UserCard config={config} onClick={handleClick} />
```

### Pitfall 1 — 커스텀 `arePropsEqual`로 "해결"하지 마라

> "`arePropsEqual`를 구현하는 경우 **함수를 포함하여 모든 Prop를 비교해야 합니다.** **깊은 비교는 매우 느려질 수 있으며** 나중에 누군가 데이터 구조를 변경하면 앱이 잠깐 정지될 수 있습니다."
>
> — [React 문서 · memo](https://react.dev/reference/react/memo)

깊은 비교는 두 가지 문제를 만든다:
1. **비교 자체의 비용**이 메모이제이션 이득을 초과할 수 있다.
2. **숨은 의존성** — 데이터 구조가 바뀌면 비교 함수가 조용히 깨지고, 컴포넌트가 stale props로 렌더된다.

→ 해결책은 깊은 비교가 아니다. **props 구조를 단순화**하거나 **참조를 안정화**(§5/§6)한다. 정말 깊은 비교가 필요해 보이면 보통은 컴포넌트 분해가 틀린 신호다.

### Pitfall 2 — Wrapper에 `memo`보다 children composition이 먼저

대전제(§4) 직전 §3에서 인용한 공식 권고 첫 번째 항목을 다시 가져오면:

> "컴포넌트가 다른 컴포넌트를 시각적으로 감쌀 때 **JSX를 자식으로 받아들이도록 하세요.**"
>
> — [React 문서 · useCallback](https://react.dev/reference/react/useCallback) (§3)

Wrapper가 리렌더 문제를 일으킨다고 해서 바로 `memo`로 감싸는 것은 잘못된 순서다. **부모에서 변경되는 props 자체를 줄이고** `children`으로 받는 구조로 바꾸는 것이 우선이다. children은 부모 리렌더와 무관하게 동일 참조로 전달되므로 `memo` 없이도 자식 트리 리렌더를 회피할 수 있다.

```tsx
// ❌ Wrapper에 memo — 새 prop이 추가될 때마다 안정화 책임이 늘어난다
const Shell = memo(function Shell({
  header,
  sidebar,
  content,
}: {
  header: React.ReactNode;
  sidebar: React.ReactNode;
  content: React.ReactNode;
}) {
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

// 사용처: 자식 트리는 부모가 리렌더돼도 동일 참조로 전달된다
<Shell>
  <Header />
  <Sidebar />
  <Content />
</Shell>
```

### `memo`는 보장이 아니다 — §4 대전제 재확인

> "메모이제이션은 성능을 최적화하는 것이지, 보장하는 것은 아니기 때문에 React는 여전히 다시 렌더링될 수도 있습니다."
>
> — [React 문서 · memo](https://react.dev/reference/react/memo)

→ `memo`로 감싼 컴포넌트가 "**절대** 리렌더되지 않을 것"이라 가정하고 부수효과를 거기에 의존시키지 마라. 이는 §4 대전제의 직접 적용이다.

***

## 8. 리스트 렌더링 최적화

대량 리스트(1000+ 아이템)는 가상화로 DOM 노드 수를 제한한다.

```tsx
import { useVirtualizer } from '@tanstack/react-virtual';

function VirtualList({ items }: { items: Item[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 60,
  });

  return (
    <div ref={parentRef} style={{ height: 400, overflow: 'auto' }}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map(virtualRow => (
          <div
            key={virtualRow.key}
            style={{
              position: 'absolute',
              top: virtualRow.start,
              height: virtualRow.size,
              width: '100%',
            }}
          >
            <ItemRow item={items[virtualRow.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

***

## ❌ 안티패턴

- **측정 없이 최적화** — Profiler/console.time 없이 "느린 것 같아서" 메모이제이션을 추가한다. §5의 1ms 룰과 §7의 Profiler 체크박스는 이를 막기 위한 것이다.
- **인라인 prop으로 `memo` 사용** — `<Child config={{ a: 1 }} />`처럼 매번 새 객체를 만들면 `memo`는 즉시 무력화된다. §7의 4번째 체크박스가 이를 차단한다.
- **`memo` 없는 자식에 `useCallback`** — 자식은 어차피 부모 리렌더와 함께 리렌더된다. 참조 안정화의 의미가 없다. §6의 함정 참조.
- **`useMemo`에 의존한 정확성** — `useMemo`/`useCallback`/`memo`는 캐시를 *보장하지 않는다*. 정확성은 다른 방법으로. §4 대전제.
- **모든 컴포넌트에 `memo` 도배** — 비교 비용이 메모이제이션 이득을 초과한다. §7의 4가지 조건 체크리스트를 통과한 곳에만.

***

> 📎 관련: [performance-ssr.md](performance-ssr.md) (Next.js SSR 런타임 성능) · [build-optimization.md](build-optimization.md) (번들 크기) · [monitoring.md](monitoring.md) (Profiler / Web Vitals 측정) · [code-quality.md](code-quality.md) · [architecture.md](architecture.md)
