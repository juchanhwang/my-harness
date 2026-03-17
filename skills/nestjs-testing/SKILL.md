---
name: nestjs-testing
description: NestJS 백엔드 테스트 코드 작성 가이드. Ian Cooper, Martin Fowler, Kent Beck, Gary Bernhardt의 테스트 철학 기반. 행동(Behavior) 테스트, 계약(Contract) 테스트, Functional Core / Imperative Shell 패턴, 경계 기반 모킹 전략. Jest + @nestjs/testing + supertest + @golevelup/ts-jest 스택. 테스트 코드 작성, Service/Controller/Guard/Pipe/Interceptor/E2E 테스트, 모킹 전략, 테스트 설계, 테스트 전략 수립 시 사용. Triggers — nestjs test, nestjs testing, 테스트 코드, jest, unit test, integration test, e2e, TDD, coverage, supertest, @nestjs/testing, createTestingModule, guard test, pipe test, interceptor test, contract test, mock, stub, fake.
---

# NestJS Backend Testing Guide

> "리팩토링할 때 테스트가 깨진다면, 그 테스트는 구현을 테스트하고 있는 것이다." — Ian Cooper

## 목표

이 스킬은 NestJS 테스트를 행동/계약 중심으로 설계하도록 가이드해, 리팩토링 내성과 운영 신뢰도를 동시에 높이는 것을 목표로 한다.

- 구현 세부사항 결합 테스트를 줄인다.
- 경계 기반 모킹과 Fake 우선 전략을 일관되게 적용한다.
- 레이어별(Functional Core, Collaboration, Contract, E2E) 테스트를 올바르게 배치한다.

## 활성화 조건

다음 중 하나에 해당하면 이 스킬을 우선 적용한다.

1. NestJS Service/Controller/Guard/Pipe/Interceptor 테스트를 작성하거나 리뷰할 때
2. `@nestjs/testing`, `createTestingModule`, `supertest` 기반 테스트를 설계할 때
3. E2E/Contract 테스트의 격리 전략(DB 정리, 트랜잭션 롤백, Testcontainers)을 정할 때

프레임워크 비의존 순수 함수 유틸 테스트만 다루는 경우에는 일반 테스트 가이드를 우선 적용한다.

## 핵심 철학

**계약(Contract)을 테스트하라. 구현(Implementation)을 테스트하지 마라.**

```typescript
// ❌ BAD: 내부 구현을 검증 — 리팩토링 시 깨진다
expect(mockRepo.findUnique).toHaveBeenCalledWith({ where: { id: 1 } });

// ✅ GOOD: 외부에서 관찰 가능한 결과를 검증
const user = await service.findById(1);
expect(user.email).toBe('test@example.com');
```

### 5대 원칙

1. **행동을 테스트하라** — "Unit"은 클래스가 아니라 **하나의 Use Case**다. `UserService.register()`가 유닛이지, `UserRepository.save()`가 유닛이 아니다.
2. **리팩토링 내성 최우선** — 내부 구현(for→filter, Prisma→TypeORM, 클래스 분리)을 바꿔도 테스트는 통과해야 한다. 깨진다면 테스트 설계가 잘못된 것이다.
3. **경계에서만 격리하라** — Mock은 외부 시스템(DB, 이메일, 결제 API)과의 경계에서만 사용한다. 내부 클래스 간 Mock은 구현 결합을 만든다.
4. **Fake > Mock** — `jest.fn()` 대신 Interface를 구현하는 InMemory Fake를 선호하라. Fake는 실제 동작하므로 허위 신뢰를 줄인다.
5. **결정은 Core에, I/O는 Shell에** — 복잡한 비즈니스 로직은 순수 함수(Functional Core)로 추출하여 Mock 없이 완전한 커버리지를 달성하라.

---

## 추천 스택

