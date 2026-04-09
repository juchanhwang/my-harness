# PostgreSQL 성능 최적화

## 1. 인덱싱 전략

### B-tree (기본 인덱스)

가장 일반적인 인덱스. `=`, `<`, `>`, `<=`, `>=`, `BETWEEN`, `IN`, `IS NULL` 지원.

```sql
CREATE INDEX idx_users_email ON users (email);

CREATE INDEX idx_orders_user_status ON orders (user_id, status);
```

```typescript
const orders = pgTable('orders', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  userId: integer('user_id').notNull(),
  status: varchar('status', { length: 20 }).notNull(),
}, (table) => [
  index('idx_orders_user_status').on(table.userId, table.status),
]);
```

### GIN (Generalized Inverted Index)

배열, JSONB, full-text search에 최적. 값이 여러 키를 포함하는 경우.

```sql
CREATE INDEX idx_users_metadata ON users USING GIN (metadata);

CREATE INDEX idx_posts_tags ON posts USING GIN (tags);

CREATE INDEX idx_articles_search ON articles USING GIN (to_tsvector('korean', title || ' ' || content));
```

### BRIN (Block Range INdex)

물리적으로 정렬된 데이터에 효과적. 시계열 데이터에 적합. B-tree보다 훨씬 작은 크기.

```sql
CREATE INDEX idx_logs_created_at ON transaction_logs USING BRIN (created_at);
```

**BRIN 적합 조건**:
* 데이터가 물리적으로 정렬 (INSERT 순서 = 정렬 순서)
* 대규모 테이블 (수천만~수억 행)
* 범위 검색 위주

### Partial Index (부분 인덱스)

조건부로 인덱스를 생성. 인덱스 크기 절감 + 쿼리 성능 향상.

```sql
CREATE INDEX idx_users_active_email ON users (email) WHERE is_active = true;

CREATE INDEX idx_orders_pending ON orders (created_at) WHERE status = 'pending';

CREATE INDEX idx_users_not_deleted ON users (email) WHERE deleted_at IS NULL;
```

```typescript
const users = pgTable('users', { ... }, (table) => [
  index('idx_users_active_email')
    .on(table.email)
    .where(sql`${table.isActive} = true`),
]);
```

### 인덱스 선택 가이드

| 상황 | 인덱스 타입 |
|------|----------|
| 등호/범위 검색 | B-tree (기본) |
| JSONB 검색 (`@>`, `?`, `?&`) | GIN |
| Array 검색 (`@>`, `&&`) | GIN |
| Full-text search | GIN + tsvector |
| 시계열 범위 검색 (대규모) | BRIN |
| 특정 조건의 행만 검색 | Partial Index + B-tree |
| 좌표/거리 검색 | GiST (PostGIS) |

## 2. Query Optimization (EXPLAIN ANALYZE)

### EXPLAIN ANALYZE 읽는 법

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM orders WHERE user_id = 123 AND status = 'completed';
```

```
Index Scan using idx_orders_user_status on orders
  Index Cond: ((user_id = 123) AND ((status)::text = 'completed'::text))
  Rows Removed by Filter: 0
  Buffers: shared hit=4
  Planning Time: 0.15 ms
  Execution Time: 0.08 ms
```

### 핵심 지표

* **Seq Scan**: 전체 테이블 스캔 → 인덱스 필요 신호
* **Index Scan**: 인덱스 사용 → 좋음
* **Index Only Scan**: 인덱스만으로 완료 → 최선
* **Bitmap Index Scan**: 여러 인덱스 조합 → 괜찮음
* **Nested Loop**: 소규모 JOIN에 적합
* **Hash Join**: 대규모 JOIN에 적합
* **Rows Removed by Filter**: 높으면 인덱스 개선 필요

### 흔한 성능 문제와 해결

```sql
-- 함수 사용으로 인덱스 무효화 → Expression Index
CREATE INDEX idx_users_email_lower ON users (LOWER(email));

-- OR → IN으로 변환
WHERE status IN ('pending', 'processing')

-- LIKE '%검색%' → pg_trgm
CREATE EXTENSION pg_trgm;
CREATE INDEX idx_users_name_trgm ON users USING GIN (name gin_trgm_ops);
```

### Drizzle ORM에서 쿼리 디버깅

```typescript
const query = db
  .select()
  .from(orders)
  .where(and(eq(orders.userId, 123), eq(orders.status, 'completed')))
  .toSQL();

