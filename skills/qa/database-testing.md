# Database Testing

## 데이터베이스 테스트 범위

| 테스트 영역  | 대상              | 중요도    |
| ------- | --------------- | ------ |
| 마이그레이션  | 스키마 변경이 안전한가    | **최고** |
| 데이터 무결성 | 제약 조건, 관계가 올바른가 | **높음** |
| 쿼리 정확성  | 올바른 데이터를 반환하는가  | 높음     |
| 쿼리 성능   | 느린 쿼리가 없는가      | 중간     |
| 트랜잭션    | 동시성, 롤백이 올바른가   | 높음     |

## 마이그레이션 테스트

### 마이그레이션 안전성 검증

```typescript
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';

describe('Database Migrations', () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
    });
  });

  afterAll(() => pool.end());

  test('빈 DB에 모든 마이그레이션이 순서대로 적용된다', async () => {
    const db = drizzle(pool);
    await expect(
      migrate(db, { migrationsFolder: './drizzle' })
    ).resolves.not.toThrow();
  });

  test('마이그레이션이 멱등성을 가진다 (두 번 실행해도 안전)', async () => {
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: './drizzle' });
    await expect(
      migrate(db, { migrationsFolder: './drizzle' })
    ).resolves.not.toThrow();
  });

  test('마이그레이션 후 핵심 테이블이 존재한다', async () => {
    const result = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    const tables = result.rows.map(r => r.table_name);

    expect(tables).toContain('users');
    expect(tables).toContain('orders');
    expect(tables).toContain('products');
  });
});
```

### 마이그레이션 위험 체크리스트

```markdown
PR에 마이그레이션이 포함되어 있으면 반드시 확인:

- [ ] 롤백 마이그레이션(down)이 존재하는가
- [ ] 컬럼 추가 시 NOT NULL에 DEFAULT가 있는가
- [ ] 컬럼 삭제 시 먼저 코드에서 참조를 제거했는가
- [ ] 테이블 이름 변경은 점진적으로 하는가 (new → copy → switch → drop old)
- [ ] 인덱스 생성에 CONCURRENTLY를 사용하는가 (PostgreSQL)
- [ ] 대용량 테이블 변경 시 락 영향을 고려했는가
```

### 위험한 마이그레이션 패턴

```sql
-- ❌ 위험: NOT NULL 컬럼 추가 (기존 데이터 에러)
ALTER TABLE users ADD COLUMN phone VARCHAR(20) NOT NULL;

-- ✅ 안전: DEFAULT 포함 또는 nullable
ALTER TABLE users ADD COLUMN phone VARCHAR(20) DEFAULT '';

-- ❌ 위험: 컬럼 삭제 (코드가 아직 참조 중일 수 있음)
ALTER TABLE users DROP COLUMN legacy_field;

-- ✅ 안전: 2단계 — 먼저 코드에서 제거, 다음 스프린트에서 컬럼 삭제

-- ❌ 위험: 큰 테이블에 인덱스 생성 (테이블 락)
CREATE INDEX idx_users_email ON users(email);

-- ✅ 안전: CONCURRENTLY (락 없이)
CREATE INDEX CONCURRENTLY idx_users_email ON users(email);
```

## 데이터 무결성 테스트

### 제약 조건 테스트

```typescript
describe('데이터 무결성', () => {
  test('이메일 유니크 제약 조건', async () => {
    await db.insert(users).values({
      name: 'Alice', email: 'alice@test.com'
    });

    await expect(
      db.insert(users).values({
        name: 'Bob', email: 'alice@test.com' // 같은 이메일
      })
    ).rejects.toThrow(/unique/i);
  });

  test('외래 키 제약 조건', async () => {
    await expect(
      db.insert(orders).values({
        userId: 'nonexistent-user-id',
        productId: 'product-1',
      })
    ).rejects.toThrow(/foreign key/i);
  });

  test('NOT NULL 제약 조건', async () => {
    await expect(
      db.insert(users).values({
        name: null as any,
        email: 'test@test.com',
      })
    ).rejects.toThrow(/not-null/i);
  });

  test('CHECK 제약 조건', async () => {
    await expect(
      db.insert(products).values({
        name: 'Test', price: -1000, // 음수 가격
      })
    ).rejects.toThrow(/check/i);
  });

  test('CASCADE 삭제 동작', async () => {
    const user = await createTestUser();
    await createTestOrder({ userId: user.id });

    await db.delete(users).where(eq(users.id, user.id));

    // 관련 주문도 삭제되었는가
    const orders = await db.select().from(ordersTable)
      .where(eq(ordersTable.userId, user.id));
    expect(orders).toHaveLength(0);
  });
});
```

