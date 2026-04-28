# PR 리뷰: React.memo / useCallback / useMemo 과도한 사용

> **결론: 반려 요청** — React 19 + React Compiler 환경에서 수동 메모이제이션은 대부분 불필요하며, 오히려 코드 복잡성과 유지보수 비용을 높입니다. 아래 근거를 바탕으로 전면 재검토를 요청합니다.

---

## 1. React Compiler가 이미 메모이제이션을 수행한다

React Compiler(구 React Forget)는 빌드 타임에 컴포넌트와 훅을 정적 분석하여 **자동으로 메모이제이션**을 삽입합니다. 컴파일러가 생성한 코드를 보면 내부적으로 `c` (cache) 슬롯을 활용해 값의 변경 여부를 추적합니다.

즉, 개발자가 `useMemo` / `useCallback` / `React.memo`를 수동으로 작성하지 않아도, **컴파일러가 안전하다고 판단하는 모든 위치에 자동으로 최적화를 적용**합니다.

공식 참고:
- React Compiler 공식 문서: https://react.dev/learn/react-compiler
- React 블로그 "React Compiler" 발표 (React Conf 2024)

> "React Compiler is a build-time only tool that automatically optimizes your React app. [...] you no longer need to manually memoize with useMemo, useCallback, and React.memo."
>
> — https://react.dev/learn/react-compiler

---

## 2. 수동 메모이제이션이 안티패턴인 이유

### 2-1. 컴파일러와의 충돌 가능성

React Compiler는 코드가 **React의 규칙(Rules of React)**을 따른다는 전제 하에 최적화를 수행합니다. 수동 `useMemo` / `useCallback`이 섞여 있으면:

- 컴파일러가 해당 코드의 의존성 추론을 방해받을 수 있음
- 컴파일러가 해당 부분의 최적화를 **스킵(bail-out)** 할 수 있음
- 결과적으로 컴파일러의 효과가 반감됨

### 2-2. 비용이 공짜가 아니다

`useMemo` / `useCallback`은 **실행 비용이 0이 아닙니다**:

- 의존성 배열의 **shallow 비교 비용** 매 렌더링마다 발생
- 클로저 생성 비용
- 캐시 슬롯 메모리 점유