console.log(query.sql, query.params);
```

## 3. Performance Tuning

### VACUUM & ANALYZE

```sql
-- Dead tuple 제거
VACUUM (VERBOSE) orders;

-- 통계 정보 업데이트
ANALYZE orders;

-- 둘 다
VACUUM ANALYZE orders;
```

**autovacuum 모니터링**:

```sql
SELECT relname, n_dead_tup, n_live_tup, last_vacuum, last_autovacuum
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000
ORDER BY n_dead_tup DESC;
```

### 주요 설정 튜닝

```
# 메모리 (4GB RAM 서버 기준)
shared_buffers = 1GB          # RAM의 25%
effective_cache_size = 3GB     # RAM의 75%
work_mem = 64MB               # 쿼리당 정렬/해시 메모리
maintenance_work_mem = 256MB   # VACUUM, CREATE INDEX 메모리

# WAL
wal_buffers = 64MB
checkpoint_completion_target = 0.9

# 연결
max_connections = 100          # 필요 이상 높이지 않기
```

## 4. Full-text Search

### tsvector & tsquery

```sql
-- Generated column으로 검색 벡터 자동 생성
ALTER TABLE articles ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('korean', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('korean', coalesce(content, '')), 'B')
  ) STORED;

-- GIN 인덱스
CREATE INDEX idx_articles_search ON articles USING GIN (search_vector);

-- 검색 쿼리
SELECT id, title, ts_rank(search_vector, query) AS rank
FROM articles, to_tsquery('korean', '백엔드 & 개발') AS query
WHERE search_vector @@ query
ORDER BY rank DESC
LIMIT 20;
```

```typescript
// Drizzle에서 full-text search
const results = await db.execute(sql`
  SELECT id, title, ts_rank(search_vector, to_tsquery('korean', ${searchTerm})) as rank
  FROM articles
  WHERE search_vector @@ to_tsquery('korean', ${searchTerm})
  ORDER BY rank DESC
  LIMIT ${limit}
`);
```

## 5. JSON/JSONB 활용

### 언제 JSONB를 사용하는가

* **스키마가 유동적인 메타데이터** (사용자 설정, 외부 API 응답)
* **중첩 구조가 자주 변하는 경우**
* **검색이 필요한 경우** GIN 인덱스와 함께

### 언제 JSONB를 사용하지 않는가

* **정형 데이터** — 별도 컬럼이 타입 안전하고 인덱싱 효율적
* **FK 관계가 필요한 경우**
* **집계/정렬이 빈번한 경우**

```typescript
// Drizzle에서 JSONB
const users = pgTable('users', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  email: varchar('email', { length: 320 }).notNull().unique(),
  preferences: jsonb('preferences').$type<UserPreferences>().default({}),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
});

// JSONB 검색
const admins = await db.execute(sql`
  SELECT * FROM users
  WHERE preferences @> '{"theme": "dark"}'::jsonb
`);

// JSONB 업데이트
await db.execute(sql`
  UPDATE users
  SET preferences = jsonb_set(preferences, '{theme}', '"light"')
  WHERE id = ${userId}
`);
```

### JSONB 연산자 정리

| 연산자 | 설명 | 예제 |
|-------|------|------|
| `->` | key로 JSON 값 추출 | `data -> 'name'` |
| `->>` | key로 text 값 추출 | `data ->> 'name'` |
| `@>` | 포함 여부 | `data @> '{"role":"admin"}'` |
| `?` | key 존재 여부 | `data ? 'email'` |
| `jsonb_set` | 값 업데이트 | `jsonb_set(data, '{key}', '"val"')` |

## 6. 핵심 원칙 요약

1. **인덱스는 쿼리 패턴 기반** — 모든 WHERE/JOIN/ORDER BY에 적합한 인덱스
2. **EXPLAIN ANALYZE로 검증** — 추측하지 말고 측정
3. **Partial index 적극 활용** — 필요한 행만 인덱싱
4. **BRIN은 시계열 데이터의 친구** — 로그/이벤트 테이블에 적합
5. **JSONB는 유동적 데이터에만** — 정형 데이터는 별도 컬럼
6. **Full-text search는 LIKE보다 GIN + tsvector** — 성능과 정확도 모두 우수

---

## Related

- [database.md](database.md) — Transaction·Isolation·Connection Pool
- [drizzle-orm.md](drizzle-orm.md) — Drizzle schema·쿼리 빌더
- [performance.md](performance.md) — 쿼리 프로파일링·EXPLAIN ANALYZE
- [data-patterns.md](data-patterns.md) — Event Sourcing·CQRS 구현
