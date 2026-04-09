# Component Patterns

> 참조: [Kent C. Dodds — Advanced React Component Patterns](https://kentcdodds.com/blog) · [Radix Primitives — Composition Guide](https://www.radix-ui.com/primitives/docs/guides/composition) · [shadcn/ui](https://ui.shadcn.com/docs) · [Dan Abramov — The Two Reacts](https://overreacted.io/the-two-reacts/) · [React 공식 문서](https://react.dev) · [Matt Pocock — Discriminated Unions](https://www.totaltypescript.com/discriminated-unions-are-a-devs-best-friend)
> 핵심 메시지: **"좋은 컴포넌트 API는 사용자가 자기 문제를 해결할 수 있게 한다."**

프론트엔드에서 재사용 가능한 컴포넌트의 품질은 "얼마나 많은 기능을 지원하는가"가 아니라 **"얼마나 잘 합성되는가"** 로 판단된다. 이 문서는 그 판단 기준과 팀 스택(React + Next.js App Router + TypeScript + shadcn/ui + Radix Primitives)에 맞춘 권장 패턴을 정리한다.

## 목차

1. [합성 기본 — children](#1-합성-기본--children)
2. [Compound Components](#2-compound-components)
3. [Polymorphism — Radix Slot (`asChild`)](#3-polymorphism--radix-slot-aschild)
4. [Controlled / Uncontrolled dual API](#4-controlled--uncontrolled-dual-api)
5. [로직과 프리젠테이션 분리 — 현대적 접근](#5-로직과-프리젠테이션-분리--현대적-접근)
6. [Props API 설계](#6-props-api-설계)
7. [고급 패턴 (라이브러리 레벨)](#7-고급-패턴-라이브러리-레벨)
8. [컴포넌트 크기 판단](#8-컴포넌트-크기-판단)
9. [안티패턴](#9-안티패턴)

***

## 1. 합성 기본 — children

> 출처: [React 공식 — Passing Props to a Component](https://react.dev/learn/passing-props-to-a-component)

합성은 React가 권장하는 **가장 기본적인 재사용 단위**다. Props로 모든 것을 제어하려 하지 말고, `children`으로 "구멍"을 제공해 부모가 임의의 JSX로 채우게 한다.

```tsx
// ❌ Props로 모든 걸 제어 — 레이아웃이 바뀔 때마다 Card API를 고쳐야 한다
<Card title="프로필" icon={<UserIcon />} actions={[...]} footer="..." />

// ✅ children으로 합성 — Card는 자기 역할(shell)만 한다
<Card>
  <CardHeader>
    <UserIcon />
    <h2>프로필</h2>
  </CardHeader>
  <CardContent>{/* ... */}</CardContent>
</Card>
```

### `React.Children` API는 피한다

> "Using `Children` is uncommon and can lead to fragile code. ... When you can, try to avoid using the `Children` methods."
> — [react.dev/reference/react/Children](https://react.dev/reference/react/Children)

React 공식이 직접 권장하는 **4가지 대안**:

1. **Visual wrapper** — 단순히 "구멍을 채운다" → `children` 그대로
2. **구조 제약이 필요** → 하위 컴포넌트를 export (§2 Compound Components)
3. **순수 데이터 컬렉션** → 객체 배열 prop
4. **동적 렌더링 제어** → render prop (함수 children)

***

## 2. Compound Components

> 출처: [Kent C. Dodds — Compound Components with React Hooks](https://kentcdodds.com/blog/compound-components-with-react-hooks)

두 개 이상의 컴포넌트가 하나의 기능을 함께 수행하는 패턴. `<select><option>` 같은 HTML 기본 요소가 보여주는 구조다. 부모-자식이 **암묵적으로 Context를 공유**하며 하나의 기능을 구현한다. Tabs, Accordion, Menu, Dialog 등이 전형적인 사례.

### 최소 레시피

```tsx
type ToggleCtx = { on: boolean; toggle: () => void };
const ToggleContext = React.createContext<ToggleCtx | null>(null);

function useToggleContext() {
  const ctx = React.useContext(ToggleContext);
  if (!ctx) throw new Error('Toggle.* must be used within <Toggle>');
  return ctx;
}

export function Toggle({ children }: { children: React.ReactNode }) {
  const [on, setOn] = React.useState(false);
  const toggle = React.useCallback(() => setOn((o) => !o), []);
  const value = React.useMemo(() => ({ on, toggle }), [on, toggle]);
  return <ToggleContext.Provider value={value}>{children}</ToggleContext.Provider>;
}

Toggle.On = function ToggleOn({ children }: { children: React.ReactNode }) {
  const { on } = useToggleContext();
  return on ? <>{children}</> : null;
};

Toggle.Button = function ToggleButton() {
  const { on, toggle } = useToggleContext();
  return <button onClick={toggle}>{on ? 'ON' : 'OFF'}</button>;
};
```

### 참고

* **React 공식은 "compound components"라는 용어를 쓰지 않는다.** [passing-data-deeply-with-context](https://react.dev/learn/passing-data-deeply-with-context)의 `LevelContext` + `Section`/`Heading` 예시가 실질적으로 같은 패턴이지만, React 팀은 이를 "Context 사용 사례"로만 설명한다. "Kent가 대중화한 이름"으로 부르는 게 정확하다.
* **언제 쓰지 말 것인가는 Kent 원문에 명시되지 않았다.** 팀 판단: 부모-자식 간 상태 공유가 **실제로 필요 없으면** 오버헤드다. 단일 props 인터페이스로 충분하면 compound 구조를 강요하지 않는다.

***

## 3. Polymorphism — Radix Slot (`asChild`)

> 출처: [Radix — Composition Guide](https://www.radix-ui.com/primitives/docs/guides/composition) · [Slot utility](https://www.radix-ui.com/primitives/docs/utilities/slot)

> "When `asChild` is set to `true`, Radix will not render a default DOM element, instead cloning the part's child and passing it the props and behavior required to make it functional."
> — Radix 공식

**팀 표준은 `asChild` + Radix `Slot` 이다. `as` prop은 제한적으로만 허용한다.**

이유: 팀 스택이 shadcn/ui 기반인데, [shadcn Button 소스](https://github.com/shadcn-ui/ui/blob/e9546e87ffdcad60015bf9d9bfb34e0488e8ab6e/apps/v4/registry/new-york-v4/ui/button.tsx) 자체가 `asChild` 만 쓴다.

### 3.1 `asChild` 기본 사용

```tsx
// shadcn Button — 실제 소스 발췌
function Button({ asChild = false, ...props }: React.ComponentProps<'button'> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'button';
  return <Comp {...props} />;
}

// 사용: 버튼을 Next.js Link로 렌더하면서 button 스타일·동작 유지
<Button asChild>
  <Link href="/login">로그인</Link>
</Button>
```

### 3.2 `asChild` 대상 컴포넌트의 필수 조건

Radix 공식이 명시하는 두 가지 요구사항:

> "Your component must spread all props onto the underlying DOM node."
> "Components must forward refs using `React.forwardRef`, since Radix occasionally needs to attach refs."
> — Radix Composition Guide

```tsx
// ✅ asChild 대상으로 쓸 수 있는 컴포넌트
const MyButton = React.forwardRef<HTMLButtonElement, React.ComponentProps<'button'>>(
  (props, ref) => <button {...props} ref={ref} />,
);
```

위반하면 ARIA 속성이 유실되고(props spread 누락) 포커스·사이즈 측정이 깨진다(ref 누락).

### 3.3 Slot 내부 동작 — 알아두면 유용한 것들

Radix `Slot`이 자식에 props를 merge할 때:

* **이벤트 핸들러 (`on[A-Z]`)** — 체이닝. **자식 핸들러가 먼저** 실행된 후 부모 핸들러. 자식이 `e.preventDefault()` 해도 부모는 실행되므로, 체인을 끊으려면 부모가 `event.defaultPrevented`를 확인해야 한다
* **`style`** — 객체 병합, **자식이 우선**
* **`className`** — 문자열 concat
* **`ref`** — [`composeRefs`](https://github.com/radix-ui/primitives/blob/22473d16404bfd446305db5b6c9308aece99fdec/packages/react/slot/src/slot.tsx)로 부모 ref + 자식 ref 합성
* **Fragment 자식** — ref 주입 불가 (소스 L111 체크)
* **다중 자식** — `<Slot.Slottable>{children}</Slot.Slottable>` 로 merge 타깃 명시 필요

### 3.4 `as` prop은 언제 허용하는가

`as` prop은 semantic tag 스위칭이 본질인 **저수준 레이아웃 primitive**(Text, Box, Heading 계열)에만 허용한다. 구현하려면 [Ohans Emmanuel freeCodeCamp 표준 레시피](https://www.freecodecamp.org/news/build-strongly-typed-polymorphic-components-with-react-and-typescript/)를 따르되, **팀 내 1개 파일에 helper 타입을 정의하고 재사용**한다.

**한 컴포넌트에 `asChild`와 `as`를 동시에 올리는 것은 금지한다** — prop 충돌과 타입 폭발이 발생한다.

> **한계**: `forwardRef`는 제네릭을 보존하지 못해 polymorphic과 결합 시 **외부 함수 타입 수동 선언 + 타입 어셔션** 이 필요하다. 이는 실질적으로 타입 workaround이므로, 대부분의 컴포넌트에서는 `asChild`가 더 안전한 선택이다.

***

## 4. Controlled / Uncontrolled dual API

> 출처: [React — Sharing State Between Components](https://react.dev/learn/sharing-state-between-components) · [Radix — Introduction](https://www.radix-ui.com/primitives/docs/overview/introduction)

재사용 컴포넌트의 모범은 **기본은 uncontrolled, 선택적으로 controlled** 를 둘 다 지원하는 것이다 (Radix 철학과 일치). Uncontrolled는 부모가 설정할 것이 적어 쓰기 쉽지만 여러 컴포넌트와 조율하기 어렵고, controlled는 완전한 제어가 가능하지만 부모가 모든 상태를 관리해야 한다.

### 표준 prop 쌍 — Radix 컨벤션 채택

팀 스택이 shadcn/Radix이므로 **Radix와 동일한 네이밍**을 쓴다:

```tsx
// Radix Switch — 실제 API
<Switch.Root
  checked={checked}                // controlled 값 (선택)
  defaultChecked={false}           // uncontrolled 초기값 (선택)
  onCheckedChange={setChecked}     // 변경 콜백
/>
```

### 내부 구현 레시피

Kent의 [control-props-vs-state-reducers](https://kentcdodds.com/blog/control-props-vs-state-reducers) 글은 내부 구현 코드를 싣지 않는다(Kent 본인이 유료 워크숍으로 link). 대신 **React 공식 패턴**을 쓴다:

```tsx
type Props = {
  value?: string;              // controlled (있으면 외부 제어)
  defaultValue?: string;       // uncontrolled 초기값
  onValueChange?: (v: string) => void;
};

function MyInput({ value: controlledValue, defaultValue = '', onValueChange }: Props) {
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : internalValue;

  const handleChange = (next: string) => {
    if (!isControlled) setInternalValue(next);
    onValueChange?.(next);
  };

  return <input value={value} onChange={(e) => handleChange(e.target.value)} />;
}
```

***

## 5. 로직과 프리젠테이션 분리 — 현대적 접근

### 5.1 Container/Presentational 은 철회됐다

> "**Update from 2019:** I don't *suggest* splitting your components like this anymore... The main reason I found it useful was because it let me separate complex stateful logic from other aspects of the component. **Hooks let me do the same thing without an arbitrary division.**"
> — Dan Abramov, ["Smart and Dumb Components" (2019 업데이트)](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0)

원 저자가 직접 철회했다. 대안은 두 가지다.

### 5.2 대안 1 — Custom Hooks

> 출처: [React 공식 — Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks)

로직을 훅으로 뽑아내면 컴포넌트는 **의도**만 표현하고 **구현**은 훅에 숨길 수 있다.

```tsx
// 로직은 hook으로, 컴포넌트는 UI만
function useOrders(filters: Filters) {
  return useSuspenseQuery({
    queryKey: ['orders', filters],
    queryFn: () => fetchOrders(filters),
  });
}

function OrderList({ filters }: { filters: Filters }) {
  const { data } = useOrders(filters);
  return <ul>{data.map((o) => <OrderItem key={o.id} order={o} />)}</ul>;
}
```

React 공식 권장: **"Keep custom Hooks focused on concrete high-level use cases."** `useChatRoom(options)`, `useImpressionLog(event)` 같이 **구체적 사용 시나리오**에 묶는다. `useEffect` 래퍼처럼 추상적인 hook은 피한다.

### 5.3 대안 2 — Server / Client 분리 (Next.js App Router)

> 출처: [Dan Abramov — The Two Reacts](https://overreacted.io/the-two-reacts/) · [react.dev — Server Components](https://react.dev/reference/rsc/server-components)

Next.js App Router의 RSC 모델은 `UI = f(data, state)`의 두 축을 실행 환경으로 분리한다. Server Component는 데이터를 읽고 렌더링하며, 인터랙션은 `'use client'` 경계로 이동한다.

```tsx
// ✅ Server — 데이터 읽기 (async component, 서버에서 실행)
export default async function OrdersPage() {
  const orders = await fetchOrders();      // DB/API 직접 호출
  return <OrderList orders={orders} />;
}

// ✅ Client — 인터랙션만
'use client';
function OrderFilterBar() {
  const [status, setStatus] = useState('all');
  // ...
}
```

2015년 Container/Presentational의 "임의 분리"와 달리, **런타임 경계가 자연스럽게 강제하는 구조적 분리**다.

→ 상세: [architecture.md §6](architecture.md) · [performance-ssr.md](performance-ssr.md)

***

## 6. Props API 설계

### 6.1 Naming — Radix 컨벤션 기본

팀 스택 일관성을 위해 **Radix 네이밍을 기본**으로 한다:

| 종류 | 패턴 | 예시 |
|---|---|---|
| Event handler | `on` + PascalCase | `onClick`, `onValueChange`, `onCheckedChange` |
| Controlled value | HTML 표준명 | `value`, `checked`, `open` |
| Uncontrolled 초기값 | `default` + 값 이름 | `defaultValue`, `defaultChecked`, `defaultOpen` |
| 상태 flag | HTML 표준명 (접두사 없음) | `disabled`, `required`, `readOnly` |

Adobe React Aria 컨벤션(`isSelected`, `isDisabled`)도 업계 표준이지만, **한 프로젝트에서 두 컨벤션을 혼용하지 말 것**. shadcn/Radix 기반이면 Radix 스타일을 쓴다.

### 6.2 Boolean 남용 방지 — Inversion of Control

> "Alright, so we literally only have six use cases that our app cares about, but we actually support any combination of these features which is **16**."
> "Each new argument/option/prop you add to your reusable code makes it harder for end users to use."
> — Kent C. Dodds, [Inversion of Control](https://kentcdodds.com/blog/inversion-of-control)

Boolean prop 4개가 조합되면 실제로는 **2⁴ = 16가지 상태**가 된다. 대부분은 의미 없는 조합이고, 문서화·테스트·유지보수 비용이 폭증한다.

```tsx
// ❌ 의미 없는 조합까지 허용
<Button primary large outlined loading />

// ✅ 1. variant로 묶기
<Button variant="primary" size="lg" appearance="outline" state="loading" />

// ✅ 2. IoC — 사용자가 children으로 결정
<Button>{isLoading ? <Spinner /> : 'Submit'}</Button>
```

### 6.3 Children vs Props — 판단 기준

[§1의 React 공식 4가지 대안](#1-합성-기본--children)을 따른다. 빠른 결정 트리:

```
UI 조각이 "구멍에 들어가는가"? → children
                              → 다음:
  하위 구조에 제약이 있는가?  → Compound Components
                              → 다음:
  순수 데이터 컬렉션인가?     → 객체 배열 prop
                              → 다음:
  상태에 따라 동적 렌더링?    → render prop
                              → 그 외: 일반 props
```

### 6.4 Controlled / Uncontrolled dual → [§4 참조](#4-controlled--uncontrolled-dual-api)

### 6.5 Default values

Destructuring default 문법이 React 공식 표준이다 ([react.dev](https://react.dev/learn/passing-props-to-a-component)).

```tsx
// ✅ 표준 — destructuring default
function Avatar({ person, size = 100 }: Props) { /* ... */ }
```

**`defaultProps`는 함수 컴포넌트에서 deprecated.** 근거: [React RFC #107](https://github.com/reactjs/rfcs/pull/107) — "function components really isn't much need for this pattern since you can just use JS default arguments." 경고 활성화: [PR #25699](https://github.com/facebook/react/pull/25699). 단, class 컴포넌트의 `static defaultProps`는 아직 유효하다.

주의: destructuring default는 `undefined`와 missing prop에만 적용되고 **`null` 에는 적용되지 않는다**.

### 6.6 Discriminated Unions (TypeScript)

> 출처: [Matt Pocock — Discriminated Unions Are A Dev's Best Friend](https://www.totaltypescript.com/discriminated-unions-are-a-devs-best-friend)

Optional prop을 남발하면 "있으면 안 되는데 있을 수 있는" 상태가 타입에 허용된다. Boolean 2-3개가 **"조합될 수 없는" 관계**라면 즉시 discriminated union으로 바꾼다:

```tsx
// ❌ bag of optionals — status="success"인데 data가 없는 상태를 타입이 허용
type ModalProps = {
  variant: 'base' | 'with-description';
  title: string;
  description?: string;  // variant에 따라 필수/금지가 다른데 optional이면 실수 가능
  buttonText?: string;
};

// ✅ discriminated union — 타입 시스템이 잘못된 조합을 컴파일 타임에 차단
type ModalProps =
  | { variant: 'base'; title: string }
  | { variant: 'with-description'; title: string; description: string; buttonText: string };
```

### 6.7 Spread props는 절제해서 쓴다

> "Use spread syntax with restraint. If you're using it in every other component, something is wrong. Often, it indicates that you should split your components and pass children as JSX."
> — [react.dev](https://react.dev/learn/passing-props-to-a-component)

`...rest` spread는 **저수준 wrapper/primitive**(Button, Input 등)에만 쓴다. 일반 기능 컴포넌트에서 쓰고 있다면 "children으로 분리해야 한다는 신호"다.

***

## 7. 고급 패턴 (라이브러리 레벨)

이 섹션은 **재사용 가능한 라이브러리·디자인 시스템 primitive**를 만들 때만 고려한다. 일반 제품 코드에는 과잉설계다.

### 7.1 State Reducer Pattern

> "a mechanism for the author of the API to allow the user of the API to control how things work internally." — **inversion of control**
> — Kent C. Dodds, [State Reducer Pattern](https://kentcdodds.com/blog/the-state-reducer-pattern-with-react-hooks)

라이브러리가 opinionated 기본 동작(예: 드롭다운이 선택 후 자동으로 닫힘)을 가지고 있지만, 일부 사용처에서 **fork 없이** 그 동작을 바꿔야 할 때 정당화된다. Downshift가 대표 사례 (multi-select는 선택 후에도 열려 있어야 함).

```tsx
function useToggle({ reducer = toggleReducer } = {}) {
  const [{ on }, dispatch] = React.useReducer(reducer, { on: false });
  return { on, toggle: () => dispatch({ type: 'TOGGLE' }) };
}

// 사용자 override — 특정 조건에서 toggle 무시
const { on, toggle } = useToggle({
  reducer(state, action) {
    const changes = toggleReducer(state, action);
    if (tooManyClicks && action.type === 'TOGGLE') return { ...changes, on: state.on };
    return changes;
  },
});
```

Kent 본인의 주의: **"this pattern works best when it's applied to complex hooks and components (like downshift)."** 단순 상태에는 쓰지 않는다.

### 7.2 Props Getters

Render prop + 여러 핸들러 merge가 필요한 Combobox·Autocomplete·Form field 수준에서 쓴다. [Downshift](https://github.com/downshift-js/downshift)가 대표적 — 소비자가 어떤 element를 어떻게 렌더할지 완전히 제어하고, 컴포넌트는 필요한 props(핸들러·ARIA)를 함수로 제공한다. [Kent의 원문](https://kentcdodds.com/blog/how-to-give-rendering-control-to-users-with-prop-getters)에서 `callAll` 유틸:

```tsx
const callAll = (...fns: Array<((...args: any[]) => void) | undefined>) =>
  (...args: any[]) => fns.forEach((fn) => fn && fn(...args));

function useToggle() {
  const [on, setOn] = React.useState(false);
  const toggle = () => setOn((o) => !o);
  const getTogglerProps = <P extends { onClick?: () => void }>(props = {} as P) => ({
    'aria-pressed': on,
    ...props,
    onClick: callAll(props.onClick, toggle),  // 사용자 핸들러 + 내부 핸들러 둘 다 실행
  });
  return { on, getTogglerProps };
}
```

**단순 props 객체로는 부족한 이유**: 사용자가 자기 `onClick`을 추가하고 싶을 때, spread 한쪽이 다른 쪽을 덮어쓴다. `getTogglerProps()`가 이 문제를 해결한다.

***

## 8. 컴포넌트 크기 판단

컴포넌트 분리 기준(Kent의 7가지 문제 신호, 변경 이유, 줄 수의 역할)은 **SSOT를 [architecture.md §5](architecture.md) 에 둔다**. 이 문서에서 반복하지 않는다.

요약: **줄 수는 "리뷰 트리거"이지 "분리 기준"이 아니다.** 리렌더링·재사용·책임 혼란·테스트 난이도·머지 충돌 중 하나라도 나타나면 분리를 고려한다.

***

## 9. 안티패턴

| 안티패턴 | 대안 | 근거 |
|---|---|---|
| **God Component** — 500줄+, 모든 상태와 로직을 한 컴포넌트에 | Kent 7 신호로 분리 | [architecture.md §5](architecture.md) |
| **Container/Presentational 강제 분리** | Custom hooks 또는 Server/Client 분리 | [§5.1](#51-containerpresentational-은-철회됐다) |
| **Boolean prop 폭발** (4개+ boolean) | variant / discriminated union / IoC | [§6.2](#62-boolean-남용-방지--inversion-of-control) |
| **`React.Children` API 사용** | children 그대로 / compound / 객체 배열 / render prop | [§1](#1-합성-기본--children) |
| **`defaultProps` in 함수 컴포넌트** | destructuring default | [§6.5](#65-default-values) |
| **`as` prop 남발 + `asChild` 혼용** | `asChild` 우선, `as` 는 레이아웃 primitive에만 | [§3](#3-polymorphism--radix-slot-aschild) |
| **Inline component definition** — 부모 렌더 내부에 컴포넌트 정의 | 부모 바깥으로 hoist | 리렌더마다 새 컴포넌트 생성 → 상태 소실 |
| **Props drilling → Context 즉시 도피** | 먼저 composition (children) 시도 | Context는 "진짜 전역"일 때만 |
| **`useEffect`로 상태 동기화** | derived state는 렌더 중 계산, 이벤트는 핸들러에서 | [react-effects.md](react-effects.md) |

***

> 📎 관련: [architecture.md](architecture.md) · [code-quality.md](code-quality.md) · [state-management.md](state-management.md) · [design-system.md](design-system.md) · [react-effects.md](react-effects.md) · [forms.md](forms.md)
