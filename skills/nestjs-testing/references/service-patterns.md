# Service 테스트 패턴

## 목차

- [Fake Repository 구현](#fake-repository-구현)
- [Collaboration Test 패턴](#collaboration-test-패턴)
- [Contract Test 패턴](#contract-test-패턴)
- [Test Factory 패턴](#test-factory-패턴)
- [Prisma 모킹 전략](#prisma-모킹-전략)
- [TypeORM 모킹 전략](#typeorm-모킹-전략)
- [Mongoose 모킹 전략](#mongoose-모킹-전략)
- [createTestingModule 설정](#createtestingmodule-설정)

---

## Fake Repository 구현

Fake는 Interface를 실제로 구현하는 InMemory 클래스다. `jest.fn()` 대신 사용하여 타입 안전성과 리팩토링 내성을 확보한다.

### 기본 Fake

```typescript
export class InMemoryUserRepository implements UserRepository {
  private store = new Map<string, User>();
  private autoIncrementId = 1;

  async findById(id: string): Promise<User | null> {
    return this.store.get(id) ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    return [...this.store.values()].find(u => u.email === email) ?? null;
  }

  async save(user: User): Promise<User> {
    const saved = { ...user, id: user.id ?? String(this.autoIncrementId++) };
    this.store.set(saved.id, saved);
    return saved;
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }

  // 테스트 제어 메서드
  clear(): void { this.store.clear(); }
  count(): number { return this.store.size; }

  // 초기 데이터를 포함한 생성 (정적 팩토리)
  static withUsers(users: User[]): InMemoryUserRepository {
    const repo = new InMemoryUserRepository();
    users.forEach(u => repo.store.set(u.id, u));
    return repo;
  }
}
```

### Fake vs jest.fn() 비교

```typescript
// ❌ jest.fn() — 허위 신뢰 위험
const mockRepo = {
  findById: jest.fn().mockResolvedValue(mockUser),
  save: jest.fn().mockResolvedValue(mockUser),
};
// 문제: findById의 실제 동작을 시뮬레이션하지 않음
// save 후 findById로 조회해도 아무 관련 없음

// ✅ Fake — 실제 동작
const fakeRepo = new InMemoryUserRepository();
await fakeRepo.save(user);
const found = await fakeRepo.findById(user.id); // 실제로 찾아짐
```

---

## Collaboration Test 패턴

Collaboration Test는 Service가 **협력자(Repository, 외부 서비스)를 올바르게 사용하는지** 행동으로 검증한다. 협력자는 Fake 또는 Stub으로 교체한다.

### 기본 패턴

```typescript
describe('UserService (Collaboration)', () => {
  let service: UserService;
  let userRepo: InMemoryUserRepository;
  let emailService: { sendWelcome: jest.Mock };

  beforeEach(async () => {
    userRepo = new InMemoryUserRepository();
    emailService = { sendWelcome: jest.fn() }; // 외부 서비스만 Stub

    const module = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: 'UserRepository', useValue: userRepo },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();

    service = module.get(UserService);
  });

  describe('register', () => {
    it('유효한 정보로 등록하면 사용자가 생성된다', async () => {
      const result = await service.register({
        email: 'new@test.com',
        password: 'StrongPass1!',
      });

      // 상태 검증 — 결과와 side-effect를 확인
      expect(result.email).toBe('new@test.com');
      expect(await userRepo.findByEmail('new@test.com')).toBeDefined();
    });

    it('등록 성공 시 환영 이메일이 전송된다', async () => {
      await service.register({ email: 'new@test.com', password: 'StrongPass1!' });

      // 외부 서비스 호출은 Spy로 검증 (경계에서의 상호작용)
      expect(emailService.sendWelcome).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'new@test.com' }),
      );
    });

    it('중복 이메일이면 ConflictException을 던진다', async () => {
      userRepo = InMemoryUserRepository.withUsers([
        createUser({ email: 'taken@test.com' }),
      ]);

      await expect(
        service.register({ email: 'taken@test.com', password: 'StrongPass1!' }),
      ).rejects.toThrow(ConflictException);
    });

    it('비밀번호가 8자 미만이면 BadRequestException을 던진다', async () => {
      await expect(
        service.register({ email: 'new@test.com', password: 'short' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
```

---

## Contract Test 패턴

Contract Test는 Fake Repository의 **약속이 실제 구현과 일치하는지** 검증한다. 실제 DB를 사용한다.

### Rainsberger의 분리 원칙

```
Collaboration Test: Service → Fake Repository (빠름, 조합 커버)
Contract Test:      Fake Repository ↔ Real Repository (느림, 계약만 검증)

두 테스트를 합치면 → 조합 폭발 없이 전체 커버
```

### Contract Test 구현

```typescript
// 동일한 계약 테스트를 Fake와 Real 모두에 실행
function repositoryContractTests(createRepo: () => Promise<UserRepository>) {
  let repo: UserRepository;

  beforeEach(async () => {
    repo = await createRepo();
  });

  it('save 후 findById로 조회할 수 있다', async () => {
    const user = createUser({ email: 'test@test.com' });
    const saved = await repo.save(user);
    const found = await repo.findById(saved.id);

    expect(found).toBeDefined();
    expect(found!.email).toBe('test@test.com');
  });

  it('존재하지 않는 ID는 null을 반환한다', async () => {
    const found = await repo.findById('nonexistent');
    expect(found).toBeNull();
  });

  it('중복 이메일로 save하면 에러가 발생한다', async () => {
    await repo.save(createUser({ email: 'dup@test.com' }));
    await expect(repo.save(createUser({ email: 'dup@test.com' })))
      .rejects.toThrow();
  });
}

// Fake에 대해 실행 — 빠름
describe('InMemoryUserRepository (Contract)', () => {
  repositoryContractTests(async () => new InMemoryUserRepository());
});

// Real에 대해 실행 — 실제 DB
describe('PrismaUserRepository (Contract)', () => {
  repositoryContractTests(async () => {
    const prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.user.deleteMany();
    return new PrismaUserRepository(prisma);
  });
});
```

---

## Test Factory 패턴

테스트 데이터 생성을 중앙화하여 일관성과 가독성을 확보한다.

```typescript
// test/factories/user.factory.ts
export function createUser(overrides: Partial<User> = {}): User {
  return {
    id: '1',
    email: 'test@example.com',
    name: '테스트유저',
    role: Role.USER,
    isActive: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

// 사용
const admin = createUser({ role: Role.ADMIN });
const inactive = createUser({ isActive: false });

// DTO Factory
export function createRegisterDto(overrides: Partial<RegisterDto> = {}): RegisterDto {
  return {
    email: 'new@example.com',
    password: 'StrongPass1!',
    name: '신규유저',
    ...overrides,
  };
}
```

---

## Prisma 모킹 전략

### 방법 1: Fake Repository (권장)

Repository Interface를 정의하고 InMemory Fake를 구현한다. 위의 Fake Repository 구현 참조.

### 방법 2: jest-mock-extended (Stub 기반)

Interface 없이 빠르게 Stub을 만들 때 사용. 리팩토링 내성은 Fake보다 낮다.

```typescript
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';

describe('UserService', () => {
  let service: UserService;
  let prisma: DeepMockProxy<PrismaClient>;

  beforeEach(async () => {
    prisma = mockDeep<PrismaClient>();

    const module = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(UserService);
  });

  it('findById가 유저를 반환한다', async () => {
    const mockUser = createUser();
    prisma.user.findUnique.mockResolvedValue(mockUser);

    const result = await service.findById('1');
    expect(result.email).toBe(mockUser.email);
  });
});
```

---

## TypeORM 모킹 전략

`getRepositoryToken(Entity)`으로 Repository를 주입한다.

```typescript
import { getRepositoryToken } from '@nestjs/typeorm';

const module = await Test.createTestingModule({
  providers: [
    UserService,
    {
      provide: getRepositoryToken(UserEntity),
      useValue: {
        find: jest.fn().mockResolvedValue([mockUser]),
        findOneOrFail: jest.fn().mockResolvedValue(mockUser),
        save: jest.fn().mockResolvedValue(mockUser),
        delete: jest.fn().mockResolvedValue({ affected: 1 }),
      },
    },
  ],
}).compile();
```

---

## Mongoose 모킹 전략

`getModelToken('ModelName')`으로 Model을 주입한다. 쿼리 체이닝에 주의.

```typescript
import { getModelToken } from '@nestjs/mongoose';
import { createMock } from '@golevelup/ts-jest';
import { Query } from 'mongoose';

const module = await Test.createTestingModule({
  providers: [
    CatService,
    {
      provide: getModelToken('Cat'),
      useValue: {
        find: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn().mockResolvedValue(mockCat),
      },
    },
  ],
}).compile();

// Mongoose 쿼리 체이닝 — exec() 포함 필수
jest.spyOn(model, 'findOne').mockReturnValueOnce(
  createMock<Query<CatDoc, CatDoc>>({
    exec: jest.fn().mockResolvedValueOnce(mockCat),
  }),
);
```

---

## createTestingModule 설정

### 기본 패턴

```typescript
const module = await Test.createTestingModule({
  providers: [
    UserService,
    { provide: 'UserRepository', useValue: new InMemoryUserRepository() },
    { provide: EmailService, useValue: { sendWelcome: jest.fn() } },
  ],
}).compile();
```

### Service Helper 함수

반복되는 모듈 구성을 헬퍼로 추출한다.

```typescript
function createUserService(overrides: {
  userRepo?: UserRepository;
  emailService?: Partial<EmailService>;
} = {}) {
  const userRepo = overrides.userRepo ?? new InMemoryUserRepository();
  const emailService = { sendWelcome: jest.fn(), ...overrides.emailService };

  return { service: new UserService(userRepo, emailService), userRepo, emailService };
}

// 사용 — DI 없이 직접 생성 (Cooper 스타일)
it('test', async () => {
  const { service, userRepo } = createUserService();
  await service.register(dto);
  expect(await userRepo.findByEmail(dto.email)).toBeDefined();
});
```
