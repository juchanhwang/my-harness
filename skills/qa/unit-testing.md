# Unit Testing

> 참조: Robert C. Martin, *Clean Code* (Prentice Hall, 2008) Ch. 9 "Unit Tests" — FIRST 원전 · [Bill Wake — 3A: Arrange-Act-Assert](https://xp123.com/articles/3a-arrange-act-assert/) · [Martin Fowler — Mocks Aren't Stubs](https://martinfowler.com/articles/mocksArentStubs.html) · [Vitest 공식 문서](https://vitest.dev/) · [Google Testing Blog](https://testing.googleblog.com/) · Gerard Meszaros, *xUnit Test Patterns* (Addison-Wesley, 2007) — Test Factory / Builder 패턴 원전

## 목차

1. [FIRST 원칙](#first-원칙) — Fast, Isolated, Repeatable, Self-validating, Timely
2. [AAA 패턴 (Arrange-Act-Assert)](#aaa-패턴-arrange-act-assert)
3. [Vitest / Jest 실전 패턴](#vitest--jest-실전-패턴) — describe/it, hooks, assertions
4. [모킹 전략 (Mocking Strategy)](#모킹-전략-mocking-strategy) — 언제·무엇을 모킹할지
5. [좋은 테스트 vs 나쁜 테스트](#좋은-테스트-vs-나쁜-테스트) — brittle test 회피
6. [테스트 팩토리 & 빌더 패턴](#테스트-팩토리--빌더-패턴) — 테스트 데이터 생성
7. [커버리지 목표](#커버리지-목표) — 의미 있는 커버리지
8. [단위 테스트 체크리스트](#단위-테스트-체크리스트)

***

## FIRST 원칙

좋은 단위 테스트는 FIRST를 따른다:

* **F**ast — 밀리초 단위. 수천 개가 몇 초 안에 끝나야 한다
* **I**ndependent — 다른 테스트에 의존하지 않는다. 순서 무관
* **R**epeatable — 어떤 환경에서든 같은 결과
* **S**elf-validating — pass/fail이 자동 판정. 사람이 로그를 읽을 필요 없음
* **T**imely — 코드 작성과 동시에 (또는 직전에) 작성

## AAA 패턴 (Arrange-Act-Assert)

모든 단위 테스트의 기본 구조:

```typescript
test('할인가를 올바르게 계산한다', () => {
  // Arrange — 테스트 준비
  const product = { price: 10000, discountRate: 0.2 };

  // Act — 실행
  const result = calculateDiscountedPrice(product);

  // Assert — 검증
  expect(result).toBe(8000);
});
```

### AAA 규칙

* **Arrange**: 가능한 짧게. 복잡하면 헬퍼/팩토리로 추출
* **Act**: 한 줄이 이상적. 테스트 대상 함수 호출 하나
* **Assert**: 하나의 논리적 개념만 검증. 여러 expect가 같은 개념이면 OK

## Vitest / Jest 실전 패턴

### 기본 설정 (Vitest)

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node', // 또는 'jsdom' (React)
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
});
```

### describe/test 구조

```typescript
describe('CartService', () => {
  describe('addItem', () => {
    test('새 상품을 추가한다', () => { /* ... */ });
    test('이미 있는 상품의 수량을 증가시킨다', () => { /* ... */ });
    test('재고가 없으면 에러를 던진다', () => { /* ... */ });
  });

  describe('calculateTotal', () => {
    test('모든 상품의 합계를 계산한다', () => { /* ... */ });
    test('빈 카트는 0을 반환한다', () => { /* ... */ });
    test('할인을 적용한다', () => { /* ... */ });
  });
});
```

### 파라미터화 테스트 (test.each)

```typescript
test.each([
  { input: 0, expected: 'zero' },
  { input: 1, expected: 'one' },
  { input: -1, expected: 'negative' },
  { input: 100, expected: 'positive' },
  { input: NaN, expected: 'invalid' },
])('classifyNumber($input) → $expected', ({ input, expected }) => {
  expect(classifyNumber(input)).toBe(expected);
});
```

### 에러 테스트

```typescript
test('0으로 나누면 에러를 던진다', () => {
  expect(() => divide(10, 0)).toThrow('Division by zero');
});

test('비동기 에러를 올바르게 처리한다', async () => {
  await expect(fetchUser('nonexistent')).rejects.toThrow('User not found');
});
```

## 모킹 전략 (Mocking Strategy)

### 언제 모킹하는가

* ✅ 외부 API 호출
* ✅ 데이터베이스 접근
* ✅ 파일 시스템 접근
* ✅ 현재 시간 (Date.now)
* ✅ 랜덤 값 (Math.random)
* ❌ 테스트 대상 함수의 내부 로직
* ❌ 순수 유틸리티 함수

### Vitest 모킹

```typescript
import { vi, describe, test, expect, beforeEach } from 'vitest';

// 모듈 모킹
vi.mock('./emailService', () => ({
  sendEmail: vi.fn().mockResolvedValue({ sent: true }),
}));

// 개별 함수 모킹
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('UserService', () => {
  beforeEach(() => {
    vi.clearAllMocks(); // 각 테스트 전에 모크 초기화
  });

  test('사용자 생성 시 환영 이메일을 보낸다', async () => {
    const { sendEmail } = await import('./emailService');

    await createUser({ name: 'Alice', email: 'alice@test.com' });

    expect(sendEmail).toHaveBeenCalledWith({
      to: 'alice@test.com',
      template: 'welcome',
    });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});
```

### 시간 모킹

```typescript
test('토큰이 만료되었는지 확인한다', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2024-01-01T12:00:00Z'));

  const token = createToken({ expiresIn: '1h' });

  // 30분 후 → 유효
  vi.advanceTimersByTime(30 * 60 * 1000);
  expect(isTokenValid(token)).toBe(true);

  // 61분 후 → 만료
  vi.advanceTimersByTime(31 * 60 * 1000);
  expect(isTokenValid(token)).toBe(false);

  vi.useRealTimers();
});
```

### 스파이 (Spy)

```typescript
test('로거가 올바른 메시지를 기록한다', () => {
  const logSpy = vi.spyOn(console, 'error');

  processInvalidInput(null);

  expect(logSpy).toHaveBeenCalledWith(
    expect.stringContaining('Invalid input')
  );
  logSpy.mockRestore();
});
```

## 좋은 테스트 vs 나쁜 테스트

### ❌ 나쁜 테스트: 구현 세부사항을 테스트

```typescript
// 나쁨 — 내부 구현에 결합
test('addItem이 내부 배열에 push한다', () => {
  const cart = new Cart();
  cart.addItem({ id: 1, name: 'Book', price: 1000 });
  expect(cart._items).toHaveLength(1); // private 접근!
  expect(cart._items[0].id).toBe(1);
});
```

### ✅ 좋은 테스트: 행동(behavior)을 테스트

```typescript
// 좋음 — 외부 행동에 집중
test('상품을 추가하면 카트에 포함된다', () => {
  const cart = new Cart();
  const book = { id: 1, name: 'Book', price: 1000 };

  cart.addItem(book);

  expect(cart.getItems()).toContainEqual(book);
  expect(cart.getItemCount()).toBe(1);
  expect(cart.getTotal()).toBe(1000);
});
```

### ❌ 나쁜 테스트: 테스트 이름이 모호

```typescript
test('it works', () => { /* ... */ });
test('test1', () => { /* ... */ });
test('calculatePrice', () => { /* ... */ });
```

### ✅ 좋은 테스트: 테스트 이름이 행동을 설명

```typescript
test('VIP 회원에게 20% 할인을 적용한다', () => { /* ... */ });
test('재고가 0인 상품은 카트에 추가할 수 없다', () => { /* ... */ });
test('유효하지 않은 이메일로 가입하면 에러를 반환한다', () => { /* ... */ });
```

### ❌ 나쁜 테스트: 과도한 모킹

```typescript
// 모든 것을 모킹하면 뭘 테스트하는 건지 모름
test('processOrder', () => {
  vi.mock('./inventory');
  vi.mock('./payment');
  vi.mock('./shipping');
  vi.mock('./notification');
  vi.mock('./logger');
  // ... 모킹 설정 30줄 ...
  // 실제 테스트 2줄
});
```

### ✅ 좋은 테스트: 최소한의 모킹

```typescript
// 외부 의존성만 모킹, 핵심 로직은 실제 실행
test('주문 처리 시 결제와 재고를 검증한다', () => {
  const mockPayment = vi.fn().mockResolvedValue({ success: true });

  const result = await processOrder(
    { items: [{ id: 1, qty: 2 }] },
    { processPayment: mockPayment }
  );

  expect(result.status).toBe('completed');
  expect(mockPayment).toHaveBeenCalledOnce();
});
```

## 테스트 팩토리 & 빌더 패턴

테스트 데이터 생성을 깔끔하게:

```typescript
// test/factories/user.ts
function createUser(overrides: Partial<User> = {}): User {
  return {
    id: crypto.randomUUID(),
    name: 'Test User',
    email: 'test@example.com',
    role: 'member',
    createdAt: new Date(),
    ...overrides,
  };
}

// 사용
test('어드민은 사용자를 삭제할 수 있다', () => {
  const admin = createUser({ role: 'admin' });
  const target = createUser({ id: 'target-id' });
  expect(canDelete(admin, target)).toBe(true);
});

test('일반 사용자는 다른 사용자를 삭제할 수 없다', () => {
  const member = createUser({ role: 'member' });
  const target = createUser({ id: 'target-id' });
  expect(canDelete(member, target)).toBe(false);
});
```

## 커버리지 목표

* **새 코드**: 90%+ (핵심 비즈니스 로직)
* **전체**: 80%+ (현실적 기준)
* **Branch Coverage에 집중**: if/else, try/catch, early return
* **100%는 추구하지 않는다**: 의미 없는 테스트를 양산할 뿐

## 단위 테스트 체크리스트

* [ ] 하나의 테스트는 하나의 행동만 검증하는가
* [ ] 테스트 이름이 행동을 설명하는가
* [ ] 외부 의존성만 모킹했는가
* [ ] 엣지 케이스가 커버되는가
* [ ] 에러 케이스가 테스트되는가
* [ ] 테스트가 독립적이고 순서 무관하게 실행되는가
* [ ] AAA 구조가 명확한가