---
name: react-nextjs-testing
description: React & Next.js 테스트 코드 작성 가이드. Kent C. Dodds의 테스트 철학(행동 기반 테스트, 구현 세부사항 테스트 금지, 접근성 기반 쿼리)과 국내 현업(토스/당근/우아한형제들) 베스트 프랙티스 기반. Vitest + React Testing Library + MSW + Playwright 스택. 테스트 코드 작성, 컴포넌트 테스트, 커스텀 훅 테스트, E2E 테스트, API 모킹, 테스트 설계, 테스트 전략 수립 시 사용. Triggers — test, testing, 테스트, spec, describe, it, expect, vitest, RTL, React Testing Library, MSW, Playwright, E2E, TDD, coverage, mock, stub, fixture.
---

# React & Next.js Testing Guide

> "테스트가 소프트웨어가 사용되는 방식과 닮을수록, 테스트를 더 신뢰할 수 있다." — Kent C. Dodds

## 핵심 철학

**사용자 행동을 테스트하라. 구현 세부사항을 테스트하지 마라.**

```tsx
// ❌ BAD: 내부 state를 테스트
expect(component.state.isModalOpen).toBe(true);

// ✅ GOOD: 사용자가 경험하는 결과를 테스트
expect(screen.getByRole('dialog', { name: '로그인' })).toBeInTheDocument();
```

### 4대 원칙

1. **구현 세부사항 테스트 금지** — state 변수명, 내부 함수 호출 여부 검증 금지. 리팩토링 시 기능이 멀쩡해도 테스트가 깨지는 Brittle Test가 된다.
2. **사용자 관점 상호작용** — 클릭, 타이핑, 화면에 나타난 텍스트 확인으로 테스트를 작성한다.
3. **접근성 기반 쿼리** — DOM의 id/class 대신 role, aria-label, 보이는 텍스트로 요소를 찾는다.
4. **모킹 최소화** — 네트워크/브라우저 API 경계만 모킹. 나머지는 실제 컴포넌트와 훅을 렌더링한다.

---

## 추천 스택

| 레이어 | 도구 | 대상 |
|--------|------|------|
| **Unit** | Vitest | 순수 함수, 유틸리티, 포맷터 |
| **Component/Integration** | Vitest + RTL + MSW | Client Component, 폼, UI 상호작용 |
| **E2E** | Playwright | RSC, 라우팅, 결제/인증 등 크리티컬 패스 |
| **Visual** | Storybook + Chromatic | 디자인 시스템 컴포넌트 회귀 |

---

## 테스트 우선순위 (Testing Trophy)

Testing Pyramid이 아닌 **Testing Trophy** 모델을 따른다. 통합 테스트가 가장 가성비가 높다.

```
        ┌─────┐
        │ E2E │  ← 크리티컬 패스만 (결제, 인증)
       ─┴─────┴─
      │Integration│  ← 가장 많이 작성 (컴포넌트 + Hook + API)
     ─┴───────────┴─
    │   Unit Tests   │  ← 순수 함수, 복잡한 로직
   ─┴────────────────┴─
  │   Static Analysis   │  ← TypeScript, ESLint
  └─────────────────────┘
```

### 테스트 작성 우선순위

1. **유틸리티/포맷팅 함수** (Unit) — 가장 가성비 좋음
2. **공통 UI 컴포넌트** (Component) — 한 번 작성하면 든든
3. **복잡한 도메인 로직** (Custom Hook) — 상태가 복잡한 훅
4. **크리티컬 패스** (E2E) — 매출 직결 기능
5. **단순 페이지 렌더링** — E2E로 통합, 별도 테스트 생략

---

## RTL 베스트 프랙티스

### 쿼리 우선순위 (반드시 지킬 것)

```
1순위: getByRole('button', { name: '제출' })        ← 가장 권장
2순위: getByLabelText('이메일')                       ← 폼 요소
3순위: getByPlaceholderText('검색어를 입력하세요')      ← 대안
4순위: getByText('환영합니다')                         ← 보이는 텍스트
5순위: getByDisplayValue('test@example.com')         ← 폼 값
최하위: getByTestId('submit-btn')                     ← 최후의 수단
```

