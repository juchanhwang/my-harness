# Type Safety

> 참조: [TypeScript Handbook — Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html) (discriminated unions, type guards, `never` 활용) · [Matt Pocock — Discriminated Unions Are A Dev's Best Friend](https://www.totaltypescript.com/discriminated-unions-are-a-devs-best-friend) · [Zod 공식 문서](https://zod.dev/) · [Egghead — Using Branded Types in TypeScript](https://egghead.io/blog/using-branded-types-in-typescript) · Dan Vanderkam, *Effective TypeScript* (2nd ed., O'Reilly, 2024)
> 핵심 메시지: **"any는 TypeScript를 쓰는 이유를 없앤다. unknown에서 시작하고, 경계에서 검증하라."**

> 📎 이 파일은 **범용 타입 안전 전략**(Discriminated Unions, Branded Types, Exhaustive Check, Template Literal Types, Zod 런타임 검증 등)을 다룬다. React/Next.js 고유 타입 패턴(Props 타입, JSX 타입 경계, Server Component 직렬화, Server Actions `ActionResult<T>`, shadcn 타입 확장 등)은 `fe` 스킬의 `typescript.md`를 참고하라.

## 목차

1. [왜 타입 안전성이 중요한가](#왜-타입-안전성이-중요한가) — 컴파일 타임 vs 런타임
2. [Strict Mode 완전 활용](#strict-mode-완전-활용) — `strict: true`가 켜는 옵션 + 추가 strict 플래그
3. [타입 안전 패턴](#타입-안전-패턴) — Discriminated Unions, Branded Types, Exhaustive Check, Template Literal Types
4. [Zod — 런타임 검증](#zod--런타임-검증) — 스키마, API 응답, 환경 변수, 폼 검증
5. [타입 가드 (Type Guards)](#타입-가드-type-guards) — typeof/instanceof, 커스텀 가드, assertion 함수
6. [안티패턴](#안티패턴) — `any`, `as`, non-null `!` 남용
7. [타입 안전성 체크리스트](#타입-안전성-체크리스트)

***

## 왜 타입 안전성이 중요한가

JavaScript의 `undefined is not a function`은 런타임에 터진다. TypeScript는 이를 **컴파일 타임에** 잡는다. 타입 시스템이 잡아주는 버그는 테스트를 작성할 필요가 없다 — 이것이 테스트 트로피의 Static Analysis 레이어.

## Strict Mode 완전 활용

### strict: true가 켜는 것들

```json
{
  "compilerOptions": {
    "strict": true
    // 아래 모든 옵션을 개별 활성화한 것과 동일:
    // "noImplicitAny": true,
    // "strictNullChecks": true,
    // "strictFunctionTypes": true,
    // "strictBindCallApply": true,
    // "strictPropertyInitialization": true,
    // "noImplicitThis": true,
    // "useUnknownInCatchVariables": true,
    // "alwaysStrict": true
  }
}
```

### 추가 strict 옵션

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,    // 배열[i]가 T | undefined
    "noImplicitOverride": true,           // override 키워드 강제
    "exactOptionalPropertyTypes": true,   // optional ≠ undefined
    "noPropertyAccessFromIndexSignature": true
  }
}
```

## 타입 안전 패턴

### 1. Discriminated Unions (판별 유니온)

```typescript
// ❌ 위험 — 상태에 따라 존재하지 않는 필드 접근 가능
interface ApiResponse {
  status: 'success' | 'error';
  data?: any;
  error?: string;
}

// ✅ 안전 — 각 상태별 타입이 명확
type ApiResponse<T> =
  | { status: 'success'; data: T }
  | { status: 'error'; error: string; code: number }
  | { status: 'loading' };

function handleResponse(res: ApiResponse<User>) {
  switch (res.status) {
    case 'success':
      console.log(res.data.name); // ✅ data가 확실히 존재
      break;
    case 'error':
      console.error(res.error);   // ✅ error가 확실히 존재
      break;
    case 'loading':
      // data도 error도 없음 — 올바름
      break;
  }
}
```

### 2. Branded Types (브랜드 타입)

```typescript
// 같은 string이지만 의미가 다른 ID를 혼동 방지
type UserId = string & { readonly __brand: 'UserId' };
type OrderId = string & { readonly __brand: 'OrderId' };

function createUserId(id: string): UserId {
  return id as UserId;
}

function createOrderId(id: string): OrderId {
  return id as OrderId;
}

function getUser(id: UserId): Promise<User> { /* ... */ }
function getOrder(id: OrderId): Promise<Order> { /* ... */ }

const userId = createUserId('user-123');
const orderId = createOrderId('order-456');

getUser(userId);    // ✅
getUser(orderId);   // ❌ 컴파일 에러! OrderId는 UserId가 아님
```

### 3. Exhaustive Check (완전성 검사)

```typescript
type Status = 'active' | 'inactive' | 'suspended';

function getStatusLabel(status: Status): string {
  switch (status) {
    case 'active': return '활성';
    case 'inactive': return '비활성';
    case 'suspended': return '정지';
    default: {
      // 새 상태가 추가되면 컴파일 에러
      const _exhaustive: never = status;
      throw new Error(`Unknown status: ${_exhaustive}`);
    }
  }
}
```

### 4. Template Literal Types

```typescript
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';
type ApiPath = `/api/${string}`;
type EventName = `on${Capitalize<string>}`;

function request(method: HttpMethod, path: ApiPath): Promise<Response> {
  // ...
}

request('GET', '/api/users');    // ✅
request('GET', '/users');        // ❌ /api/로 시작해야 함
request('PATCH', '/api/users');  // ❌ PATCH는 허용되지 않음
```

## Zod — 런타임 검증

TypeScript는 컴파일 타임에만 존재한다. 외부 데이터(API 응답, 사용자 입력, 환경 변수)는 **런타임에 검증**해야 한다.

### 기본 사용

```typescript
import { z } from 'zod';

// 스키마 정의 (Zod v4+ idiomatic API)
const UserSchema = z.object({
  id: z.uuid(),                              // v3: z.string().uuid() — deprecated
  name: z.string().min(1).max(100),
  email: z.email(),                          // v3: z.string().email() — deprecated
  age: z.number().int().min(0).max(150).optional(),
  role: z.enum(['admin', 'member', 'guest']),
  createdAt: z.iso.datetime(),               // v3: z.string().datetime() — deprecated
});

// 타입 자동 추론
type User = z.infer<typeof UserSchema>;

// 런타임 검증
function processUser(data: unknown): User {
  return UserSchema.parse(data); // 실패 시 ZodError throw
}

// 안전한 파싱 (throw 안 함)
function safeProcessUser(data: unknown) {
  const result = UserSchema.safeParse(data);
  if (!result.success) {
    console.error('Validation errors:', result.error.issues);
    return null;
  }
  return result.data; // 타입이 User로 추론됨
}
```

### API 응답 검증

```typescript
const ApiResponseSchema = z.object({
  data: z.array(UserSchema),
  pagination: z.object({
    page: z.number(),
    pageSize: z.number(),
    total: z.number(),
  }),
});

async function fetchUsers(): Promise<z.infer<typeof ApiResponseSchema>> {
  const response = await fetch('/api/users');
  const json = await response.json();
  return ApiResponseSchema.parse(json); // 응답 형태 검증
}
```

### 환경 변수 검증

```typescript
const EnvSchema = z.object({
  DATABASE_URL: z.url(),                     // v3: z.string().url() — deprecated
  API_KEY: z.string().min(1),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  ENABLE_CACHE: z.coerce.boolean().default(false),
});

// 앱 시작 시 즉시 검증
export const env = EnvSchema.parse(process.env);
// DATABASE_URL이 없으면 앱이 시작되지 않음 — 런타임 에러보다 훨씬 나음
```

### 폼 검증

```typescript
const SignupSchema = z.object({
  email: z.email('유효한 이메일을 입력해주세요'),     // v3: z.string().email() — deprecated
  password: z.string()
    .min(8, '비밀번호는 8자 이상이어야 합니다')
    .regex(/[A-Z]/, '대문자를 포함해야 합니다')
    .regex(/[0-9]/, '숫자를 포함해야 합니다'),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: '비밀번호가 일치하지 않습니다',
  path: ['confirmPassword'],
});
```

## 타입 가드 (Type Guards)

### typeof / instanceof

```typescript
function formatValue(value: string | number | Date): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return value.toLocaleString();
  if (value instanceof Date) return value.toISOString();

  const _never: never = value;
  throw new Error(`Unexpected value: ${_never}`);
}
```

### 커스텀 타입 가드

```typescript
interface Dog { kind: 'dog'; bark(): void; }
interface Cat { kind: 'cat'; meow(): void; }
type Animal = Dog | Cat;

// 타입 가드 함수
function isDog(animal: Animal): animal is Dog {
  return animal.kind === 'dog';
}

function handleAnimal(animal: Animal) {
  if (isDog(animal)) {
    animal.bark(); // ✅ Dog 타입으로 좁혀짐
  } else {
    animal.meow(); // ✅ Cat 타입으로 좁혀짐
  }
}
```

### assertion 함수

```typescript
function assertNonNull<T>(value: T | null | undefined, message?: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message ?? 'Value is null or undefined');
  }
}

function processUser(user: User | null) {
  assertNonNull(user, 'User must exist');
  // 이 시점부터 user는 User 타입으로 좁혀짐
  console.log(user.name);
}
```

## 안티패턴

### ❌ `any`의 남용

```typescript
// any는 TypeScript를 JavaScript로 만든다
function process(data: any) { // 타입 체크 완전 비활성화
  return data.foo.bar.baz;     // 런타임에 터짐
}

// ✅ unknown + 검증
function process(data: unknown) {
  const parsed = UserSchema.parse(data); // 런타임 검증
  return parsed.name;
}
```

### ❌ `as` (Type Assertion) 남용

```typescript
// as는 "나를 믿어"라고 컴파일러에게 거짓말하는 것
const user = response.data as User; // response.data가 User가 아닐 수 있음

// ✅ 런타임 검증
const user = UserSchema.parse(response.data);
```

### ❌ Non-null assertion (!) 남용

```typescript
// !는 "null 아닌 거 확실해"라는 위험한 단언
const element = document.getElementById('app')!; // 없으면?

// ✅ 명시적 체크
const element = document.getElementById('app');
if (!element) throw new Error('App element not found');
```

## 타입 안전성 체크리스트

* [ ] `strict: true`가 tsconfig에 설정되어 있는가
* [ ] `any` 타입이 ESLint에서 금지되어 있는가
* [ ] 외부 데이터(API, 환경변수, 사용자 입력)에 Zod 검증이 있는가
* [ ] `as` 단언 대신 타입 가드/런타입 검증을 사용하는가
* [ ] Discriminated Union으로 상태를 모델링하는가
* [ ] exhaustive check로 모든 케이스를 처리하는가