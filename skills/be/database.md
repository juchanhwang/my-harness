# Database Schema Design Guide

## Table of Contents

1. [1. Schema Design Principles](#1-schema-design-principles)
2. [2. Normalization vs Denormalization](#2-normalization-vs-denormalization)
3. [3. Relationship Patterns](#3-relationship-patterns)
4. [4. Migration Strategy (Drizzle Kit)](#4-migration-strategy-drizzle-kit)
5. [5. Connection Pooling](#5-connection-pooling)
6. [6. Transaction Isolation Levels](#6-transaction-isolation-levels)
7. [7. Schema Design Principles Summary](#7-schema-design-principles-summary)

## 1. Schema Design Principles

### Naming Conventions

* **Tables**: Plural form, snake_case — `users`, `payment_methods`, `transaction_logs`
* **Columns**: snake_case — `created_at`, `user_id`, `is_active`
* **Indexes**: `idx_{table}_{columns}` — `idx_users_email`, `idx_orders_user_id_status`
* **Foreign keys**: `fk_{table}_{ref_table}` — `fk_orders_users`
* **Unique constraints**: `uq_{table}_{columns}` — `uq_users_email`

### Required Column Pattern

Common columns included in all tables:

```typescript
// Drizzle ORM common columns
import { timestamp, integer } from 'drizzle-orm/pg-core';

export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdateFn(() => new Date()),
};

export const softDelete = {
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
};

export const primaryId = {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
};
```

**Identity column > Serial**: PostgreSQL now recommends `GENERATED ALWAYS AS IDENTITY`. Drizzle supports this approach.

## 2. Normalization vs Denormalization

### Normalization First

* **Apply 3NF (Third Normal Form) by default** — ensures data integrity
* **Consider denormalization only after measuring read performance issues**

### When Denormalization Makes Sense

* **Read-heavy scenarios** (95%+ read operations)
* **Measurable JOIN costs** (verified via EXPLAIN ANALYZE)
* **Rarely-changing data** (country codes, category codes, etc.)

```typescript
// Normalized structure
const orders = pgTable('orders', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  userId: integer('user_id').notNull().references(() => users.id),
  status: varchar('status', { length: 20 }).notNull(),
  ...timestamps,
});

// Denormalized: replicate frequently queried user name in orders
// ⚠️ Must measure performance first. Requires synchronization on name changes.
const orders = pgTable('orders', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  userId: integer('user_id').notNull().references(() => users.id),
  userName: varchar('user_name', { length: 100 }).notNull(), // denormalized
  status: varchar('status', { length: 20 }).notNull(),
  ...timestamps,
});
```

## 3. Relationship Patterns

### One-to-Many (1:N)

```typescript
// users (1) → orders (N)
const users = pgTable('users', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  email: varchar('email', { length: 320 }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  ...timestamps,
});

const orders = pgTable('orders', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  totalAmount: integer('total_amount').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  ...timestamps,
}, (table) => [
  index('idx_orders_user_id').on(table.userId),
  index('idx_orders_status').on(table.status),
]);
```

### Many-to-Many (N:M)

Uses a join table. Include additional attributes in the join table if needed.

```typescript
// users ↔ roles (N:M)
const roles = pgTable('roles', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  name: varchar('name', { length: 50 }).notNull().unique(),
  description: text('description'),
});

const userRoles = pgTable('user_roles', {
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  roleId: integer('role_id')
    .notNull()
    .references(() => roles.id, { onDelete: 'cascade' }),
  assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow().notNull(),
  assignedBy: integer('assigned_by').references(() => users.id),
}, (table) => [
  primaryKey({ columns: [table.userId, table.roleId] }),
  index('idx_user_roles_role_id').on(table.roleId),
]);
```

### Self-referencing (Tree Structure)

```typescript
// Category tree
const categories = pgTable('categories', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  name: varchar('name', { length: 100 }).notNull(),
  parentId: integer('parent_id').references((): AnyPgColumn => categories.id),
  depth: integer('depth').notNull().default(0),
  ...timestamps,
}, (table) => [
  index('idx_categories_parent_id').on(table.parentId),
]);
```

## 4. Migration Strategy (Drizzle Kit)

### Development Phase Strategies

**Early development (schema changes frequently)**:

```bash
# Reset DB and create one clean migration
npx drizzle-kit drop   # Delete existing migrations
npx drizzle-kit generate  # Create new base migration
npx drizzle-kit migrate   # Apply
```

**After stabilization (post-production)**:

```bash
# Generate only incremental migrations
npx drizzle-kit generate  # Create migration for changes only
# Review migration SQL
cat drizzle/XXXX_migration_name.sql
# Apply
npx drizzle-kit migrate
```

### Migration Safety Rules

1. **Adding columns is safe** — `ALTER TABLE ADD COLUMN` (must have nullable or default)
2. **Deleting columns is risky** — Remove code references first → delete in next deployment
3. **Type changes are very risky** — Add new column → migrate data → delete old column
4. **Adding indexes uses `CONCURRENTLY`** — Prevents locks on large tables

```sql
-- ⚠️ When adding indexes in production
CREATE INDEX CONCURRENTLY idx_orders_created_at ON orders (created_at);
-- Drizzle Kit doesn't auto-generate CONCURRENTLY; manual SQL may be needed
```

### Project Migration Workflow

```
1. Modify schema.ts
2. npx drizzle-kit generate → generates migration SQL
3. Review generated SQL
4. Include migration file in PR
5. On main merge, CI/CD executes db:migrate
```

⚠️ **Never use `db:push`** — `.env` could point to production database.

## 5. Connection Pooling

### pg Pool Configuration

```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,                    // Max connections
  min: 5,                     // Min maintained connections
  idleTimeoutMillis: 30_000,  // Release idle connections (30s)
  connectionTimeoutMillis: 5_000,  // Connection acquisition timeout
  maxUses: 7500,              // Reuse limit (prevent memory leaks)
});

// Monitor pool events
pool.on('error', (err) => {
  console.error('Unexpected pool error', err);
});

pool.on('connect', () => {
  console.log('New client connected');
});

export const db = drizzle(pool, { schema });
```

### Connection Count Calculation

```
Optimal connections = (cores * 2) + valid disk count
- 4-core server: (4 * 2) + 1 = 9-10
- Multiple instances × max connections ≤ PostgreSQL max_connections
```

### External Connection Pooler (PgBouncer / Neon)

Connection pooler is essential in serverless (Railway, Vercel):

* **Neon**: built-in connection pooling (use pooler endpoint)
* **Supabase**: built-in PgBouncer
* **Self-hosted**: place PgBouncer in front

## 6. Transaction Isolation Levels

### PostgreSQL Default: Read Committed

```typescript
// Drizzle transaction
await db.transaction(async (tx) => {
  const user = await tx.select().from(users).where(eq(users.id, userId));
  await tx.update(accounts)
    .set({ balance: sql`balance - ${amount}` })
    .where(eq(accounts.userId, userId));
  await tx.insert(transactions).values({
    userId,
    amount: -amount,
    type: 'withdrawal',
  });
});
```

### Isolation Levels Comparison

| Level              | Dirty Read | Non-repeatable Read | Phantom Read | Use Case                    |
| ------------------ | ---------- | ------------------- | ------------ | --------------------------- |
| Read Uncommitted   | Possible   | Possible            | Possible     | Rarely used                 |
| **Read Committed** | ❌          | Possible            | Possible     | **Default, suitable for most** |
| Repeatable Read    | ❌          | ❌                   | Possible*    | Quantity checks + decrement |
| Serializable       | ❌          | ❌                   | ❌            | High consistency (high cost) |

*PostgreSQL's Repeatable Read actually prevents Phantom Reads too (SSI).

### Pessimistic Locking Pattern

```typescript
// SELECT ... FOR UPDATE locks the row
await db.transaction(async (tx) => {
  // Other transactions cannot modify this row
  const [account] = await tx
    .select()
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .for('update');

  if (account.balance < amount) {
    throw new InsufficientBalanceError(account.balance, amount);
  }

  await tx.update(accounts)
    .set({ balance: account.balance - amount })
    .where(eq(accounts.id, accountId));
});
```

### Transaction Scope Minimization

```typescript
// ❌ External API call inside transaction — holds locks long
await db.transaction(async (tx) => {
  await tx.update(orders).set({ status: 'processing' });
  await externalPaymentApi.charge(amount); // Slow external call!
  await tx.update(orders).set({ status: 'completed' });
});

// ✅ Move external call outside transaction
const paymentResult = await externalPaymentApi.charge(amount);
await db.transaction(async (tx) => {
  await tx.update(orders).set({
    status: paymentResult.success ? 'completed' : 'failed',
    paymentId: paymentResult.id,
  });
  await tx.insert(transactionLogs).values({ ... });
});
```

## 7. Schema Design Principles Summary

1. **Use identity columns** — Use `GENERATED ALWAYS AS IDENTITY` instead of serial
2. **Timezone-aware timestamps** — Use `timestamp with time zone`
3. **Consider soft deletes** — Never physically delete important data; use `deleted_at`
4. **Index based on query patterns** — Index all WHERE, JOIN, ORDER BY columns
5. **Use FK constraints actively** — Guarantee data integrity at database level
6. **Code review migrations** — Accidental DROP TABLE = disaster
7. **Minimize transaction scope** — Only what's needed; keep external calls outside

---

## Related

- [postgresql.md](postgresql.md) — PostgreSQL-specific features·indexing
- [drizzle-orm.md](drizzle-orm.md) — Drizzle ORM schema·query builder
- [data-patterns.md](data-patterns.md) — Event Sourcing·CQRS patterns
- [performance.md](performance.md) — Query profiling·connection pool sizing
