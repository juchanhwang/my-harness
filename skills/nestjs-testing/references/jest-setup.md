# Jest 설정 가이드

## 목차

- [Jest 설정 분리 전략](#jest-설정-분리-전략)
- [단위/통합 테스트 설정](#단위통합-테스트-설정)
- [E2E 테스트 설정](#e2e-테스트-설정)
- [DB 통합 테스트 설정](#db-통합-테스트-설정)
- [Path Alias 설정](#path-alias-설정)
- [커버리지 설정](#커버리지-설정)
- [커버리지 기대치](#커버리지-기대치)
- [패키지 추천](#패키지-추천)
- [테스트 스크립트](#테스트-스크립트)
- [성능 최적화](#성능-최적화)

---

## Jest 설정 분리 전략

테스트 유형별로 Jest 설정을 분리한다. 속도와 환경이 다르기 때문이다.

```
jest.config.ts          → *.spec.ts         (단위/Collaboration 테스트)
jest-int.config.ts      → *.int-spec.ts     (DB 통합/Contract 테스트)
jest-e2e.config.ts      → *.e2e-spec.ts     (E2E 테스트)
```

---

## 단위/통합 테스트 설정

```typescript
// jest.config.ts
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  collectCoverageFrom: [
    '**/*.ts',
    '!**/*.module.ts',
    '!**/*.dto.ts',
    '!**/*.entity.ts',
    '!**/*.interface.ts',
    '!**/index.ts',
    '!main.ts',
  ],
  coverageDirectory: '../coverage',
  // Fake Repository는 테스트 유틸이므로 커버리지 제외
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/test/',
    '\\.factory\\.ts$',
    '\\.fake\\.ts$',
  ],
};

export default config;
```

---

## E2E 테스트 설정

```typescript
// jest-e2e.config.ts
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testRegex: '.*\\.e2e-spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // E2E는 순차 실행 (포트 충돌 방지)
  maxWorkers: 1,
};

export default config;
```

---

## DB 통합 테스트 설정

```typescript
// jest-int.config.ts
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.int-spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  // DB 통합 테스트도 순차 실행 (DB 상태 격리)
  maxWorkers: 1,
  // 컨테이너 시작 시간 고려
  testTimeout: 30000,
};

export default config;
```

---

## Path Alias 설정

`tsconfig.json`의 paths와 Jest의 `moduleNameMapper`를 일치시킨다.

```typescript
// tsconfig.json
{
  "compilerOptions": {
    "baseUrl": "./src",
    "paths": {
      "@/*": ["./*"]
    }
  }
}

// jest.config.ts
moduleNameMapper: {
  '^@/(.*)$': '<rootDir>/$1',
}
```

### Prisma Client 매핑

Prisma generated client를 사용하는 경우:

```typescript
moduleNameMapper: {
  '^@/(.*)$': '<rootDir>/$1',
  '^\\.prisma/client/(.*)$': '<rootDir>/../node_modules/.prisma/client/$1',
}
```

---

## 커버리지 설정

```typescript
// jest.config.ts
{
  collectCoverage: true,
  coverageDirectory: '../coverage',
  coverageReporters: ['text', 'lcov', 'json-summary'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 75,
      lines: 80,
      statements: 80,
    },
  },
}
```

---

## 커버리지 기대치

| 레이어 | 목표 | 이유 |
|--------|------|------|
| **Functional Core** (Calculator, Validator) | 95%+ | 순수 함수, 모든 분기 커버 가능 |
| **Service** | 80%+ | 핵심 비즈니스 로직, 에러 경로 포함 |
| **Guard / Pipe / Interceptor** | 90%+ | 공통 인프라, 높은 재사용 |
| **Controller** | 50-70% | 위임만 하므로 낮아도 OK |
| **Module 설정** | 제외 | DI 설정은 E2E에서 자연 검증 |
| **DTO / Entity** | 제외 | 데이터 정의, 로직 없음 |

---

## 패키지 추천

### 필수

```bash
npm install --save-dev jest ts-jest @types/jest @nestjs/testing supertest @types/supertest
```

### 권장

```bash
# Mock 자동화 — ExecutionContext, Repository 등 복잡한 타입 자동 mock
npm install --save-dev @golevelup/ts-jest

# Prisma deep mock
npm install --save-dev jest-mock-extended

# TestContainers — DB 통합 테스트
npm install --save-dev @testcontainers/postgresql
# 또는
npm install --save-dev @testcontainers/mysql
```

### 패키지 역할

| 패키지 | 역할 | 사용 시점 |
|--------|------|----------|
| `@golevelup/ts-jest` | `createMock<T>()` — 타입 기반 자동 mock 생성 | Guard, Interceptor 테스트의 ExecutionContext |
| `jest-mock-extended` | `mockDeep<T>()` — 깊은 중첩 객체 mock | Prisma Client mock |
| `@testcontainers/*` | Docker 컨테이너 기반 실제 DB | Contract Test |
| `supertest` | HTTP 요청 테스트 | E2E 테스트 |

---

## 테스트 스크립트

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:cov": "jest --coverage",
    "test:debug": "node --inspect-brk -r tsconfig-paths/register -r ts-node/register node_modules/.bin/jest --runInBand",
    "test:int": "jest --config jest-int.config.ts",
    "test:e2e": "jest --config jest-e2e.config.ts",
    "test:all": "jest && jest --config jest-int.config.ts && jest --config jest-e2e.config.ts"
  }
}
```

---

## 성능 최적화

### 1. Collaboration 테스트는 DI 없이 직접 생성

```typescript
// ❌ 느림: 매 테스트마다 NestJS DI 컨테이너 생성
beforeEach(async () => {
  const module = await Test.createTestingModule({ ... }).compile();
  service = module.get(UserService);
});

// ✅ 빠름: 직접 생성 (DI가 필요 없는 경우)
beforeEach(() => {
  const repo = new InMemoryUserRepository();
  const email = { send: jest.fn() };
  service = new UserService(repo, email);
});
```

### 2. E2E는 beforeAll로 앱 재사용

```typescript
// ❌ 느림: 매 테스트마다 앱 재생성
beforeEach(async () => { app = ...; await app.init(); });
afterEach(async () => { await app.close(); });

// ✅ 빠름: suite당 한 번만 생성
beforeAll(async () => { app = ...; await app.init(); });
afterAll(async () => { await app.close(); });
```

### 3. 병렬 실행 설정

```typescript
// 단위 테스트: 병렬 (기본값)
// jest.config.ts — maxWorkers 미설정 (자동 최적화)

// E2E / DB 통합: 순차
// jest-e2e.config.ts
maxWorkers: 1,
```

### 4. 무거운 import 지연

```typescript
// 테스트에서 무거운 모듈은 필요할 때만 import
let app: INestApplication;

beforeAll(async () => {
  const { AppModule } = await import('../src/app.module');
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication();
  await app.init();
});
```
