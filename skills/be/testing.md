# Testing

## 목차

1. [테스트 피라미드](#1-테스트-피라미드)
2. [Unit Testing (Vitest)](#2-unit-testing-vitest)
3. [Integration Testing 전략](#3-integration-testing-전략)
4. [Test Doubles 전략](#4-test-doubles-전략)
5. [CI/CD Integration](#5-cicd-integration)
6. [핵심 원칙 요약](#6-핵심-원칙-요약)

## 1. 테스트 피라미드

```
         /  E2E  \        — 적게, 핵심 플로우만
        / Integration \    — 중간, API + DB 통합
       /   Unit Tests   \  — 많이, 순수 로직 위주
```

### 목표 커버리지

* **Unit**: 80%+ (비즈니스 로직, 유틸리티)
* **Integration**: 핵심 API endpoint 전수
* **E2E**: 주요 사용자 시나리오 (결제, 가입 등)

## 2. Unit Testing (Vitest)

### 설정

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['src/**/*.d.ts', 'src/db/migrations/**'],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
  },
});
```

### Service 테스트 (비즈니스 로직)

```typescript
// services/order.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrderService } from './order.service.js';
import { InsufficientBalanceError } from '../errors/domain.js';

describe('OrderService', () => {
  let orderService: OrderService;
  let mockOrderRepo: any;
  let mockProductRepo: any;

  beforeEach(() => {
    mockOrderRepo = {
      createWithItems: vi.fn(),
      findByUserId: vi.fn(),
    };
    mockProductRepo = {
      findByIds: vi.fn(),
      decrementStock: vi.fn(),
    };
    orderService = new OrderService(mockOrderRepo, mockProductRepo);
  });

  describe('create', () => {
    it('should create order with valid items', async () => {
      const products = [
        { id: 1, name: 'Item A', price: 10000, stock: 5 },
      ];
      mockProductRepo.findByIds.mockResolvedValue(products);
      mockOrderRepo.createWithItems.mockResolvedValue({ id: 1, totalAmount: 20000 });

      const result = await orderService.create(1, [
        { productId: 1, quantity: 2 },
      ]);

      expect(result.totalAmount).toBe(20000);
      expect(mockOrderRepo.createWithItems).toHaveBeenCalledOnce();
      expect(mockProductRepo.decrementStock).toHaveBeenCalledOnce();
    });

    it('should throw when stock is insufficient', async () => {
      const products = [
        { id: 1, name: 'Item A', price: 10000, stock: 1 },
      ];
      mockProductRepo.findByIds.mockResolvedValue(products);

      await expect(
        orderService.create(1, [{ productId: 1, quantity: 5 }]),
      ).rejects.toThrow('Insufficient stock');
    });
  });
});
```

### 유틸리티 테스트

```typescript
// utils/retry.test.ts
describe('withRetry', () => {
  it('should succeed on first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 10, maxDelayMs: 100 });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('should retry on failure and succeed', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok');

    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 10, maxDelayMs: 100 });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw after max retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('persistent fail'));

    await expect(
      withRetry(fn, { maxRetries: 2, baseDelayMs: 10, maxDelayMs: 100 }),
    ).rejects.toThrow('persistent fail');
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });
});
```

## 3. Integration Testing 전략

Integration test는 **여러 계층(HTTP → Service → Repository → DB)을 함께 실행**하여 실제 동작을 검증한다. Unit test가 mock 기반으로 빠르게 실행되는 반면, integration test는 실제 DB, 실제 HTTP framework stack을 사용한다.

### 원칙

* **실제 DB 사용** — In-memory DB가 아닌 프로덕션과 같은 종류의 DB (PostgreSQL)
* **외부 서비스만 Mock** — 결제, 이메일, SMS 등 외부 API는 Mock/Fake로 대체
* **테스트 격리** — 각 테스트는 독립적으로 실행 (beforeEach에서 DB clean)
* **End-to-end 커버** — request parsing부터 response serialization까지 전체 flow

### 검증 포인트

* HTTP status code, response body 구조
* DB 상태 변화 (insert, update, delete 효과)
* Side effect (이벤트 발행, 큐 메시지 등)
* 인증/인가 flow (토큰 검증, 권한 체크)
* Error handling (4xx, 5xx 응답 형식)

> **Fastify `app.inject()` 기반 통합 테스트 구현**(buildApp 패턴, Setup/Teardown, 인증 토큰 발급, DB clean)은 [fastify/testing.md](fastify/testing.md)에 정식 정의가 있다.
> 이 파일은 framework 중립 통합 테스트 전략에 집중한다.

## 4. Test Doubles 전략

| 종류       | 용도            | 예제                                       |
| -------- | ------------- | ---------------------------------------- |
| **Stub** | 고정된 값 반환      | `vi.fn().mockResolvedValue(data)`        |
| **Mock** | 호출 여부/인자 검증   | `expect(mock).toHaveBeenCalledWith(...)` |
| **Spy**  | 실제 구현 유지 + 추적 | `vi.spyOn(service, 'method')`            |
| **Fake** | 간소화된 실제 구현    | In-memory DB, fake email sender          |

### 원칙

* **Unit test**: Mock/Stub으로 의존성 격리
* **Integration test**: 실제 DB, 실제 HTTP framework 스택. 외부 API만 Mock
* **외부 서비스는 항상 Mock** — 결제 API, 이메일, SMS 등

```typescript
// Fake repository (integration test용)
class FakeEmailService implements EmailService {
  sent: Array<{ to: string; subject: string }> = [];

  async send(to: string, subject: string, body: string) {
    this.sent.push({ to, subject });
  }
}
```

## 5. CI/CD Integration

```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: test
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
        ports: ['5432:5432']
        options: --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: npm ci
      - run: npm run db:migrate
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/test
      - run: npm run test
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/test
          JWT_SECRET: test-secret-for-ci-minimum-32-chars
```

## 6. 핵심 원칙 요약

1. **Service 로직은 unit test** — Mock으로 빠르게, 비즈니스 규칙 검증
2. **API endpoint는 integration test** — 실제 HTTP framework + 실제 DB
3. **외부 서비스는 항상 격리** — Mock/Fake로 대체
4. **CI에서 반드시 실행** — PR merge 전 모든 테스트 통과 필수
5. **테스트 DB는 격리** — 각 테스트 suite마다 클린업
6. **커버리지는 목표가 아닌 최소 기준** — 80%는 넘기되 100% 강박 금지

---

## Related

- [fastify/testing.md](fastify/testing.md) — Fastify `app.inject()` 기반 통합 테스트 구현
- [api-design.md](api-design.md) — REST 엔드포인트 설계·테스트 대상
- [domain-driven-design.md](domain-driven-design.md) — Aggregate 단위 테스트
- [drizzle-orm.md](drizzle-orm.md) — DB 테스트 세팅·transaction rollback
- [observability.md](observability.md) — 테스트 환경 로깅·trace
