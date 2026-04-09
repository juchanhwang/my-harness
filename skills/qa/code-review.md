# Code Review

> 참조: [Google Engineering Practices — Code Review Developer Guide](https://google.github.io/eng-practices/review/) · [SmartBear — Best Kept Secrets of Peer Code Review](https://smartbear.com/resources/ebooks/best-kept-secrets-of-peer-code-review/) (Jason Cohen, Cisco 실험 — "200-400 LOC를 넘으면 결함 감지율 급락") · [Microsoft — Code With Engineering Playbook: Code Reviews](https://microsoft.github.io/code-with-engineering-playbook/code-reviews/) · [Conventional Comments](https://conventionalcomments.org/) (리뷰 코멘트 접두사 컨벤션 원전)

> 📎 이 파일은 **QA 관점의 PR 리뷰**(엣지 케이스, 보안 취약점, 검증 완전성, 회귀 위험, 동시성 등)를 다룬다. FE 엔지니어 관점의 리뷰 포인트(컴포넌트 구조 분리, 훅 사용 패턴, React 재렌더링, JSX 가독성, 4대 코드 품질 원칙 등)는 `fe` 스킬의 `code-review.md`와 `code-quality.md`를 참고하라.

## QA 관점의 코드 리뷰

QA 엔지니어의 코드 리뷰는 개발자의 리뷰와 다르다. "이 코드가 잘 작동하는가"를 넘어 "이 코드가 어떻게 실패할 수 있는가"를 본다.

## 보안 리뷰 체크리스트

### 입력 검증

```typescript
// ❌ 위험 — 사용자 입력을 그대로 사용
app.get('/api/users', (req, res) => {
  const query = `SELECT * FROM users WHERE name = '${req.query.name}'`;
  db.query(query);
});

// ✅ 안전 — 파라미터화 쿼리
app.get('/api/users', (req, res) => {
  const query = 'SELECT * FROM users WHERE name = $1';
  db.query(query, [req.query.name]);
});
```

### 인증/인가

```typescript
// ❌ 위험 — 인가 체크 없음
app.delete('/api/posts/:id', async (req, res) => {
  await db.delete(posts).where(eq(posts.id, req.params.id));
  res.json({ success: true });
});

// ✅ 안전 — 소유권 확인
app.delete('/api/posts/:id', authenticate, async (req, res) => {
  const post = await db.select().from(posts).where(eq(posts.id, req.params.id));
  if (post.authorId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  await db.delete(posts).where(eq(posts.id, req.params.id));
  res.json({ success: true });
});
```

### 민감 데이터

```typescript
// ❌ 위험 — 비밀번호가 응답에 포함
return res.json(user);

// ✅ 안전 — 민감 필드 제외
const { password, ...safeUser } = user;
return res.json(safeUser);
```

## 성능 리뷰 체크리스트

### N+1 쿼리 감지

```typescript
// ❌ N+1 문제
const users = await db.select().from(usersTable);
for (const user of users) {
  user.orders = await db.select().from(ordersTable)
    .where(eq(ordersTable.userId, user.id)); // N번 쿼리
}

// ✅ JOIN 또는 배치 쿼리
const users = await db.select().from(usersTable)
  .leftJoin(ordersTable, eq(usersTable.id, ordersTable.userId));
```

### React 렌더링 최적화

```typescript
// ❌ 매 렌더 시 새 객체/함수 생성
function UserList({ users }) {
  return users.map(user => (
    <UserCard
      key={user.id}
      user={user}
      style={{ marginBottom: 16 }}          // 매번 새 객체
      onSelect={() => selectUser(user.id)}  // 매번 새 함수
    />
  ));
}

// ✅ 메모이제이션
const cardStyle = { marginBottom: 16 };

function UserList({ users }) {
  const handleSelect = useCallback((id: string) => selectUser(id), []);
  return users.map(user => (
    <UserCard
      key={user.id}
      user={user}
      style={cardStyle}
      onSelect={handleSelect}
    />
  ));
}
```

### 대용량 데이터

```typescript
// ❌ 모든 데이터를 메모리에 로드
const allUsers = await db.select().from(users); // 100만 건?

// ✅ 페이지네이션
const pageUsers = await db.select().from(users)
  .limit(20)
  .offset((page - 1) * 20);
```

## 가독성 리뷰

### 네이밍

```typescript
// ❌ 모호한 이름
const d = new Date();
const list = getItems();
function process(data) { ... }
const flag = check(input);

// ✅ 의도가 명확한 이름
const createdAt = new Date();
const activeProducts = getActiveProducts();
function validateAndSaveOrder(orderInput) { ... }
const isEligibleForDiscount = checkDiscountEligibility(customer);
```

### 조건문 가독성

```typescript
// ❌ 중첩 조건문 (깊이 5+)
if (user) {
  if (user.isActive) {
    if (user.hasPermission('write')) {
      if (order.status === 'pending') {
        if (order.total > 0) {
          processOrder(order);
        }
      }
    }
  }
}

// ✅ Guard clause (Early return)
if (!user) return;
if (!user.isActive) return;
if (!user.hasPermission('write')) throw new ForbiddenError();
if (order.status !== 'pending') throw new InvalidStateError();
if (order.total <= 0) throw new ValidationError('Order total must be positive');

processOrder(order);
```

### 매직 넘버

```typescript
// ❌ 매직 넘버
if (password.length < 8) { ... }
if (retryCount > 3) { ... }
setTimeout(callback, 86400000);

// ✅ 명명된 상수
const MIN_PASSWORD_LENGTH = 8;
const MAX_RETRY_COUNT = 3;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

if (password.length < MIN_PASSWORD_LENGTH) { ... }
if (retryCount > MAX_RETRY_COUNT) { ... }
setTimeout(callback, ONE_DAY_MS);
```

## 엣지 케이스 리뷰

PR을 볼 때 반드시 확인하는 것들:

### null/undefined 처리

```typescript
// 이 코드가 null을 받으면?
function getFullName(user: User) {
  return `${user.firstName} ${user.lastName}`;
  // user가 null이면? firstName이 undefined이면?
}

// 안전한 버전
function getFullName(user: User | null): string {
  if (!user) return '';
  return [user.firstName, user.lastName].filter(Boolean).join(' ');
}
```

### 빈 배열/컬렉션

```typescript
// items가 빈 배열이면?
const average = items.reduce((sum, i) => sum + i.price, 0) / items.length;
// → NaN (0 / 0)

// 안전한 버전
const average = items.length > 0
  ? items.reduce((sum, i) => sum + i.price, 0) / items.length
  : 0;
```

### 동시성

```typescript
// 두 사용자가 동시에 같은 상품의 마지막 1개를 구매하면?
async function purchaseItem(itemId: string) {
  const item = await db.findById(itemId);
  if (item.stock > 0) {       // 둘 다 stock=1을 읽음
    item.stock -= 1;            // 둘 다 0으로 설정
    await db.save(item);        // 결과: stock = 0 (1개 판매), but 2명에게 판매됨
  }
}

// 안전한 버전: Optimistic Locking 또는 DB 레벨 체크
await db.update(items)
  .set({ stock: sql`stock - 1` })
  .where(and(eq(items.id, itemId), gt(items.stock, 0)));
```

## 리뷰 에티켓

### 건설적 피드백

```markdown
// ❌ 나쁜 리뷰 코멘트
"이건 틀렸어."
"왜 이렇게 했어?"
"이거 별로임."

// ✅ 좋은 리뷰 코멘트
"여기서 `items`가 빈 배열일 때 NaN이 반환될 수 있을 것 같아요.
 `items.length > 0` 체크를 추가하면 어떨까요?"

"이 API 호출에서 타임아웃 처리가 없는데, 네트워크 장애 시
 무한 대기 가능성이 있어요. AbortController로 타임아웃을
 걸면 좋을 것 같습니다."

"nit: 이 변수명을 `data` 대신 `userProfile`로 바꾸면
 의도가 더 명확할 것 같아요."
```

### 코멘트 접두사 컨벤션

| 접두사           | 의미        | 블로킹? |
| ------------- | --------- | ---- |
| `blocker:`    | 반드시 수정 필요 | ✅    |
| `suggestion:` | 개선 제안     | ❌    |
| `question:`   | 의도 질문     | ❌    |
| `nit:`        | 사소한 스타일   | ❌    |
| `praise:`     | 잘한 점 칭찬   | ❌    |

### 리뷰 원칙

1. **코드를 비판하되 사람을 비판하지 않는다**
2. **문제만 지적하지 말고 대안을 제시한다**
3. **좋은 코드도 인정한다** (praise)
4. **"왜?"를 물어보는 것은 공격이 아니다** — 맥락을 이해하려는 것
5. **자동화할 수 있는 건 자동화한다** — 스타일은 Prettier에, 린트는 ESLint에

## 코드 리뷰 프로세스

### PR 리뷰 순서

1. **PR 설명 읽기** — 변경 의도와 범위 파악
2. **전체 diff 훑기** — 큰 그림 파악
3. **핵심 로직 상세 리뷰** — 비즈니스 로직, 보안, 성능
4. **테스트 코드 리뷰** — 적절한 커버리지, 엣지 케이스
5. **사소한 항목** — 네이밍, 스타일 (마지막에)

### 리뷰 시간 가이드라인

* 한 번에 400줄 이하를 리뷰
* 60분 이상 연속 리뷰하지 않음
* 큰 PR은 커밋 단위로 리뷰 요청