| 레이어 | 도구 | 대상 |
|--------|------|------|
| **Static** | TypeScript strict + class-validator | 타입 오류, DTO 검증 |
| **Functional Core** | Jest | 순수 함수, 도메인 로직, Calculator, Validator |
| **Collaboration** | Jest + @nestjs/testing + Fake | Service Use Case, 행동 검증 |
| **Contract** | Jest + 실제 DB (Testcontainers) | Repository Adapter의 계약 이행 검증 |
| **E2E** | Jest + supertest | 크리티컬 API 엔드포인트 (인증, 결제) |

---

## 테스트 전략 (경계 기반 Trophy)

Testing Pyramid도, 순수 Trophy도 아닌 **경계 기반 테스트 전략**을 따른다. Cooper의 행동 테스트 + Bernhardt의 Core/Shell 분리 + Rainsberger의 Contract/Collaboration 분리를 결합한다.

```
         ┌──────────────────────────────────────┐
         │         STATIC ANALYSIS              │  TypeScript strict + class-validator
         └──────────────────────────────────────┘
                          ↑
         ┌──────────────────────────────────────┐
         │   FUNCTIONAL CORE TESTS (~30%)       │  순수 함수, Mock 없음, exhaustive
         └──────────────────────────────────────┘
                          ↑
         ┌──────────────────────────────────────┐
         │   COLLABORATION TESTS (~40%)         │  Use Case, Fake Repo, 외부만 Mock
         └──────────────────────────────────────┘
                          ↑
         ┌──────────────────────────────────────┐
         │     CONTRACT TESTS (~20%)            │  실제 DB, Adapter 계약 검증
         └──────────────────────────────────────┘
                          ↑
         ┌──────────────────────────────────────┐
         │      E2E / SMOKE TESTS (~10%)        │  전체 앱, 크리티컬 패스만
         └──────────────────────────────────────┘
```

### 테스트 작성 우선순위

1. **Functional Core** — 순수 비즈니스 로직 (Calculator, Validator, Domain Entity). Mock 없이 모든 분기를 빠르게 커버.
2. **Service Collaboration** — Use Case의 행동 검증. Fake Repository로 DB 격리, 외부 서비스만 Stub.
3. **Guard / Pipe / Interceptor** — 공통 인프라. 한 번 작성하면 전체 앱을 보호.
4. **Contract (Repository)** — Adapter가 Port 계약을 이행하는지 실제 DB로 검증.
5. **E2E** — 인증, 결제 등 크리티컬 패스만. 경로 연결 확인 수준.

---

## Functional Core / Imperative Shell

복잡한 비즈니스 로직은 **순수 함수로 추출**하여 Service 밖에 분리한다.

```typescript
// FUNCTIONAL CORE — 순수, 의존성 없음, Mock 필요 없음
export class OrderPricingCalculator {
  static calculate(
    items: OrderItem[],
    discount: Discount | null,
    tier: UserTier,
  ): PricingResult {
    const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const discountAmount = discount ? this.applyDiscount(subtotal, discount) : 0;
    return { subtotal, discount: discountAmount, total: subtotal - discountAmount };
  }
}

// IMPERATIVE SHELL — 조율만, 결정 없음
@Injectable()
export class OrderService {
  async placeOrder(dto: PlaceOrderDto): Promise<Order> {
    const user = await this.userRepo.findById(dto.userId);           // I/O
    const discount = await this.discountRepo.findByCode(dto.code);   // I/O
    const pricing = OrderPricingCalculator.calculate(dto.items, discount, user.tier); // Core
    return this.orderRepo.save(Order.create(dto, pricing));          // I/O
  }
}
```

Core 테스트는 **모든 조합을 빠르게** 검증할 수 있다:

```typescript
describe('OrderPricingCalculator', () => {
  it.each([
    [UserTier.BRONZE, 200],
    [UserTier.SILVER, 190],
    [UserTier.GOLD,   180],
  ])('tier %s → total %d', (tier, expected) => {
    const result = OrderPricingCalculator.calculate(
      [{ price: 100, quantity: 2 }], null, tier,
    );
    expect(result.total).toBe(expected);
  });
});
```

---

## 모킹 전략 — Test Double 계층

