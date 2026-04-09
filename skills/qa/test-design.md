# Test Design

## 왜 설계 기법이 필요한가

입력의 모든 조합을 테스트하는 것은 불가능하다. 설계 기법은 **최소한의 테스트 케이스로 최대한의 결함을 발견**하기 위한 체계적 방법론이다.

## 1. 등가 분할 (Equivalence Partitioning)

입력 도메인을 **동일하게 처리되는 그룹(파티션)**으로 나누고, 각 그룹에서 대표값 하나만 테스트한다.

### 원리

같은 파티션에 속한 값들은 같은 방식으로 처리되므로, 하나를 테스트하면 전체를 대표한다.

### 예시: 나이 입력 (18-65세 허용)

```
파티션 1 (무효): age < 18     → 대표값: 15
파티션 2 (유효): 18 ≤ age ≤ 65 → 대표값: 30
파티션 3 (무효): age > 65     → 대표값: 70
파티션 4 (무효): 비숫자       → 대표값: "abc"
파티션 5 (무효): 음수         → 대표값: -1
파티션 6 (무효): 빈 값        → 대표값: ""
```

```typescript
describe('나이 유효성 검사', () => {
  // 유효 파티션
  test('18-65세는 유효하다', () => {
    expect(validateAge(30)).toBe(true);
  });

  // 무효 파티션들
  test.each([
    { age: 15, reason: '18세 미만' },
    { age: 70, reason: '65세 초과' },
    { age: -1, reason: '음수' },
  ])('$reason($age)은 무효하다', ({ age }) => {
    expect(validateAge(age)).toBe(false);
  });
});
```

## 2. 경계값 분석 (Boundary Value Analysis)

파티션의 **경계**에서 버그가 가장 많이 발생한다. `<` vs `<=`, `>` vs `>=` 실수가 대표적.

### 원리

경계값과 그 바로 옆 값을 테스트한다.

### 예시: 나이 입력 (18-65세 허용)

```
경계값: 17, 18, 19, 64, 65, 66
         ↑   ↑        ↑   ↑
       무효 유효      유효 무효
```

```typescript
describe('나이 경계값 테스트', () => {
  // 하한 경계
  test('17세는 무효', () => expect(validateAge(17)).toBe(false));
  test('18세는 유효', () => expect(validateAge(18)).toBe(true));
  test('19세는 유효', () => expect(validateAge(19)).toBe(true));

  // 상한 경계
  test('64세는 유효', () => expect(validateAge(64)).toBe(true));
  test('65세는 유효', () => expect(validateAge(65)).toBe(true));
  test('66세는 무효', () => expect(validateAge(66)).toBe(false));

  // 특수 경계
  test('0은 무효', () => expect(validateAge(0)).toBe(false));
  test('MAX_SAFE_INTEGER는 무효', () => {
    expect(validateAge(Number.MAX_SAFE_INTEGER)).toBe(false);
  });
});
```

### 실전 경계값 체크리스트

* 0, 1, -1
* 빈 문자열, 한 글자, 최대 길이, 최대 길이 + 1
* 빈 배열, 원소 1개, 최대 원소
* null, undefined
* 날짜의 월말/월초, 윤년
* 자정, 일자 변경선

## 3. 결정 테이블 (Decision Table)

여러 조건의 조합에 따라 다른 결과가 나오는 경우에 사용.

### 예시: 할인 정책

|             | 규칙1 | 규칙2 | 규칙3 | 규칙4 | 규칙5 |
| ----------- | --- | --- | --- | --- | --- |
| **조건**      |     |     |     |     |     |
| VIP 회원      | Y   | Y   | N   | N   | N   |
| 구매금액 ≥ 10만원 | Y   | N   | Y   | N   | N   |
| 쿠폰 보유       | -   | -   | -   | Y   | N   |
| **결과**      |     |     |     |     |     |
| 할인율         | 20% | 10% | 5%  | 3%  | 0%  |
| 무료배송        | Y   | Y   | N   | N   | N   |

```typescript
describe('할인 정책', () => {
  test.each([
    { vip: true, amount: 150000, coupon: false, discount: 0.2, freeShip: true },
    { vip: true, amount: 50000, coupon: false, discount: 0.1, freeShip: true },
    { vip: false, amount: 150000, coupon: false, discount: 0.05, freeShip: false },
    { vip: false, amount: 50000, coupon: true, discount: 0.03, freeShip: false },
    { vip: false, amount: 50000, coupon: false, discount: 0, freeShip: false },
  ])(
    'VIP=$vip, 금액=$amount, 쿠폰=$coupon → 할인=$discount',
    ({ vip, amount, coupon, discount, freeShip }) => {
      const result = calculateDiscount({ vip, amount, coupon });
      expect(result.discountRate).toBe(discount);
      expect(result.freeShipping).toBe(freeShip);
    }
  );
});
```

## 4. 상태 전이 테스트 (State Transition Testing)

