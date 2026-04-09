# React Effects -- useEffect 최소화 가이드

> 참조: [Effect가 필요하지 않은 경우](https://ko.react.dev/learn/you-might-not-need-an-effect)
> 핵심: **"Effect는 외부 시스템과의 동기화를 위한 탈출구다. React 상태 간의 동기화에는 Effect가 필요 없다."**

불필요한 Effect를 제거하면 코드가 읽기 쉽고, 실행이 빠르며, 버그가 줄어든다.

## 목차

1. [1. 핵심 판단 기준](#1-핵심-판단-기준----왜-이-코드가-실행되는가) — 이벤트 핸들러 vs Effect 판단 흐름
2. [2. Effect가 불필요한 케이스](#2-effect가-불필요한-케이스) — 파생 값, key 패턴, POST, 체인, 앱 초기화, 외부 스토어
3. [3. Effect가 필요한 케이스](#3-effect가-필요한-케이스) — DOM 조작, 외부 서비스 연결, 타이머
4. [4. 데이터 패칭](#4-데이터-패칭) — TanStack Query 사용
5. [5. Quick Reference — 안티패턴 → 대안](#5-quick-reference--안티패턴--대안)

***

## 1. 핵심 판단 기준 -- "왜 이 코드가 실행되는가?"

```
이 코드가 실행되는 이유는?
├── 사용자가 무언가를 했다 (클릭, 입력, 제출 등)
│   └── 이벤트 핸들러에 둔다
├── 컴포넌트가 화면에 표시되었다
│   └── Effect에 둘 수 있다 (analytics 등)
├── props/state가 변경되어 새 값을 계산해야 한다
│   └── 렌더링 중에 계산한다 (변수 / useMemo)
└── 외부 시스템과 동기화해야 한다 (DOM, 서버, 브라우저 API)
    └── Effect를 사용한다
```

**두 가지 핵심 질문:**
1. 렌더링 중에 계산할 수 있는가? → Effect 불필요
2. 특정 사용자 상호작용이 원인인가? → 이벤트 핸들러에

***

## 2. Effect가 불필요한 케이스

### 2.1 props/state에서 파생되는 값

기존 state에서 계산 가능한 값은 state로 만들지 않는다.

```tsx
// ❌ 불필요한 state + Effect
const [firstName, setFirstName] = useState('Taylor');
const [lastName, setLastName] = useState('Swift');
const [fullName, setFullName] = useState('');

useEffect(() => {
  setFullName(firstName + ' ' + lastName);
}, [firstName, lastName]);

// ✅ 렌더링 중 계산
const [firstName, setFirstName] = useState('Taylor');
const [lastName, setLastName] = useState('Swift');
const fullName = firstName + ' ' + lastName;
```

비용이 큰 계산은 `useMemo`로 캐싱한다. (`console.time`으로 1ms 이상이면 고려)

```tsx
// ✅ 비싼 계산은 useMemo
const visibleTodos = useMemo(
  () => getFilteredTodos(todos, filter),
  [todos, filter],
);
```

### 2.2 prop 변경 시 전체 상태 리셋 -- key 패턴

```tsx
// ❌ Effect로 상태 리셋
function ProfilePage({ userId }) {
  const [comment, setComment] = useState('');

  useEffect(() => {
    setComment('');
  }, [userId]);
  // ...
}

// ✅ key로 컴포넌트를 재생성
function ProfilePage({ userId }) {
  return <Profile userId={userId} key={userId} />;
}

function Profile({ userId }) {
  const [comment, setComment] = useState(''); // key 변경 시 자동 초기화
  // ...
}
```

> React는 같은 위치의 같은 컴포넌트 state를 보존한다. `key`가 달라지면 별개의 컴포넌트로 취급하여 DOM과 state를 모두 재생성한다.

### 2.3 prop 변경 시 일부 상태 조정

가능하면 렌더링 중에 모든 것을 계산한다.

```tsx
// ❌ Effect로 selection 초기화
function List({ items }) {
  const [selection, setSelection] = useState(null);

  useEffect(() => {
    setSelection(null);
  }, [items]);
  // ...
}

// ✅ 렌더링 중 계산 -- ID를 저장하고 매칭
function List({ items }) {
  const [selectedId, setSelectedId] = useState(null);
  const selection = items.find(item => item.id === selectedId) ?? null;
  // items가 바뀌어도 selectedId가 목록에 없으면 자연스럽게 null
}
```

### 2.4 이벤트 핸들러 간 로직 공유

```tsx
// ❌ Effect에서 이벤트별 로직 처리
useEffect(() => {
  if (product.isInCart) {
    showNotification(`${product.name} added!`);
  }
}, [product]);

// ✅ 공유 함수로 추출
function buyProduct() {
  addToCart(product);
  showNotification(`${product.name} added!`);
}

function handleBuyClick() {
  buyProduct();
}

function handleCheckoutClick() {
  buyProduct();
  navigateTo('/checkout');
}
```

### 2.5 POST 요청 / 데이터 변경

특정 상호작용의 결과인 요청은 이벤트 핸들러에 둔다.

```tsx
// ❌ state를 만들어서 Effect로 전송
const [jsonToSubmit, setJsonToSubmit] = useState(null);
useEffect(() => {
  if (jsonToSubmit !== null) {
    post('/api/register', jsonToSubmit);
  }
}, [jsonToSubmit]);

function handleSubmit(e) {
  e.preventDefault();
  setJsonToSubmit({ firstName, lastName });
}

// ✅ 이벤트 핸들러에서 직접 전송
function handleSubmit(e) {
  e.preventDefault();
  post('/api/register', { firstName, lastName });
}
```

> **Analytics는 예외**: 컴포넌트가 **표시되는 것** 자체가 원인인 로직(페이지뷰 등)은 Effect가 적절하다.

### 2.6 계산 체인 (Effect Chain)

Effect A → setState → Effect B → setState → ... 는 불필요한 리렌더링과 복잡성의 근원이다.

```tsx
// ❌ Effect 체인 -- 매 setState마다 리렌더링
useEffect(() => {
  if (card !== null && card.gold) {
    setGoldCardCount(c => c + 1);
  }
}, [card]);

useEffect(() => {
  if (goldCardCount > 3) {
    setRound(r => r + 1);
    setGoldCardCount(0);
  }
}, [goldCardCount]);

useEffect(() => {
  if (round > 5) {
    setIsGameOver(true);
  }
}, [round]);

// ✅ 렌더링 중 계산 + 이벤트 핸들러에서 상태 일괄 업데이트
const isGameOver = round > 5; // 파생 값은 렌더링 중 계산

function handlePlaceCard(nextCard) {
  if (isGameOver) throw Error('Game already ended.');

  setCard(nextCard);
  if (nextCard.gold) {
    if (goldCardCount < 3) {
      setGoldCardCount(goldCardCount + 1);
    } else {
      setGoldCardCount(0);
      setRound(round + 1);
      if (round === 5) {
        alert('Good game!');
      }
    }
  }
}
```

### 2.7 앱 초기화

```tsx
// ❌ Effect -- 개발 모드에서 두 번 실행됨
function App() {
  useEffect(() => {
    loadDataFromLocalStorage();
    checkAuthToken();
  }, []);
}

// ✅ 모듈 스코프에서 한 번만 실행
if (typeof window !== 'undefined') {
  checkAuthToken();
  loadDataFromLocalStorage();
}

function App() {
  // ...
}
```

### 2.8 부모에게 알림 / 데이터 전달

```tsx
// ❌ Effect로 부모에게 알림
function Toggle({ onChange }) {
  const [isOn, setIsOn] = useState(false);

  useEffect(() => {
    onChange(isOn);
  }, [isOn, onChange]);

  function handleClick() {
    setIsOn(!isOn);
  }
}

// ✅ 이벤트 핸들러에서 함께 처리
function Toggle({ onChange }) {
  const [isOn, setIsOn] = useState(false);

  function updateToggle(nextIsOn: boolean) {
    setIsOn(nextIsOn);
    onChange(nextIsOn); // 같은 이벤트에서 일괄 처리
  }

  function handleClick() {
    updateToggle(!isOn);
  }
}

// ✅✅ 더 좋음 -- 완전 제어 컴포넌트 (state 끌어올리기)
function Toggle({ isOn, onChange }: { isOn: boolean; onChange: (v: boolean) => void }) {
  function handleClick() {
    onChange(!isOn);
  }
}
```

> 자식이 데이터를 패칭하고 Effect로 부모에게 전달하는 패턴도 동일하게 안티패턴. 부모에서 패칭하고 자식에게 props로 내린다.

### 2.9 외부 스토어 구독 -- useSyncExternalStore

```tsx
// ❌ Effect로 수동 구독
function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(true);
  useEffect(() => {
    function update() { setIsOnline(navigator.onLine); }
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return isOnline;
}

// ✅ useSyncExternalStore
function subscribe(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function useOnlineStatus() {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true, // SSR fallback
  );
}
```

***

## 3. Effect가 필요한 케이스

Effect는 **React 외부 시스템과 동기화**할 때 사용한다.

| 케이스 | 예시 | 이유 |
|--------|------|------|
| DOM 직접 조작 | `ref.current.focus()`, scroll, measure | React가 관리하지 않는 DOM API |
| 외부 서비스 연결 | WebSocket, EventSource | 컴포넌트 생명주기와 동기화 필요 |
| 브라우저 이벤트 리스너 | resize, intersection observer | 컴포넌트 마운트/언마운트와 동기화 |
| 타이머 | setTimeout, setInterval | 정리(cleanup)가 필요 |
| 애니메이션 트리거 | CSS transition 시작 | DOM이 준비된 후 실행 |
| 컴포넌트 표시 추적 | analytics page view | "표시됨" 자체가 원인 |

***

## 4. 데이터 패칭

Effect에서 직접 fetch하지 않는다. 프레임워크/라이브러리를 사용한다.

```tsx
// ❌ useEffect + fetch -- 경쟁 조건, 캐싱 없음, 워터폴
useEffect(() => {
  fetchResults(query).then(json => setResults(json));
}, [query]);

// ✅ TanStack Query (프로젝트 표준)
const { data: results } = useSuspenseQuery({
  queryKey: ['search', query],
  queryFn: () => fetchResults(query),
});
```

> 상세한 데이터 패칭 패턴은 [async-patterns.md](async-patterns.md) 참조.

***

## 5. Quick Reference -- 안티패턴 → 대안

| 안티패턴 | 대안 |
|----------|------|
| `useEffect` + `setState`로 파생 값 계산 | 렌더링 중 변수 / `useMemo` |
| `useEffect`로 prop 변경 시 전체 state 리셋 | `key` prop |
| `useEffect`로 prop 변경 시 일부 state 조정 | 렌더링 중 계산 또는 조건부 `setState` |
| `useEffect`로 이벤트 핸들러 간 로직 공유 | 공유 함수 추출 |
| `useEffect` + 트리거용 state로 POST 요청 | 이벤트 핸들러에서 직접 호출 |
| `useEffect` 체인 (A→B→C) | 이벤트 핸들러에서 일괄 계산 + 파생 값 |
| `useEffect`로 앱 초기화 | 모듈 스코프 실행 |
| `useEffect`로 부모에게 알림 | 이벤트 핸들러에서 콜백 호출 / state 끌어올리기 |
| `useEffect`로 외부 스토어 구독 | `useSyncExternalStore` |
| `useEffect` + `fetch` | TanStack Query / 프레임워크 내장 메커니즘 |

***

> 📎 관련: [component-patterns.md](component-patterns.md) · [state-management.md](state-management.md) · [async-patterns.md](async-patterns.md) · [state-colocation.md](state-colocation.md)
