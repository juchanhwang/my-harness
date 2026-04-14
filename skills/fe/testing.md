# Testing Guide

> "테스트가 소프트웨어가 사용되는 방식과 닮을수록, 테스트를 더 신뢰할 수 있다." — Kent C. Dodds

***

## 서브파일 라우팅

이 파일은 FE 테스트 철학/원칙의 hub다. 구체 구현은 아래 서브파일을 참조한다.

| 상황 | Read할 서브파일 |
|---|---|
| Vitest 초기 설정, setup 파일, 전역 모킹 | `testing-vitest-setup.md` |
| 컴포넌트 렌더링/인터랙션/Custom Render | `testing-component-patterns.md` |
| API 모킹, MSW 핸들러, 에러/지연/인증 시나리오 | `testing-msw.md` |
| Next.js App Router (RSC, Route Handler, Server Actions, middleware) | `testing-nextjs.md` |

***

## 1. 핵심 철학

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

***

## 2. 테스트 우선순위 (Testing Trophy) — 어느 레이어에 비중을 둘까

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

### 레이어별 작성 우선순위

1. **유틸리티/포맷팅 함수** (Unit) — 가장 가성비 좋음
2. **공통 UI 컴포넌트** (Component) — 한 번 작성하면 든든
3. **복잡한 도메인 로직** (Custom Hook) — 상태가 복잡한 훅
4. **크리티컬 패스** (E2E) — 매출 직결 기능
5. **단순 페이지 렌더링** — E2E로 통합, 별도 테스트 생략

***

## 3. 무엇을 테스트할 것인가 — 어느 기능에 비중을 둘까

§2가 "**어느 레이어에** 힘을 쏟을지"에 답한다면, 이 섹션은 "**어느 기능/코드에** 테스트를
쓸지"에 답한다. 두 축은 상호 보완적이다.

모든 코드에 테스트를 쓰지 않는다. 테스트의 비용(작성 + 유지보수)이 이익(회귀 방지 ·
문서화 · 리팩토링 안전망)을 넘으면 쓰지 않는 게 맞다. 판단은 아래 3층 구조를
**위에서 아래로** 적용한다 — 1차가 답을 주면 거기서 멈춘다.

### 3.1 1차 기준 — Use case + Risk (Kent C. Dodds)

**Top-down 접근**. 앱이 제공하는 핵심 use case를 먼저 적고, 그 위에서 무엇을
테스트할지 결정한다.

1. 주요 사용자 시나리오를 리스트업한다 — "사용자가 로그인한다", "상품을 장바구니에 담는다",
   "결제를 완료한다" 등. 보통 20~30개 내외.
2. 각 use case에 두 축을 매긴다:
   - **영향도(risk)**: 이게 깨지면 얼마나 아픈가 (매출 중단·데이터 손실 > UI 글리치)
   - **빈도(frequency)**: 얼마나 자주 사용되는가
3. `risk × frequency` 상위부터 테스트를 작성한다. 이 방식은 자연히 통합 테스트 중심이
   된다 — 한 use case가 컴포넌트·훅·API를 동시에 관통하기 때문.

> 출처: Kent C. Dodds, "How to know what to test" — https://kentcdodds.com/blog/how-to-know-what-to-test

### 3.2 2차 보조 — 코드 유형별 카탈로그

use case 접근이 닿지 않는 코드(공용 유틸, 디자인 시스템 컴포넌트, 외부 계약 경계 등)는
아래 카탈로그로 판단한다.

#### 반드시 쓴다 (Must)

| 유형 | 이유 |
|---|---|
| **분기·경계 조건이 있는 순수 함수** — 포맷터, 파서, 계산 로직, 유효성 검증 | 입력/출력이 명확해 ROI 최고 |
| **복잡한 상태를 가진 커스텀 훅** — `useAuth`, `useDebounce`, reducer 훅 | 상태 전이를 수동으로 검증 불가 |
| **상태·분기·상호작용이 있는 공통 UI** — Modal(open/close), Form(validation), Combobox, Tabs | 한 번 작성해 수백 곳 보호. 무상태 Button 같은 단순 래퍼는 Don't 범주 |
| **크리티컬 패스** — 로그인, 결제, 가입 | 장애 시 매출·신뢰 직결 |
| **버그 수정** — 실제 발견된 버그 지점 | "같은 버그를 두 번 겪지 않는다" (regression) |
| **외부 계약 경계** — API 클라이언트, Server Action, Route Handler의 입출력 스키마 | 계약 위반이 가장 비싼 버그 |

#### 쓰지 않는다 (Don't)