시스템이 **상태(state)**를 가지고, 이벤트에 따라 상태가 변하는 경우에 사용.

### 예시: 주문 상태

```
[생성] →(결제)→ [결제완료] →(배송시작)→ [배송중] →(배송완료)→ [완료]
  |                |                                          |
  ↓(취소)          ↓(취소)                                    ↓(반품요청)
[취소됨]          [환불중] →(환불완료)→ [환불됨]              [반품중]
```

```typescript
describe('주문 상태 전이', () => {
  // 유효한 전이
  test('생성 → 결제완료', () => {
    const order = createOrder();
    order.pay();
    expect(order.status).toBe('PAID');
  });

  test('결제완료 → 배송중', () => {
    const order = createPaidOrder();
    order.ship();
    expect(order.status).toBe('SHIPPING');
  });

  // 무효한 전이 (이것이 핵심!)
  test('배송중 → 결제완료는 불가', () => {
    const order = createShippingOrder();
    expect(() => order.pay()).toThrow('Invalid state transition');
  });

  test('취소됨 → 배송중은 불가', () => {
    const order = createCancelledOrder();
    expect(() => order.ship()).toThrow('Invalid state transition');
  });

  test('완료된 주문은 취소 불가', () => {
    const order = createCompletedOrder();
    expect(() => order.cancel()).toThrow('Cannot cancel completed order');
  });
});
```

### 상태 전이 테이블

| 현재 상태 | 이벤트  | 다음 상태 | 유효? |
| ----- | ---- | ----- | --- |
| 생성    | 결제   | 결제완료  | ✅   |
| 생성    | 취소   | 취소됨   | ✅   |
| 생성    | 배송   | -     | ❌   |
| 결제완료  | 배송시작 | 배송중   | ✅   |
| 결제완료  | 취소   | 환불중   | ✅   |
| 배송중   | 배송완료 | 완료    | ✅   |
| 배송중   | 취소   | -     | ❌   |

**무효한 전이를 테스트하는 것이 유효한 전이만큼 중요하다.**

## 5. 페어와이즈 테스트 (Pairwise Testing)

여러 파라미터의 **모든 조합**은 기하급수적으로 늘어난다. 페어와이즈는 **모든 2개 파라미터의 조합**만 커버하면 대부분의 결함을 찾을 수 있다는 원리.

### 예시: 브라우저 호환성

```
브라우저: Chrome, Firefox, Safari
OS: Windows, macOS, Linux
해상도: 1920x1080, 1366x768, 375x667(mobile)

모든 조합: 3 × 3 × 3 = 27개
페어와이즈: 9개로 축소
```

```typescript
// 페어와이즈로 선택된 9개 조합
const testConfigs = [
  { browser: 'Chrome', os: 'Windows', resolution: '1920x1080' },
  { browser: 'Chrome', os: 'macOS', resolution: '1366x768' },
  { browser: 'Chrome', os: 'Linux', resolution: '375x667' },
  { browser: 'Firefox', os: 'Windows', resolution: '1366x768' },
  { browser: 'Firefox', os: 'macOS', resolution: '375x667' },
  { browser: 'Firefox', os: 'Linux', resolution: '1920x1080' },
  { browser: 'Safari', os: 'Windows', resolution: '375x667' },
  { browser: 'Safari', os: 'macOS', resolution: '1920x1080' },
  { browser: 'Safari', os: 'Linux', resolution: '1366x768' },
];
```

## 6. 원인-결과 그래프 (Cause-Effect Graphing)

복잡한 비즈니스 규칙에서 입력(원인)과 출력(결과)의 관계를 그래프로 모델링.

### 적용 상황

* 조건이 3개 이상일 때
* 조건 간 의존성이 있을 때 (AND/OR/NOT)
* 결정 테이블이 너무 커질 때

## 기법 선택 가이드

| 상황          | 적합한 기법      |
| ----------- | ----------- |
| 입력 범위가 명확   | 등가 분할 + 경계값 |
| 여러 조건의 조합   | 결정 테이블      |
| 상태가 변하는 시스템 | 상태 전이       |
| 파라미터가 많은 설정 | 페어와이즈       |
| 복잡한 비즈니스 규칙 | 원인-결과 그래프   |
| 명확한 스펙이 없음  | 탐색적 테스트     |

## 실전 팁

### 기법을 조합하라

하나의 기법만으로 충분하지 않다. 실전에서는:

1. 등가 분할로 파티션을 나눈다
2. 경계값 분석으로 각 파티션의 경계를 테스트한다
3. 결정 테이블로 조건 조합을 커버한다
4. 상태 전이로 플로우를 검증한다

### 음성 테스트 (Negative Testing)를 잊지 마라

* 유효하지 않은 입력
* 허용되지 않은 상태 전이
* 권한이 없는 접근
* 시스템 제한 초과

**양성 테스트는 시스템이 할 수 있는 것을, 음성 테스트는 시스템이 하면 안 되는 것을 검증한다. 둘 다 필수.**