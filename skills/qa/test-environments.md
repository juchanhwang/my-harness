# Test Environments

## 환경 유형

| 환경             | 용도        | 데이터     | 외부 서비스     |
| -------------- | --------- | ------- | ---------- |
| **Local**      | 개발자 로컬    | 시드 데이터  | 모킹         |
| **CI**         | 자동 테스트    | 일회성     | 모킹 or 테스트용 |
| **Staging**    | 통합/인수 테스트 | 프로덕션 유사 | 실제 (샌드박스)  |
| **Preview**    | PR별 환경    | 시드 데이터  | 모킹 or 샌드박스 |
| **Production** | 실 서비스     | 실 데이터   | 실제         |

## Docker 테스트 환경

### docker-compose.test.yml

```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
      target: test
    environment:
      NODE_ENV: test
      DATABASE_URL: postgresql://test:test@postgres:5432/testdb
      REDIS_URL: redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - ./test-results:/app/test-results

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
      POSTGRES_DB: testdb
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U test"]
      interval: 5s
      timeout: 5s
      retries: 5
    tmpfs:
      - /var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5
```

```bash
# 테스트 실행
docker compose -f docker-compose.test.yml run --rm app npm test

# 정리
docker compose -f docker-compose.test.yml down -v
```

### Testcontainers (프로그래밍 방식)

```typescript
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer } from '@testcontainers/redis';

let pgContainer: StartedPostgreSqlContainer;
let redisContainer: StartedRedisContainer;

beforeAll(async () => {
  pgContainer = await new PostgreSqlContainer('postgres:16')
    .withDatabase('testdb')
    .start();

  redisContainer = await new RedisContainer('redis:7').start();

  process.env.DATABASE_URL = pgContainer.getConnectionUri();
  process.env.REDIS_URL = redisContainer.getConnectionUrl();

  // 마이그레이션 실행
  await runMigrations(process.env.DATABASE_URL);
}, 60000);

afterAll(async () => {
  await pgContainer?.stop();
  await redisContainer?.stop();
});
```

## 데이터 시딩 (Test Data Seeding)

### 시딩 스크립트

```typescript
// test/seed.ts
import { db } from '@/db';
import { users, products, orders } from '@/db/schema';

export async function seedTestData() {
  // 기존 데이터 정리
  await db.delete(orders);
  await db.delete(products);
  await db.delete(users);

  // 사용자 시딩
  const [alice, bob] = await db.insert(users).values([
    { name: 'Alice', email: 'alice@test.com', role: 'admin', password: await hash('password123') },
    { name: 'Bob', email: 'bob@test.com', role: 'member', password: await hash('password123') },
  ]).returning();

  // 상품 시딩
  const [product1, product2] = await db.insert(products).values([
    { name: '상품 A', price: 10000, stock: 100 },
    { name: '상품 B', price: 20000, stock: 50 },
  ]).returning();

  // 주문 시딩
  await db.insert(orders).values([
    { userId: alice.id, productId: product1.id, quantity: 2, status: 'completed' },
    { userId: bob.id, productId: product2.id, quantity: 1, status: 'pending' },
  ]);

  return { users: { alice, bob }, products: { product1, product2 } };
}

// E2E 시딩 API 엔드포인트 (테스트 환경에서만)
if (process.env.NODE_ENV === 'test') {
  app.post('/api/test/seed', async (req, res) => {
    const data = await seedTestData();
    res.json(data);
  });

  app.post('/api/test/cleanup', async (req, res) => {
    await cleanupTestData();
    res.json({ ok: true });
  });
}
```

### Fixture 파일

```json
// test/fixtures/users.json
[
  {
    "id": "user-1",
    "name": "Test Admin",
    "email": "admin@test.com",
    "role": "admin"
  },
  {
    "id": "user-2",
    "name": "Test Member",
    "email": "member@test.com",
    "role": "member"
  }
]
```

## 환경 격리

### 테스트 간 격리 전략

| 전략             | 속도 | 격리 수준 | 복잡도 |
| -------------- | -- | ----- | --- |
| 트랜잭션 롤백        | 빠름 | 높음    | 낮음  |
| TRUNCATE + 재시딩 | 보통 | 높음    | 중간  |
| 테스트별 DB        | 느림 | 최고    | 높음  |
| 고유 데이터 (UUID)  | 빠름 | 중간    | 낮음  |

### 트랜잭션 롤백 (가장 추천)

```typescript
import { beforeEach, afterEach } from 'vitest';

let savepoint: string;

beforeEach(async () => {
  savepoint = `test_${Date.now()}`;
  await db.execute(sql.raw(`SAVEPOINT ${savepoint}`));
});

afterEach(async () => {
  await db.execute(sql.raw(`ROLLBACK TO SAVEPOINT ${savepoint}`));
});
```

### 고유 데이터 전략

```typescript
function uniqueEmail() {
  return `test-${crypto.randomUUID()}@test.com`;
}

test('사용자 생성', async () => {
  const email = uniqueEmail();
  await createUser({ email });
  const user = await findByEmail(email);
  expect(user).toBeTruthy();
});
```

## 환경 변수 관리

### .env 파일 계층

```
.env                  # 기본값 (커밋)
.env.local            # 로컬 오버라이드 (gitignore)
.env.test             # 테스트 환경 (커밋)
.env.test.local       # 테스트 로컬 오버라이드 (gitignore)
.env.production       # 프로덕션 (커밋, 민감 정보 없음)
```

```bash
# .env.test
NODE_ENV=test
DATABASE_URL=postgresql://test:test@localhost:5432/testdb
REDIS_URL=redis://localhost:6379
LOG_LEVEL=error
ENABLE_RATE_LIMIT=false
EXTERNAL_API_URL=http://localhost:9090
```

## Preview 환경 (PR별 환경)

### Vercel Preview Deployments

```yaml
e2e-preview:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - name: Wait for Vercel preview
      uses: patrickedqvist/wait-for-vercel-preview@v1
      id: preview
      with:
        token: ${{ secrets.GITHUB_TOKEN }}
    - run: npx playwright test
      env:
        BASE_URL: ${{ steps.preview.outputs.url }}
```

## 환경 관리 체크리스트

* [ ] 테스트 환경이 프로덕션과 격리되어 있는가
* [ ] 테스트 데이터가 자동으로 시딩/정리되는가
* [ ] 테스트 간 데이터 격리가 보장되는가
* [ ] Docker로 일관된 환경이 재현 가능한가
* [ ] 환경 변수가 계층적으로 관리되는가
* [ ] 테스트 전용 API 엔드포인트가 프로덕션에서 비활성화되는가
* [ ] 외부 서비스가 모킹/샌드박스로 대체되는가
* [ ] CI 환경이 로컬과 동일한 결과를 내는가