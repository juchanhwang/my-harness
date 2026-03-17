# 고급 테스트 패턴

## 목차

- [Functional Core / Imperative Shell 상세](#functional-core--imperative-shell-상세)
- [CQRS 테스트](#cqrs-테스트)
- [마이크로서비스 테스트](#마이크로서비스-테스트)
- [Request-Scoped Provider 테스트](#request-scoped-provider-테스트)
- [Auto-mock (useMocker)](#auto-mock-usemocker)
- [Module 경계 격리 테스트](#module-경계-격리-테스트)
- [DB 통합 전략](#db-통합-전략)
- [Configuration 테스트](#configuration-테스트)
- [Lifecycle Hooks 테스트](#lifecycle-hooks-테스트)

---

## Functional Core / Imperative Shell 상세

Gary Bernhardt의 "Boundaries" 원칙: **결정(decision)은 Core에, I/O는 Shell에.**

### 패턴: 도메인 로직 추출

```typescript
// ❌ BAD: Service에 모든 로직이 혼재 — 테스트하려면 DB mock 필요
@Injectable()
export class OrderService {
  async placeOrder(dto: PlaceOrderDto): Promise<Order> {
    const items = await this.productRepo.findByIds(dto.itemIds);
    let total = 0;
    for (const item of items) {
      if (item.stock < dto.quantities[item.id]) {
        throw new BadRequestException(`재고 부족: ${item.name}`);
      }
      total += item.price * dto.quantities[item.id];
    }
    if (dto.couponCode) {
      const coupon = await this.couponRepo.findByCode(dto.couponCode);
      if (coupon && coupon.expiresAt > new Date()) {
        total *= (1 - coupon.discountRate);
      }
    }
    // ... 더 많은 분기 로직
  }
}
```

```typescript
// ✅ GOOD: Core로 추출 — Mock 없이 모든 분기 테스트 가능

// Functional Core — 순수 함수
export class OrderCalculator {
  static validateStock(
    items: ProductInfo[],
    quantities: Record<string, number>,
  ): StockValidationResult {
    const errors = items
      .filter(item => item.stock < (quantities[item.id] ?? 0))
      .map(item => `재고 부족: ${item.name}`);
    return { valid: errors.length === 0, errors };
  }

  static calculateTotal(
    items: ProductInfo[],
    quantities: Record<string, number>,
    coupon: CouponInfo | null,
    now: Date,
  ): number {
    const subtotal = items.reduce(
      (sum, item) => sum + item.price * (quantities[item.id] ?? 0), 0,
    );
    if (coupon && coupon.expiresAt > now) {
      return subtotal * (1 - coupon.discountRate);
    }
    return subtotal;
  }
}

// Imperative Shell — I/O 조율만
@Injectable()
export class OrderService {
  async placeOrder(dto: PlaceOrderDto): Promise<Order> {
    const items = await this.productRepo.findByIds(dto.itemIds);
    const coupon = dto.couponCode
      ? await this.couponRepo.findByCode(dto.couponCode) : null;

    const stockResult = OrderCalculator.validateStock(items, dto.quantities);
    if (!stockResult.valid) throw new BadRequestException(stockResult.errors);

    const total = OrderCalculator.calculateTotal(items, dto.quantities, coupon, new Date());
    return this.orderRepo.save(Order.create({ ...dto, total }));
  }
}
```

```typescript
// Core 테스트 — 빠르고, exhaustive, Mock 없음
describe('OrderCalculator', () => {
  describe('validateStock', () => {
    it('재고가 충분하면 valid', () => {
      const items = [{ id: '1', name: 'A', stock: 10, price: 100 }];
      expect(OrderCalculator.validateStock(items, { '1': 5 }).valid).toBe(true);
    });

    it('재고 부족이면 에러 메시지 포함', () => {
      const items = [{ id: '1', name: 'A', stock: 2, price: 100 }];
      const result = OrderCalculator.validateStock(items, { '1': 5 });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('재고 부족: A');
    });
  });

  describe('calculateTotal', () => {
    const items = [{ id: '1', name: 'A', stock: 10, price: 1000 }];
    const now = new Date('2024-06-01');

    it('쿠폰 없으면 정가', () => {
      expect(OrderCalculator.calculateTotal(items, { '1': 2 }, null, now)).toBe(2000);
    });

    it('유효한 쿠폰이면 할인 적용', () => {
      const coupon = { discountRate: 0.1, expiresAt: new Date('2024-12-31') };
      expect(OrderCalculator.calculateTotal(items, { '1': 2 }, coupon, now)).toBe(1800);
    });

    it('만료된 쿠폰이면 할인 미적용', () => {
      const coupon = { discountRate: 0.1, expiresAt: new Date('2024-01-01') };
      expect(OrderCalculator.calculateTotal(items, { '1': 2 }, coupon, now)).toBe(2000);
    });
  });
});
```

---

## CQRS 테스트

### Command Handler

```typescript
describe('CreateOrderHandler', () => {
  let handler: CreateOrderHandler;
  let eventBus: { publish: jest.Mock };

  beforeEach(async () => {
    eventBus = { publish: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        CreateOrderHandler,
        { provide: EventBus, useValue: eventBus },
        { provide: 'OrderRepository', useValue: new InMemoryOrderRepository() },
      ],
    }).compile();

    handler = module.get(CreateOrderHandler);
  });

  it('주문을 생성하고 이벤트를 발행한다', async () => {
    const command = new CreateOrderCommand(userId, items);
    const result = await handler.execute(command);

    expect(result).toHaveProperty('id');
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: result.id }),
    );
  });
});
```

### Saga

```typescript
describe('OrderSaga', () => {
  let saga: OrderSaga;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [CqrsModule, AppModule],
    }).compile();
    await module.init(); // CQRS는 init() 필수

    saga = module.get(OrderSaga);
  });

  it('OrderCreatedEvent가 SendConfirmationCommand를 트리거한다', (done) => {
    const event = new OrderCreatedEvent(orderId, userEmail);

    saga.orderCreated(event).subscribe({
      next: (command) => {
        expect(command).toBeInstanceOf(SendConfirmationCommand);
        expect(command.email).toBe(userEmail);
      },
      complete: () => done(),
    });
  });
});
```

---

## 마이크로서비스 테스트

```typescript
describe('Sum RPC (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    app.connectMicroservice<MicroserviceOptions>({
      transport: Transport.TCP,
      options: { host: '0.0.0.0' },
    });
    await app.startAllMicroservices();
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  it('TCP를 통해 합계를 계산한다', () => {
    return request(app.getHttpServer())
      .post('/?command=sum')
      .send([1, 2, 3, 4, 5])
      .expect(200, '15');
  });
});
```

---

## Request-Scoped Provider 테스트

```typescript
import { ContextIdFactory } from '@nestjs/core';

it('요청마다 새 인스턴스를 생성한다', async () => {
  // 고정 contextId 생성
  const contextId = ContextIdFactory.create();
  jest.spyOn(ContextIdFactory, 'getByRequest').mockImplementation(() => contextId);

  // resolve()로 Request-Scoped 인스턴스 조회
  const service = await moduleRef.resolve(RequestScopedService, contextId);
  expect(service).toBeDefined();

  // 다른 contextId → 다른 인스턴스
  const contextId2 = ContextIdFactory.create();
  const service2 = await moduleRef.resolve(RequestScopedService, contextId2);
  expect(service).not.toBe(service2);
});
```

---

## Auto-mock (useMocker)

의존성이 많고 대부분 테스트와 무관할 때 사용한다.

### jest-mock 기반

```typescript
import { ModuleMocker, MockFunctionMetadata } from 'jest-mock';

const moduleMocker = new ModuleMocker(global);

const module = await Test.createTestingModule({
  controllers: [UserController],
})
  .useMocker(token => {
    // 특정 토큰만 커스텀
    if (token === UserService) {
      return { findAll: jest.fn().mockResolvedValue([mockUser]) };
    }
    // 나머지 자동 mock
    if (typeof token === 'function') {
      const mockMetadata = moduleMocker.getMetadata(token) as MockFunctionMetadata<any, any>;
      const Mock = moduleMocker.generateFromMetadata(mockMetadata);
      return new Mock();
    }
  })
  .compile();
```

### @golevelup/ts-jest 기반 (간결)

```typescript
import { createMock } from '@golevelup/ts-jest';

const module = await Test.createTestingModule({
  controllers: [UserController],
})
  .useMocker(createMock) // 모든 미등록 의존성을 자동 mock
  .compile();

// 이후 특정 메서드만 커스텀
const userService = module.get(UserService);
(userService.findAll as jest.Mock).mockResolvedValue([mockUser]);
```

> ⚠️ `useMocker` 사용 시 토큰 불일치에 주의. 불일치하면 에러 없이 undefined가 반환될 수 있다.

---

## Module 경계 격리 테스트

```typescript
// 모듈의 exports/providers가 올바르게 구성되었는지 검증
it('UserModule이 UserService를 export한다', async () => {
  const module = await Test.createTestingModule({
    imports: [UserModule],
  }).compile();

  const service = module.get(UserService);
  expect(service).toBeDefined();
});

// 잘못된 의존성 설정 감지
it('미등록 토큰 export 시 UnknownExportException', async () => {
  await expect(
    Test.createTestingModule({
      imports: [BadExportsModule],
    }).compile(),
  ).rejects.toThrow();
});
```

---

## DB 통합 전략

### 전략 1: cleanDatabase (Prisma)

```typescript
// PrismaService에 cleanDatabase 추가
async cleanDatabase() {
  if (process.env.NODE_ENV === 'production') return; // 프로덕션 보호
  const models = Reflect.ownKeys(this).filter(key => key[0] !== '_');
  return Promise.all(models.map(key => (this as any)[key].deleteMany()));
}

// 테스트
beforeAll(async () => {
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  prisma = module.get(PrismaService);
  await prisma.cleanDatabase();
});
```

### 전략 2: Transaction Rollback (TypeORM)

```typescript
let queryRunner: QueryRunner;

beforeEach(async () => {
  const dataSource = app.get(DataSource);
  queryRunner = dataSource.createQueryRunner();
  await queryRunner.startTransaction();
});

afterEach(async () => {
  await queryRunner.rollbackTransaction();
  await queryRunner.release();
});
```

### 전략 3: TestContainers

```typescript
import { PostgreSqlContainer } from '@testcontainers/postgresql';

let container: StartedPostgreSqlContainer;

beforeAll(async () => {
  container = await new PostgreSqlContainer().start();
  process.env.DATABASE_URL = container.getConnectionUri();
  // 앱 부트스트랩...
}, 30000); // 컨테이너 시작 시간

afterAll(async () => {
  await app.close();
  await container.stop();
});
```

---

## Configuration 테스트

```typescript
// 방법 1: ConfigService mock
const module = await Test.createTestingModule({
  providers: [
    MyService,
    {
      provide: ConfigService,
      useValue: {
        get: jest.fn((key: string) => ({
          JWT_SECRET: 'test-secret',
          DATABASE_URL: 'sqlite::memory:',
        })[key]),
      },
    },
  ],
}).compile();

// 방법 2: ConfigModule.forRoot with test config
const module = await Test.createTestingModule({
  imports: [
    ConfigModule.forRoot({
      load: [() => ({
        jwt: { secret: 'test-secret' },
        database: { url: 'sqlite::memory:' },
      })],
    }),
    MyModule,
  ],
}).compile();
```

---

## Lifecycle Hooks 테스트

```typescript
describe('OnModuleInit', () => {
  it('앱 시작 시 onModuleInit이 호출된다', async () => {
    const onModuleInitSpy = jest.fn();

    @Injectable()
    class TestService implements OnModuleInit {
      onModuleInit = onModuleInitSpy;
    }

    const module = await Test.createTestingModule({
      providers: [TestService],
    }).compile();

    const app = module.createNestApplication();
    await app.init(); // 이 시점에 onModuleInit 호출

    expect(onModuleInitSpy).toHaveBeenCalledTimes(1);

    await app.close();
  });
});
```