> `getByTestId`는 다른 방법이 없을 때만 사용. role이나 label로 접근할 수 없는 요소에 한정한다.

### userEvent > fireEvent

```tsx
// ❌ BAD: 단순 DOM 이벤트만 발생
fireEvent.click(button);

// ✅ GOOD: hover → focus → pointerdown → pointerup → click 전체 시뮬레이션
const user = userEvent.setup();
await user.click(button);
```

`userEvent.setup()`을 테스트 상단에서 한 번 호출하고 재사용한다.

### 비동기 UI: findBy 사용

```tsx
// ❌ BAD: waitFor로 감싸기
await waitFor(() => {
  expect(screen.getByText('로딩 완료')).toBeInTheDocument();
});

// ✅ GOOD: findBy가 내부적으로 polling
const result = await screen.findByText('로딩 완료');
expect(result).toBeInTheDocument();
```

`waitFor`는 assertion이 아닌 **side effect 대기**에만 사용한다.

### Custom Render Wrapper

프로젝트의 Provider(QueryClient, Theme, Router 등)를 감싸는 커스텀 render를 만든다.

```tsx
// test-utils.tsx
function AllProviders({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

function renderWithProviders(ui: React.ReactElement, options?: RenderOptions) {
  return render(ui, { wrapper: AllProviders, ...options });
}

export { renderWithProviders as render, screen, within };
```

> 모든 테스트에서 `@testing-library/react` 대신 이 `test-utils`를 import한다.

---

## 테스트 구조 컨벤션

### 파일 위치: Co-location

```
src/
  components/
    LoginForm/
      LoginForm.tsx
      LoginForm.test.tsx     ← 소스 옆에 위치
  hooks/
    useAuth.ts
    useAuth.test.ts
  utils/
    formatDate.ts
    formatDate.test.ts
```

### describe/it 구조: Given-When-Then

```tsx
describe('LoginForm', () => {
  it('유효한 이메일과 비밀번호를 입력하면 로그인 버튼이 활성화된다', async () => {
    // Given: 컴포넌트 렌더링
    render(<LoginForm />);
    const user = userEvent.setup();

    // When: 사용자가 입력
    await user.type(screen.getByLabelText('이메일'), 'test@example.com');
    await user.type(screen.getByLabelText('비밀번호'), 'password123');

    // Then: 버튼 활성화 확인
    expect(screen.getByRole('button', { name: '로그인' })).toBeEnabled();
  });
});
```

### it 설명: 사용자 행동 기반 서술

```tsx
// ❌ BAD: 구현 중심 서술
it('setIsOpen을 true로 설정한다')
it('handleSubmit을 호출한다')

// ✅ GOOD: 사용자 관점 서술
it('버튼을 클릭하면 모달이 열린다')
it('폼을 제출하면 성공 메시지가 표시된다')
it('잘못된 이메일을 입력하면 에러 메시지가 나타난다')
```

---

## 현업 프랙티스 (토스/당근/우아한형제들)

> 구체적 코드 패턴은 [references/industry-patterns.md](references/industry-patterns.md) 참조.

### 토스 — `renderWithUser` 유틸리티

`render()` + `userEvent.setup()`을 한 번에 처리하는 헬퍼. overlay-kit, suspensive 등 OSS에서 실사용.

```tsx
function renderWithUser<T extends React.JSX.Element>(component: T, options?: RenderOptions) {
  const user = userEvent.setup();
  return { ...render(component, { wrapper, ...options }), user };
}

// 사용: const { user } = renderWithUser(<Component />);
```

### 토스 — async Server Component 직접 await

suspensive에서 사용하는 패턴. async RSC 함수를 직접 호출하여 결과 JSX를 `render()`에 전달한다.

### 배민 — `customRender` + 시나리오 기반 통합 테스트

Provider 조합을 `customRender`로 캡슐화하고, 멀티 API 복합 시나리오를 하나의 테스트로 검증한다. `server.use()`로 테스트별 응답을 오버라이드.

### 당근 — 호출 순서 검증

`toHaveBeenNthCalledWith(n, ...)`로 연속 인터랙션의 호출 순서와 인수를 동시에 검증한다.