Martin Fowler의 Test Double 분류를 기준으로, **왼쪽일수록 선호**한다:

```
Fake (InMemory 구현) > Stub (고정 반환값) > Spy (호출 기록) > Mock (호출 명세)
  ✅ 가장 안전             ✅ 외부 경계        ⚠️ 최소한으로     ⚠️ 외부 경계에서만
```

### 언제 무엇을 쓰는가

| 대상 | Test Double | 이유 |
|------|-------------|------|
| Repository (내부) | **Fake** (InMemory 구현) | 실제 동작, 리팩토링에 강함 |
| 외부 HTTP API | **Stub** (고정 반환값) | 네트워크 격리 |
| 이메일/SMS 서비스 | **Spy** (호출 기록) | 전송 여부만 확인 |
| 시스템 시간 | **Stub** (고정값) | 결정론적 테스트 |
| 같은 도메인의 다른 Service | **실제 객체** | 내부 클래스 간 Mock 금지 |
| Domain Entity / Value Object | **실제 객체** | 순수 로직, Mock 불필요 |

### Fake Repository 패턴

> 상세 구현은 [references/service-patterns.md](references/service-patterns.md) 참조.

```typescript
export class InMemoryUserRepository implements UserRepository {
  private store = new Map<string, User>();

  async findById(id: string): Promise<User | null> {
    return this.store.get(id) ?? null;
  }
  async save(user: User): Promise<User> {
    this.store.set(user.id, user);
    return user;
  }
  clear(): void { this.store.clear(); }
}
```

---

## 테스트 구조 컨벤션

### 파일 위치: Co-location

```
src/
  user/
    user.service.ts
    user.service.spec.ts          ← Use Case (Collaboration) 테스트
  common/
    guards/
      roles.guard.ts
      roles.guard.spec.ts         ← 인프라 단위 테스트
    calculators/
      pricing.calculator.ts
      pricing.calculator.spec.ts  ← Functional Core 테스트
test/
  user.e2e-spec.ts                ← E2E 테스트
  factories/                      ← Test Factory
```

### describe/it 구조: Given-When-Then

```typescript
describe('사용자 등록', () => {
  it('유효한 이메일로 등록하면 사용자가 생성된다', async () => {
    // Given
    const fakeRepo = new InMemoryUserRepository();
    const service = createUserService({ userRepo: fakeRepo });

    // When
    const user = await service.register({ email: 'test@test.com', password: 'Pass123!' });

    // Then
    expect(user.email).toBe('test@test.com');
    expect(await fakeRepo.findById(user.id)).toBeDefined();
  });

  it('이미 등록된 이메일이면 ConflictException을 던진다', async () => {
    // Given
    const fakeRepo = InMemoryUserRepository.withUsers([createUser({ email: 'taken@test.com' })]);
    const service = createUserService({ userRepo: fakeRepo });

    // When & Then
    await expect(service.register({ email: 'taken@test.com', password: 'Pass123!' }))
      .rejects.toThrow(ConflictException);
  });
});
```

### it 설명: 행동 기반 서술

```typescript
// ❌ BAD: 구현 중심
it('UserRepository.save를 호출한다')
it('bcrypt.hash를 12라운드로 호출한다')

// ✅ GOOD: 행동 기반
it('유효한 이메일로 등록하면 사용자가 생성된다')
it('비밀번호가 8자 미만이면 등록이 실패한다')
it('등록 성공 시 환영 이메일이 전송된다')
```

---

## 금지 사항 (절대 하지 말 것)