React 공식 문서(https://react.dev/reference/react/useMemo)에서도 명시합니다:

> "You should only rely on useMemo as a performance optimization. If your code doesn't work without it, find the underlying problem and fix it first."

그리고:

> "In practice, you can make a lot of memoization unnecessary by following a few principles: [...] When a component visually wraps other components, let it accept JSX as children. [...] Prefer local state and don't lift state any higher than necessary."

### 2-3. React.memo의 역설

`React.memo`로 감싼 컴포넌트는 **props의 shallow 비교**를 수행합니다. 문제는:

- 부모가 매 렌더링마다 새 객체/배열/함수를 props로 내려주면 → `React.memo`는 무의미
- 이를 막으려고 `useCallback` / `useMemo`를 추가 → 코드 복잡도 폭발
- **결국 메모이제이션이 메모이제이션을 요구하는 악순환**

React 공식 문서(https://react.dev/reference/react/memo):

> "React will still re-render a component if it re-renders itself (regardless of memo)."

### 2-4. 의존성 배열 관리 실수 유발

수동 `useCallback` / `useMemo`는 `exhaustive-deps` ESLint 규칙과 싸우게 됩니다. 의존성을 잘못 선언하면:

- **stale closure 버그** 발생
- 무한 리렌더링 루프 가능성
- 디버깅 난이도 급상승

이 모든 문제를 React Compiler는 정적 분석으로 **자동 처리**합니다.

---

## 3. "안전 차원에서 다 쓰자"는 논리의 반박

| 주장 | 반박 |
|------|------|
| "메모이제이션이 많으면 더 빠르다" | 비교 비용 > 재계산 비용인 경우 오히려 느려진다 |
| "컴파일러가 있어도 더 명시적인 게 낫다" | 컴파일러 최적화를 방해하고 bail-out을 유발한다 |
| "나중에 컴파일러 없애면 대비가 된다" | 컴파일러를 없애야 할 이유가 없고, 있다면 그때 추가하면 된다 |
| "코드가 더 안전해 보인다" | 잘못된 의존성 배열로 인한 stale closure가 더 위험하다 |

---

## 4. 진짜 필요한 Escape Hatch: 수동 메모이제이션이 정당화되는 경우

React Compiler가 있어도 **다음 케이스에서는 수동 메모이제이션이 필요**할 수 있습니다.

### 4-1. 컴파일러가 bail-out하는 경우

React Compiler는 코드가 Rules of React를 위반하거나, 패턴이 너무 복잡하면 해당 함수 최적화를 **스킵**합니다. 컴파일러 출력(`react-compiler-healthcheck` 또는 babel 플러그인 로그)을 확인했을 때 bail-out이 발생한 컴포넌트는 수동 메모이제이션을 검토할 수 있습니다.

### 4-2. 참조 동일성이 외부 라이브러리의 계약(contract)인 경우

```tsx
// react-virtuoso, react-window 등 레퍼런스 동일성 요구 라이브러리
const renderRow = useCallback(({ index }) => (
  <Row data={data[index]} />
), [data]);
```

가상화 라이브러리, D3, 일부 WebSocket 구독 등은 **함수 레퍼런스 동일성을 API 계약으로 요구**합니다. 이 경우 `useCallback`은 정당합니다.

### 4-3. 실제로 비용이 큰 순수 계산

```tsx
// 수만 개 데이터 필터링 / 정렬 / 집계
const sortedData = useMemo(() => {
  return hugeArray.filter(...).sort(...);
}, [hugeArray, sortKey]);
```

**프로파일링으로 실제 병목이 확인된** 고비용 계산에는 `useMemo`가 유효합니다. 단, 추측이 아니라 `React DevTools Profiler` 또는 `Performance` 탭으로 측정 후 적용해야 합니다.

### 4-4. Context 분리가 어려운 상황에서 리렌더 폭발 방지

```tsx
// Context value가 매 렌더마다 새 객체면 모든 소비자가 리렌더
const value = useMemo(() => ({ user, logout }), [user, logout]);
```

Context의 `value` prop에 직접 객체 리터럴을 넘길 경우 소비 컴포넌트가 전부 리렌더됩니다. 이 경우 `useMemo`로 안정적인 레퍼런스를 제공하는 것은 정당합니다.

### 4-5. `useEffect` 의존성에서 함수 안정성이 필요한 경우

```tsx
// fetchData가 매 렌더마다 새 참조면 무한 루프
const fetchData = useCallback(async () => {
  const res = await api.get('/data');
  setData(res);
}, []);

useEffect(() => {
  fetchData();
}, [fetchData]);
```

`useEffect` 의존성에 포함된 함수가 매 렌더마다 새로 생성되면 effect가 무한히 실행됩니다. 이 패턴에서는 `useCallback`이 필요합니다. (단, `useEffectEvent` — React 19 실험적 API — 로 대체 가능한지 먼저 검토)

---

## 5. 권장 접근법

```
측정 → 확인 → 적용
```

1. **React Compiler 적용 확인**: `react-compiler-healthcheck` 로 프로젝트 호환성 점검
2. **프로파일링 먼저**: `React DevTools Profiler`로 실제 리렌더 병목 확인
3. **컴파일러 bail-out 컴포넌트만 수동 최적화** 검토
4. **라이브러리 계약, 고비용 계산, Context value** 등 위의 Escape Hatch에 한정

---

## 6. 구체적 변경 요청

이 PR에서 요청하는 변경사항:

- [ ] **모든 컴포넌트의 `React.memo` 제거** — 컴파일러가 자동 처리
- [ ] **계산 비용이 측정으로 증명되지 않은 `useMemo` 제거** — 컴파일러가 자동 처리
- [ ] **라이브러리 계약/Effect 의존성 목적이 없는 `useCallback` 제거** — 컴파일러가 자동 처리
- [ ] **`react-compiler-healthcheck` 실행 결과 공유** — bail-out 발생 컴포넌트 목록 확인
- [ ] 수동 메모이제이션이 남아 있다면 **주석으로 이유 명시** (어떤 Escape Hatch 케이스인지)

---

## 참고 문서

- React Compiler 공식 문서: https://react.dev/learn/react-compiler
- `useMemo` 공식 문서: https://react.dev/reference/react/useMemo
- `useCallback` 공식 문서: https://react.dev/reference/react/useCallback
- `memo` 공식 문서: https://react.dev/reference/react/memo
- Rules of React: https://react.dev/reference/rules

---

> 수고 많으셨습니다. 성능에 대한 관심은 좋은 자세입니다. 다만 React 19 + Compiler 환경에서는 "측정 없는 메모이제이션 = 코드 복잡도 증가"로 귀결됩니다. 프로파일링 결과를 기반으로 필요한 곳에만 적용하면 훨씬 깔끔하고 유지보수 가능한 코드가 됩니다.