## 쿼리 성능 테스트

### EXPLAIN ANALYZE

```typescript
test('사용자 검색 쿼리가 인덱스를 사용한다', async () => {
  // 테스트 데이터 삽입
  await seedManyUsers(10000);

  const result = await pool.query(`
    EXPLAIN ANALYZE
    SELECT * FROM users WHERE email = 'test@test.com'
  `);

  const plan = result.rows.map(r => r['QUERY PLAN']).join('\n');

  // Sequential Scan이 아닌 Index Scan이어야 함
  expect(plan).toMatch(/Index Scan/i);
  expect(plan).not.toMatch(/Seq Scan/i);
});

test('주문 목록 쿼리가 1초 이내에 실행된다', async () => {
  await seedManyOrders(100000);

  const start = performance.now();
  await db.select().from(orders)
    .where(eq(orders.userId, 'user-1'))
    .orderBy(desc(orders.createdAt))
    .limit(20);
  const duration = performance.now() - start;

  expect(duration).toBeLessThan(1000); // 1초 미만
});
```

### 슬로우 쿼리 감지

```typescript
// 테스트 환경에서 슬로우 쿼리 로깅
const slowQueryThreshold = 100; // 100ms

pool.on('query', (query) => {
  if (query.duration > slowQueryThreshold) {
    console.warn(`🐌 Slow query (${query.duration}ms): ${query.text}`);
  }
});
```

## 트랜잭션 테스트

```typescript
describe('트랜잭션', () => {
  test('주문 생성이 원자적으로 처리된다', async () => {
    const user = await createTestUser();
    const product = await createTestProduct({ stock: 1 });

    // 주문 + 재고 차감이 하나의 트랜잭션
    await db.transaction(async (tx) => {
      await tx.insert(orders).values({
        userId: user.id,
        productId: product.id,
        quantity: 1,
      });

      await tx.update(products)
        .set({ stock: sql`stock - 1` })
        .where(eq(products.id, product.id));
    });

    const updatedProduct = await db.select().from(products)
      .where(eq(products.id, product.id));
    expect(updatedProduct[0].stock).toBe(0);
  });

  test('트랜잭션 실패 시 롤백된다', async () => {
    const user = await createTestUser();
    const product = await createTestProduct({ stock: 5 });

    try {
      await db.transaction(async (tx) => {
        await tx.insert(orders).values({
          userId: user.id,
          productId: product.id,
          quantity: 1,
        });

        throw new Error('Simulated failure');
      });
    } catch { /* expected */ }

    // 롤백 확인 — 주문이 생성되지 않았어야 함
    const orderCount = await db.select({ count: sql`count(*)` })
      .from(orders)
      .where(eq(orders.userId, user.id));
    expect(Number(orderCount[0].count)).toBe(0);

    // 재고도 변경되지 않았어야 함
    const currentProduct = await db.select().from(products)
      .where(eq(products.id, product.id));
    expect(currentProduct[0].stock).toBe(5);
  });
});
```

## Soft Delete 테스트

```typescript
test('삭제된 레코드가 기본 쿼리에서 제외된다', async () => {
  const user = await createTestUser();

  // Soft delete
  await db.update(users)
    .set({ deletedAt: new Date() })
    .where(eq(users.id, user.id));

  // 기본 조회에서 제외
  const activeUsers = await db.select().from(users)
    .where(isNull(users.deletedAt));
  expect(activeUsers.find(u => u.id === user.id)).toBeUndefined();

  // 전체 조회에서는 포함 (어드민)
  const allUsers = await db.select().from(users);
  expect(allUsers.find(u => u.id === user.id)).toBeDefined();
});
```

## 데이터베이스 테스트 체크리스트

* [ ] 마이그레이션이 빈 DB에서 처음부터 적용 가능한가
* [ ] 마이그레이션이 멱등적인가 (두 번 실행해도 안전)
* [ ] 롤백 마이그레이션이 존재하는가
* [ ] 유니크/외래 키/NOT NULL 제약 조건이 테스트되는가
* [ ] 핵심 쿼리가 인덱스를 사용하는가 (EXPLAIN)
* [ ] 슬로우 쿼리가 감지되는가
* [ ] 트랜잭션 롤백이 올바르게 동작하는가
* [ ] Soft delete가 기본 쿼리에서 제외되는가
* [ ] CASCADE/SET NULL 동작이 의도대로인가