| 패턴 | 이유 |
|------|------|
| 내부 클래스 간 Mock | 구현에 결합 → 리팩토링 시 깨짐 |
| `as any`로 ExecutionContext 생성 | 타입 안전성 상실. `createMock<T>()` 사용 |
| `afterAll`에서 `app.close()` 누락 | 포트 점유, 연결 누수 |
| `jest.mock()` 모듈 레벨 남용 | NestJS DI가 있는데 우회. `provide/useValue` 사용 |
| Mock 호출 순서 검증 | 구현 세부사항. 결과(상태)를 검증할 것 |
| Snapshot으로 응답 검증 | 변경 시 무심코 update. 구조적 assertion 사용 |
| Service/Collaboration 테스트에서 `beforeAll` 모듈 생성 | 테스트 간 상태 공유 위험. 이 범위는 `beforeEach` 기본 |
| E2E/DB 통합 테스트에서 매 테스트 앱 재부트스트랩 | 느리고 flaky. 이 범위는 `beforeAll` + `afterAll` 정리 권장 |
| 에러 경로 테스트 생략 | 프로덕션 장애의 주원인. 모든 메서드의 에러 케이스 필수 |
| `useClass` + `APP_GUARD` 조합 | `overrideProvider` 불가. `useExisting` 패턴 사용 |
| 테스트 간 DB 상태 공유 | 순서 의존적 테스트. `cleanDatabase()` 또는 rollback |

---

## 완료 조건

- [ ] 테스트가 구현 세부사항이 아니라 외부 행동/계약을 검증한다.
- [ ] Service 테스트는 Fake 우선이며, 외부 경계에서만 Stub/Spy를 사용한다.
- [ ] E2E/통합 테스트는 `app.init()`/`app.close()`와 상태 격리 전략을 포함한다.
- [ ] 최소 1개 이상의 실패/예외 경로 테스트가 포함된다.
- [ ] 레이어별 실행(`test`, `test:int`, `test:e2e`)이 가능한 상태다.

## 검증 체크리스트

- [ ] `beforeAll`/`beforeEach` 선택이 테스트 유형(Service/Collaboration vs E2E/통합)에 맞다.
- [ ] 글로벌 가드 오버라이드는 `APP_GUARD + useExisting` 패턴을 따른다.
- [ ] Snapshot 남용 없이 구조적 assertion으로 검증한다.
- [ ] Mock 호출 순서 대신 결과 상태/도메인 규칙을 검증한다.
- [ ] 시간/랜덤/공유 상태로 인한 flaky 요인이 제거되었다.

## 참조 가이드

### [references/service-patterns.md](references/service-patterns.md)
Service 테스트 핵심 패턴:
- Fake Repository 구현 패턴
- Test.createTestingModule 설정
- Prisma / TypeORM / Mongoose 별 모킹 전략
- Test Factory 패턴
- Collaboration Test vs Contract Test 분리

### [references/infrastructure-patterns.md](references/infrastructure-patterns.md)
인프라 레이어 테스트 패턴:
- Guard 테스트 (ExecutionContext 모킹, APP_GUARD 오버라이드)
- Pipe 테스트 (ValidationPipe, 커스텀 Pipe)
- Interceptor 테스트 (RxJS Observable, CallHandler)
- Exception Filter 테스트
- Custom Decorator 테스트
- Middleware 테스트

### [references/e2e-patterns.md](references/e2e-patterns.md)
E2E 테스트 패턴:
- supertest 기본 설정
- JWT 인증 흐름 테스트
- overrideProvider / overrideModule 패턴
- GraphQL E2E 테스트
- WebSocket E2E 테스트
- BaseTestHelper 추상화 패턴

### [references/advanced-patterns.md](references/advanced-patterns.md)
고급 테스트 패턴:
- Functional Core / Imperative Shell 상세
- CQRS (Command, Query, Saga) 테스트
- 마이크로서비스 (TCP, RPC) 테스트
- Request-Scoped Provider 테스트
- Auto-mock (useMocker) 패턴
- Module 경계 격리 테스트
- DB 통합 전략 (TestContainers, Transaction Rollback, cleanDatabase)

### [references/jest-setup.md](references/jest-setup.md)
Jest 설정 가이드:
- jest.config.ts (단위/통합/E2E 분리)
- moduleNameMapper, path alias 설정
- 커버리지 설정 및 기대치
- 패키지 추천 (@golevelup/ts-jest, jest-mock-extended)