### 공통 패턴 요약

| 패턴 | 출처 | 핵심 |
|------|------|------|
| `renderWithUser` 유틸리티 | 토스 overlay-kit | render + userEvent.setup 합성 |
| `Throw`/`Suspend` 테스트 헬퍼 | 토스 suspensive | ErrorBoundary/Suspense 지연 테스트 |
| async RSC 직접 await | 토스 suspensive | `await Component({props})` → `render(result)` |
| `customRender` + QueryClient | 배민 코어웹프론트 | Provider 래핑 표준화 |
| `server.use()` 오버라이드 | 배민 코어웹프론트 | 테스트별 API 응답 교체 |
| `toHaveBeenNthCalledWith` | 당근 seed-design | 호출 순서 + 인수 동시 검증 |
| 순수 로직 단위 테스트 | 당근 stackflow | UI 없이 상태 머신만 테스트 |
| 험블 객체 패턴 | 네이버 D2 | 테스트 어려운 코드를 인터페이스로 분리 |

### Test Factory + Arrange-Act-Assert

```tsx
it('삭제 버튼을 클릭하면 확인 다이얼로그가 표시된다', async () => {
  // Arrange
  render(<ItemCard item={createItem()} />);
  const user = userEvent.setup();

  // Act
  await user.click(screen.getByRole('button', { name: '삭제' }));

  // Assert
  expect(screen.getByRole('alertdialog', { name: '정말 삭제하시겠습니까?' }))
    .toBeInTheDocument();
});
```

---

## 금지 사항 (절대 하지 말 것)

| 패턴 | 이유 |
|------|------|
| `container.querySelector('.btn')` | CSS 선택자로 요소 검색 — 구현 종속 |
| `wrapper.instance()` | 컴포넌트 인스턴스 접근 — 내부 구현 |
| `expect(setState).toHaveBeenCalled()` | state setter 호출 검증 — 구현 종속 |
| `fireEvent.change(input, { target: { value: 'x' } })` | userEvent 대신 fireEvent 사용 |
| Snapshot 남용 | 큰 스냅샷은 변경 시 무심코 update — 신뢰도 0 |
| `act()` 수동 감싸기 | RTL의 render/userEvent가 이미 처리 |
| `jest.mock('../../components/Button')` | 자식 컴포넌트 모킹 — 통합 테스트의 의미 상실 |
| `cleanup()` 수동 호출 | Vitest + RTL이 자동 처리 |
| 테스트 간 상태 공유 | 각 테스트는 독립적이어야 함 |

---

## 참조 가이드

### [references/industry-patterns.md](references/industry-patterns.md)
국내 현업(토스/배민/당근) 실사용 테스트 패턴:
- `renderWithUser` 유틸리티 (토스 overlay-kit)
- `Throw`/`Suspend` ErrorBoundary 테스트 헬퍼 (토스 suspensive)
- async Server Component 직접 await 패턴
- 멀티 API 복합 시나리오 테스트 (배민)
- 호출 순서 검증 패턴 (당근 seed-design)

### [references/component-patterns.md](references/component-patterns.md)
RTL 컴포넌트 테스트 코드 패턴 모음:
- 폼 테스트, 모달 테스트, 리스트/테이블 테스트
- 커스텀 훅 테스트 (renderHook)
- 에러 바운더리 테스트
- 조건부 렌더링 테스트

### [references/nextjs-testing.md](references/nextjs-testing.md)
Next.js App Router 특화 테스트 전략:
- Server Component는 E2E로 커버
- next/navigation 모킹 패턴
- Server Actions 테스트
- Middleware 테스트
- next/image, next/link 처리

### [references/msw-patterns.md](references/msw-patterns.md)
MSW v2 설정 및 패턴:
- 서버/브라우저 핸들러 설정
- 핸들러 co-location 패턴
- 에러/지연 시나리오 시뮬레이션
- 테스트별 핸들러 오버라이드

### [references/vitest-setup.md](references/vitest-setup.md)
Vitest 설정 가이드:
- vitest.config.ts 설정
- jsdom 환경 설정
- 글로벌 테스트 유틸리티 설정
- Coverage 설정
