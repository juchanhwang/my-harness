# Drizzle ORM

## 목차

1. [철학](#1-철학)
2. [Schema 정의 패턴](#2-schema-정의-패턴)
3. [Relation 설계](#3-relation-설계)
4. [Migration Workflow](#4-migration-workflow)
5. [Query Builder vs Raw SQL](#5-query-builder-vs-raw-sql)
6. [핵심 원칙 요약](#6-핵심-원칙-요약)

## 1. 철학

Drizzle ORM is **"SQL을 아는 개발자를 위한 ORM"** with these key characteristics:

* **Type-safe**: TypeScript 타입이 스키마에서 자동 추론
* **SQL-like**: SQL 문법과 1:1 대응되는 API (`select`, `where`, `join`, `groupBy`)
* **Zero abstraction cost**: 생성되는 SQL이 예측 가능
* **Code-first**: TypeScript 스키마가 source of truth
* **No codegen**: Prisma처럼 별도 generate 단계 없음

## 2. Schema 정의 패턴

### 도메인 기반 파일 분리

```
src/db/
  schema/
    user.ts          # users, userProfiles 테이블
    order.ts         # orders, orderItems 테이블
    product.ts       # products, categories 테이블
    index.ts         # 모든 스키마 re-export
  migrations/        # Drizzle Kit 생성 SQL
  index.ts           # DB 인스턴스 (drizzle 초기화)
  seed.ts            # 시드 데이터
```

### 공통 컬럼 재사용

```typescript
// schema/common.ts
import { timestamp, integer } from 'drizzle-orm/pg-core';

export const withId = {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
};

export const withTimestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdateFn(() => new Date()),
};

export const withSoftDelete = {
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
};
```

### 테이블 정의

```typescript
// schema/user.ts
import { pgTable, varchar, text, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { withId, withTimestamps, withSoftDelete } from './common.js';
import { orders } from './order.js';

export const users = pgTable('users', {
  ...withId,
  email: varchar('email', { length: 320 }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  ...withTimestamps,
  ...withSoftDelete,
}, (table) => [
  uniqueIndex('uq_users_email').on(table.email).where(sql`deleted_at IS NULL`),
  index('idx_users_is_active').on(table.isActive),
]);

export const usersRelations = relations(users, ({ many }) => ({
  orders: many(orders),
}));
```

### Enum 타입

```typescript
import { pgEnum } from 'drizzle-orm/pg-core';

export const orderStatusEnum = pgEnum('order_status', [
  'pending',
  'processing',
  'completed',
  'cancelled',
  'refunded',
]);

export const orders = pgTable('orders', {
  ...withId,
  userId: integer('user_id').notNull().references(() => users.id),
  status: orderStatusEnum('status').notNull().default('pending'),
  totalAmount: integer('total_amount').notNull(),
  ...withTimestamps,
});
```

## 3. Relation 설계

Relations는 **쿼리 API를 위한 매핑**이다. DB에 FK를 생성하지 않는다 (`.references()`가 FK 담당).

```typescript
// schema/order.ts
import { relations } from 'drizzle-orm';

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, {
    fields: [orders.userId],
    references: [users.id],
  }),
  items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
}));
```

### 중앙 export

```typescript
// schema/index.ts
export * from './user.js';
export * from './order.js';
export * from './product.js';
// relations도 export 해야 db.query API가 작동한다
```

### DB 인스턴스

```typescript
// db/index.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema/index.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });
```

## 4. Migration Workflow

```bash
# 1. 스키마 변경 후 migration 생성
npx drizzle-kit generate

# 2. 생성된 SQL 확인
cat drizzle/0001_xxx.sql

# 3. 개발 DB에 적용
npx drizzle-kit migrate

# 4. drizzle.config.ts
```

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
```

### CI/CD에서 migration

```json
// package.json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio"
  }
}
```

## 5. Query Builder vs Raw SQL

### Query Builder (대부분의 경우)

```typescript
// SELECT with WHERE
const activeUsers = await db
  .select({
    id: users.id,
    email: users.email,
    name: users.name,
  })
  .from(users)
  .where(and(
    eq(users.isActive, true),
    isNull(users.deletedAt),
  ))
  .orderBy(desc(users.createdAt))
  .limit(20);

// JOIN
const ordersWithUser = await db
  .select({
    orderId: orders.id,
    status: orders.status,
    userName: users.name,
  })
  .from(orders)
  .innerJoin(users, eq(orders.userId, users.id))
  .where(eq(orders.status, 'pending'));

// INSERT returning
const [newUser] = await db
  .insert(users)
  .values({ email, name, passwordHash })
  .returning();

// UPDATE
await db
  .update(users)
  .set({ isActive: false, updatedAt: new Date() })
  .where(eq(users.id, userId));

// DELETE
await db
  .delete(orders)
  .where(and(
    eq(orders.userId, userId),
    eq(orders.status, 'cancelled'),
  ));
```

### Relational Query API (중첩 데이터)

```typescript
// 유저와 주문 목록을 함께 조회
const userWithOrders = await db.query.users.findFirst({
  where: eq(users.id, userId),
  with: {
    orders: {
      where: eq(orders.status, 'completed'),
      orderBy: [desc(orders.createdAt)],
      limit: 10,
      with: {
        items: {
          with: { product: true },
        },
      },
    },
  },
});
```

### Raw SQL (복잡한 쿼리)

```typescript
// 집계, 서브쿼리, 윈도우 함수 등
const topCustomers = await db.execute(sql`
  SELECT
    u.id,
    u.name,
    COUNT(o.id) as order_count,
    SUM(o.total_amount) as total_spent,
    RANK() OVER (ORDER BY SUM(o.total_amount) DESC) as rank
  FROM users u
  JOIN orders o ON u.id = o.user_id
  WHERE o.status = 'completed'
    AND o.created_at >= ${startDate}
  GROUP BY u.id, u.name
  HAVING COUNT(o.id) >= 5
  ORDER BY total_spent DESC
  LIMIT ${limit}
`);
```

### Validation with drizzle-zod

```typescript
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

export const insertUserSchema = createInsertSchema(users, {
  email: (schema) => schema.email('Invalid email'),
  name: (schema) => schema.min(2).max(100),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const selectUserSchema = createSelectSchema(users);

export type InsertUser = z.infer<typeof insertUserSchema>;
export type SelectUser = z.infer<typeof selectUserSchema>;
```

## 6. 핵심 원칙 요약

1. **스키마가 source of truth** — TypeScript 스키마에서 migration, 타입, validation 모두 파생
2. **도메인별 파일 분리** — 단일 schema.ts는 규모가 커지면 유지보수 불가
3. **Relations와 FK는 별개** — `.references()`는 DB FK, `relations()`은 쿼리 매핑
4. **Query builder 우선, raw SQL 보조** — 복잡한 집계/윈도우 함수만 raw SQL
5. **drizzle-zod로 validation 동기화** — 스키마 변경 시 validation도 자동 업데이트
6. **공통 컬럼은 composition** — 상속 대신 spread로 재사용

---

## Related

- [database.md](database.md) — Transaction·Connection Pool
- [postgresql.md](postgresql.md) — PostgreSQL 고유 기능과 Drizzle 매핑
- [data-patterns.md](data-patterns.md) — Drizzle 기반 Event Store
- [testing.md](testing.md) — Drizzle 테스트 세팅
