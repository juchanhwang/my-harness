# Database Testing

> 참조: [PostgreSQL — EXPLAIN](https://www.postgresql.org/docs/current/sql-explain.html) · [CREATE INDEX](https://www.postgresql.org/docs/current/sql-createindex.html) · [에러 코드](https://www.postgresql.org/docs/current/errcodes-appendix.html) · [drizzle-orm `migrate()`](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/pg-core/dialect.ts)

구현 규칙은 `~/.claude/skills/be/database.md`(Migration Strategy, Transaction Isolation Levels), `~/.claude/skills/be/deployment.md`(Backward Compatible Schema Migration, Rollback 전략), `~/.claude/skills/be/nestjs/testing.md`(트랜잭션 롤백 통합 테스트), `~/.claude/skills/be/performance.md`(쿼리 최적화)를 따른다. 이 파일은 QA의 확인 항목만 둔다.

중요도 순서: 마이그레이션(**최고**) > 데이터 무결성 · 쿼리 정확성 · 트랜잭션(높음) > 쿼리 성능(중간)

## 마이그레이션

PR에 마이그레이션이 있으면 반드시 확인한다.

**되돌리기**

- [ ] 롤백(down)이 있고 적용 → 롤백 → 재적용이 된다. Drizzle는 down을 자동 생성하지 않으므로 수동 작성 여부를 본다.

**데이터 보존**

- [ ] 빈 DB뿐 아니라 **기존 데이터가 든 DB**에 적용해 행 수·값이 보존된다. 빈 DB는 NOT NULL 추가·타입 변경의 실패를 드러내지 못한다.
- [ ] NOT NULL 컬럼 추가에는 DEFAULT가 있거나, 값을 채운 뒤 제약을 거는 단계 분리가 있다.
- [ ] 컬럼 삭제는 코드 참조를 먼저 제거하고 다음 배포에서 한다. 이름 변경은 새 컬럼 추가 → 복사 → 전환 → 이전 것 삭제 순서다.

**잠금·다운타임**

- [ ] 대용량 테이블 변경이 장시간 쓰기 잠금을 잡지 않는다. 인덱스는 `CREATE INDEX CONCURRENTLY`다.
- [ ] 새 코드와 이전 코드가 함께 떠 있는 배포 중에도 스키마가 양쪽에서 동작한다.
- 함정: `CONCURRENTLY`는 트랜잭션 블록 안에서 실행할 수 없는데 Drizzle `migrate()`는 보류 중인 마이그레이션을 한 트랜잭션으로 실행한다. 마이그레이션 파일에 넣으면 실패하므로 트랜잭션 밖에서 실행하는 별도 절차를 확인한다. 실패한 `CONCURRENTLY`는 `INVALID` 인덱스를 남기므로 삭제 후 다시 만든다.

**적용**

- [ ] 빈 DB에 전체가 순서대로 적용된다.
- [ ] 재실행에 오류가 없다. 다만 Drizzle는 `__drizzle_migrations` 이력으로 적용된 것을 건너뛰므로 SQL 자체의 멱등성은 증명하지 못한다.

## 데이터 무결성

- [ ] UNIQUE·FK·NOT NULL·CHECK(예: 음수 가격)마다 위반이 거부되는 테스트가 있다.
- [ ] 거부는 메시지 문자열이 아니라 PostgreSQL 에러 코드로 단정한다: unique `23505`, FK `23503`, NOT NULL `23502`, CHECK `23514`. 메시지는 드라이버·ORM 버전에 따라 바뀐다. Drizzle는 원본 에러를 `cause`에 담아 던지므로(`DrizzleQueryError`) 코드는 `err.cause.code` 또는 `err.code`에 있다.
- [ ] `ON DELETE`(CASCADE/SET NULL/RESTRICT)가 의도대로다. 부모를 지운 뒤 자식 행을 조회해 확인한다.
- [ ] Soft delete된 행이 기본 조회에서 제외되고 전체 조회(어드민)에는 포함된다.

## 트랜잭션

- [ ] 원자성·롤백: 중간에 실패하면 부분 쓰기가 남지 않는다. 주문 INSERT 뒤 예외를 던지면 주문 0건이고 재고도 그대로여야 한다.
- [ ] 동시성: 같은 행에 동시 요청(재고 차감, 이중 결제)을 보내도 음수 재고·중복 처리가 없다. 구현 규칙은 `~/.claude/skills/be/concurrency.md`(Race Condition, Optimistic vs Pessimistic Locking)를 따른다.

## 쿼리 성능

- [ ] 핵심 쿼리가 인덱스를 쓴다. `EXPLAIN`에 Seq Scan이 없고 Index Scan·Index Only Scan·Bitmap Index Scan이 보인다.
  - 데이터가 적으면 플래너가 Seq Scan을 고르는 것이 정상이다. 운영 규모에 가까운 데이터(예: 1만 행)로 확인한다.
  - `EXPLAIN ANALYZE`는 문장을 실제로 실행한다. INSERT·UPDATE·DELETE는 `BEGIN; EXPLAIN ANALYZE …; ROLLBACK;`로 감싼다.
- [ ] 슬로우 쿼리가 감지된다. 테스트·스테이징 DB에 `log_min_duration_statement`(예: 100ms)를 걸거나 `pg_stat_statements` 상위 쿼리를 본다.
- [ ] 목록 쿼리 같은 핵심 쿼리가 기준 시간 안에 끝난다(예: 10만 건 주문에서 1초 이내). 시간 단정은 환경에 따라 흔들리므로 실행 계획을 우선한다.