| 유형 | 이유 |
|---|---|
| **순수 JSX 배치 컴포넌트** — `<h1>{title}</h1>` 수준 | 테스트 = JSX 재작성, 타입체커가 이미 커버 |
| **단순 래퍼** — `const Card = (p) => <div {...p} />` | 동일 이유 |
| **스타일링 · 애니메이션** | RTL로 CSS 검증 불가. Visual regression(Storybook + Chromatic) 영역 |
| **프레임워크 기본 동작** — `next/link`가 `<a>`로 렌더되는지 | 프레임워크를 테스트하는 셈 |
| **Third-party 라이브러리 내부 동작** | 책임 영역 밖 |
| **한 번 쓰고 버릴 코드** — 일회성 마이그레이션, 수명 짧은 실험 | 비용 > 이익 |
| **Server Component 자체 렌더링** | RTL 불가 → 로직 추출 후 Unit, 나머지는 E2E (`testing-nextjs.md` §Server Component) |
| **구현 세부사항** — state 변수명, 내부 함수 호출 여부 | §8 금지 사항. Brittle test 양산 |

> Don't 항목 중 단순 컴포넌트는 "별도 테스트를 안 쓴다"가 아니라 **"부모의 통합 테스트에
> 자연히 포함된다"**로 이해하는 게 Kent의 정신에 더 가깝다. 따로 단위 테스트를 짜지 않을
> 뿐, 검증은 된다.

### 3.3 회색지대용 체크리스트 (팀 내부 휴리스틱)

> ⚠️ **이 체크리스트는 업계 표준 프레임이 아니다.** 팀 내부 경험 기반 보조 질문이며,
> 3.1과 3.2로도 판단이 서지 않을 때만 참고한다. 맹목적 적용을 경계한다.

다음 세 질문 중 **2개 이상 YES면 작성**한다.

1. **깨지면 사용자가 눈치채는가?** — Kent의 risk assessment 변형. 관측성 낮은
   코드(배치 잡·로깅)는 "즉시 UI로"가 아니라 "언젠가 데이터로"라도 드러나면 YES다.
2. **이 로직의 변경 빈도가 높거나, 불변식(invariant)이 엄격한가?** — Michael Feathers
   *Working Effectively with Legacy Code*, Martin Fowler *Refactoring* 전통. 테스트는
   리팩토링·변경의 안전망이다.
3. **행동의 복잡도가 주석·타입으로 표현하기 어려운가?** — Dan North의 BDD 전통 —
   "tests as living documentation". 복잡한 분기·상태 전이는 자연어 주석보다 테스트가 정확하다.

이 세 질문은 저자들이 각자 글에서 말한 원칙의 **재구성**이다. 원전의 공식 체크리스트가
아니라 실무 판단용 보조 도구다.

### 3.4 커버리지 숫자에 대한 주의

`testing-vitest-setup.md`의 threshold 70%는 **강제 커트라인이 아닌 경고선**이다.
크리티컬 패스·도메인 로직은 90~100%, 포장지 컴포넌트는 0%여도 무방하다.
"전체 N%" 달성을 위해 Must가 아닌 코드까지 테스트를 채우는 건 안티패턴이며,
Kent의 격언과 정면으로 충돌한다.

> "Write tests. Not too many. Mostly integration." — Kent C. Dodds
> (https://kentcdodds.com/blog/write-tests)

***

## 4. 추천 스택

무엇을 어디에 쓸지 결정했으면, 아래 도구로 구현한다. 구체 설정은 서브파일 참조.

| 레이어 | 도구 | 대상 |
|--------|------|------|
| **Unit** | Vitest | 순수 함수, 유틸리티, 포맷터 |
| **Component/Integration** | Vitest + RTL + MSW | Client Component, 폼, UI 상호작용 |
| **E2E** | Playwright | RSC, 라우팅, 결제/인증 등 크리티컬 패스 |
| **Visual** | Storybook + Chromatic | 디자인 시스템 컴포넌트 회귀 |

***

## 5. 테스트 대역 활용 기준

| 유형 | 특징 | 용도 |
|------|------|------|
| Stub | 미리 정해진 값 반환 | 외부 의존 제어 |
| Mock | 호출 검증 | 함수 호출 확인 |
| Fake | 간단한 구현 | In-memory DB |
| Dummy | 파라미터 충족 용도 | 타입 만족 |

***

## 6. RTL 베스트 프랙티스

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

`customRender`, `AllProviders`, QueryClient 설정은 `testing-component-patterns.md` §Custom Render Wrapper 참조.

***

## 7. 테스트 구조 컨벤션

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

***

## 8. 금지 사항

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

***

> 관련: [code-quality.md](code-quality.md) · [ci-cd.md](ci-cd.md) · [testing-vitest-setup.md](testing-vitest-setup.md) · [testing-msw.md](testing-msw.md) · [testing-component-patterns.md](testing-component-patterns.md) · [testing-nextjs.md](testing-nextjs.md)
