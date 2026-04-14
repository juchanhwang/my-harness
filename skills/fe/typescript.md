# TypeScript

> 핵심 메시지: **"프로젝트의 `package.json` TypeScript 버전을 확인하고, 해당 버전에서 사용 가능한 기능만 사용하라."**

## 목차

1. [타입 선언 컨벤션](#1-타입-선언-컨벤션) — type vs interface, enum 금지
2. [타입 안전성 도구](#2-타입-안전성-도구) — satisfies, as const, as 단언
3. [금지 패턴](#3-금지-패턴)
4. [스택별 타입 패턴](#4-스택별-타입-패턴) — Zod, TanStack Query, Zustand
5. [readonly](#5-readonly)
6. [tsconfig 권장 설정](#6-tsconfig-권장-설정)

***

## 1. 타입 선언 컨벤션

### type을 기본값으로, interface는 상속이 필요할 때

**`type`을 기본으로 사용하고, 객체 상속 구조가 필요할 때만 `interface extends`를 쓴다.**

`type`이 기본인 이유: `interface`는 declaration merging(같은 이름의 interface를 여러 번 선언하면 자동 합쳐짐) 특성이 있어, 의도치 않은 타입 확장이 발생할 수 있다. `type`은 이 문제가 없고, union·intersection·조건부 타입·Zod 추론 등 모든 타입 표현이 가능하다.

단, 객체를 상속할 때 `interface extends`는 교차 타입(`&`)보다 에러 메시지가 명확하고 컴파일 성능이 우수하다. 호환 불가 속성이 있으면 `&`는 조용히 `never`로 해소되지만, `extends`는 정의 시점에 에러를 발생시킨다.

```tsx
// ✅ type — 기본 선택
type User = {
  id: string;
  name: string;
  email: string;
};

type Status = 'active' | 'inactive' | 'pending';
type UserSummary = Pick<User, 'id' | 'name'>;
type LoginFormData = z.infer<typeof loginSchema>;

// ✅ interface extends — 객체 상속 구조가 필요할 때
interface BaseEntity {
  id: string;
  createdAt: Date;
}

interface User extends BaseEntity {
  name: string;
  email: string;
}

// ✅ interface — 라이브러리 타입 확장 (declaration merging 활용)
declare module '@tanstack/react-query' {
  interface Register {
    defaultError: ApiError;
  }
}
```

**판단 기준:**

| 상황 | 선택 | 이유 |
|---|---|---|
| 일반 객체 타입 | `type` | 유연하고 declaration merging 없음 |
| union / intersection / 조건부 | `type` | `type`만 표현 가능 |
| Zod 스키마 파생 | `type` | `z.infer<>` 결과는 type alias |
| 유틸리티 타입 별칭 | `type` | `Pick`, `Omit` 등 조합 |
| 객체 상속 구조 | `interface extends` | `&`보다 에러 메시지 명확, 컴파일 성능 우위 |
| 라이브러리 타입 확장 | `interface` | declaration merging 필요 |

> 📎 출처: Matt Pocock, *Total TypeScript Book*, Chapter 6 — "I tend to default to `type` unless I need to use `interface extends`"

### enum 금지 → union type

**`enum`을 사용하지 않는다.** 대신 string literal union 또는 `as const` 객체로 대체한다.

enum은 TypeScript 전용 런타임 기능으로 JS 생태계와 괴리가 있다. 수치형 enum은 reverse mapping을 생성하여 `Object.keys()` 결과가 예측 불가하고, 수치형·문자열 enum 간 동작도 불일치한다(수치형은 structural, 문자열은 nominal).

```tsx
// ❌ enum 사용 금지
enum Status {
  Active = 'ACTIVE',
  Inactive = 'INACTIVE',
}

// ✅ 패턴 A: 단순 union (런타임 값이 불필요할 때)
type Status = 'ACTIVE' | 'INACTIVE';

// ✅ 패턴 B: as const 배열 (런타임 순회가 필요할 때 — 드롭다운 옵션, 유효성 검사 등)
const STATUSES = ['RECRUITING', 'IN_PROGRESS', 'COMPLETED'] as const;
type Status = (typeof STATUSES)[number];

// ✅ 패턴 C: as const 객체 + keyof (레이블 매핑이 필요할 때)
const UserRole = {
  USER: 'USER',
  ADMIN: 'ADMIN',
  STAFF: 'STAFF',
} as const;
type UserRole = (typeof UserRole)[keyof typeof UserRole];
```

**선택 기준:** 타입만 필요하면 A, 런타임 배열 순회가 필요하면 B, 키-값 매핑이 필요하면 C.

> 📎 출처: Matt Pocock, *Total TypeScript Book*, Chapter 9 — "If I were starting a project today, I would use `as const` instead of enums."

***

## 2. 타입 안전성 도구

### satisfies

**타입 제약을 검증하면서 추론된 구체 타입을 유지해야 할 때 사용한다.**

타입 어노테이션(`: Type`)은 변수의 타입을 넓히고 값의 구체적 타입을 잊는다. `satisfies`는 제약을 검증하면서도 값의 구체 타입을 보존한다. 이 차이가 중요한 이유: 어노테이션은 오타나 잘못된 키를 잡아내지 못하지만(`Record<string, string>`은 어떤 키든 허용), `satisfies`는 제약 위반 시 컴파일 에러를 발생시키면서도 존재하는 키의 자동완성을 유지한다.

```tsx
// ❌ 타입 어노테이션 — 구체적 키 정보 손실
const routes: Record<string, string> = {
  home: '/',
  about: '/about',
};
routes.typo;  // 에러 없음 (어떤 string 키든 허용)

// ✅ satisfies — 제약 검증 + 구체 타입 유지
const routes = {
  home: '/',
  about: '/about',
} satisfies Record<string, string>;
routes.home;  // "/" (리터럴 타입 유지)
routes.typo;  // ❌ 컴파일 에러

// ✅ as const satisfies 결합 — 불변 리터럴 + 제약 검증
const FIELD_TYPES = ['TEXT', 'SELECT', 'CHECKBOX'] as const satisfies readonly string[];
```

> 📎 출처: Matt Pocock, *Total TypeScript Book*, Chapter 11 — satisfies = "best of both worlds"

### as const

**변경 불가능한 리터럴 값에 적극 사용한다.** deep readonly + 리터럴 타입 추론을 동시에 확보하며, 런타임 비용이 없다(`Object.freeze`와 달리 타입 레벨에서만 동작).

```tsx
// ✅ 상수 배열에서 union type 추출 (enum 대체)
const STATUSES = ['ACTIVE', 'INACTIVE', 'PENDING'] as const;
type Status = (typeof STATUSES)[number]; // 'ACTIVE' | 'INACTIVE' | 'PENDING'

// ✅ Query Key Factory — 리터럴 튜플 유지
const queryKeys = {
  users: {
    all: ['users'] as const,
    detail: (id: string) => ['users', 'detail', id] as const,
  },
} as const;

// ✅ 함수 튜플 반환
function useSomething() {
  return [value, setValue] as const;
  // [Value, SetValue] 튜플로 추론 (없으면 (Value | SetValue)[] 배열)
}
```

> 📎 출처: Matt Pocock, *Total TypeScript Book*, Chapter 7 & 10

### as 타입 단언 — 사용 최소화

**`as` 단언은 컴파일러의 타입 검사를 우회한다.** 런타임과 컴파일타임의 불일치를 초래할 수 있으므로 최소화하고, 사용 시 이유를 코드 근처에 남긴다.

```tsx
// ❌ 타입 가드 없이 단언
const user = data as User;

// ✅ 타입 가드로 좁히기
function isUser(data: unknown): data is User {
  return typeof data === 'object' && data !== null && 'id' in data;
}

// ✅ 허용되는 케이스 (이유를 남긴다)
const input = document.querySelector('input') as HTMLInputElement; // DOM API 반환 타입 좁히기
const fakeRepo = { findById: vi.fn() } as unknown as UserRepository; // 테스트 mock 부분 구현
```

**허용 기준:**
- DOM API 반환 타입 좁히기 — 허용
- 테스트 mock/fake 객체 — 허용 (부분 구현이 불가피)
- 비테스트 소스 비즈니스 로직 — 타입 가드로 대체할 수 없는지 먼저 검토
- `as any` — **금지**. `as unknown as T` 이중 단언도 테스트에서만 허용

***

## 3. 금지 패턴

| 패턴 | 왜 금지하는가 | 대안 |
|---|---|---|
| `any` | 타입 체크가 전파적으로 꺼진다. `any`를 받은 변수를 다른 함수에 넘기면 거기서도 타입 검사가 무력화된다 | `unknown` + 타입 가드 |
| `@ts-ignore` / `@ts-expect-error` | 타입 에러를 숨기면 런타임 버그로 이어진다 | 타입을 수정하거나 타입 가드로 좁히기 |
| `as any` | `any`와 동일한 문제 + 단언의 위험까지 합산 | `unknown` + 타입 가드, 또는 정확한 타입 단언 |
| `enum` | JS 런타임에 없는 TS 전용 기능, 수치형·문자열 동작 불일치 | union type 또는 `as const` 객체 |
| 타입 중복 정의 | Zod 스키마와 별도 interface를 따로 관리하면 불일치 발생 | `z.infer<typeof schema>`로 파생 |
| `catch (e) {}` | 에러 정보 손실 | `catch (error: unknown)` + 로깅 |

***

## 4. 스택별 타입 패턴

### Zod — Schema-First 타입 파생

**스키마를 Single Source of Truth로 삼고, 타입은 `z.infer`로 파생한다.** 별도 타입을 만들어 이중 관리하지 않는다. 스키마와 타입이 분리되면 필드 추가/변경 시 한쪽만 수정하고 다른 쪽을 놓치는 불일치가 발생한다.

```tsx
// ✅ 스키마에서 타입 파생
const userSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(['USER', 'ADMIN']),
});

export type UserFormData = z.infer<typeof userSchema>;

// ❌ 별도 타입 작성 — 스키마와 불일치 위험
type UserFormData = {
  email: string;
  name: string;
  role: 'USER' | 'ADMIN';
};
```

**`z.infer` vs `z.input`:** `.transform()`이 있는 스키마에서 **입력** 타입이 필요하면 `z.input`을 사용한다. `z.infer`는 변환 후 **출력** 타입을 반환하므로, 폼 입력 필드의 타입과 불일치할 수 있다.

```tsx
const schema = z.object({
  amount: z.string().transform(Number),
});

type Input = z.input<typeof schema>;  // { amount: string } — 폼 필드에 바인딩
type Output = z.infer<typeof schema>; // { amount: number } — API 전송
```

### TanStack Query — queryOptions + 타입 추론

**제네릭을 수동 지정하지 않는다.** `queryFn`의 반환 타입에서 자동 추론에 의존한다. 수동 제네릭은 `queryFn` 실제 반환 타입과 불일치할 위험이 있고, 유지보수 부담을 만든다.

```tsx
// ❌ 제네릭 수동 지정 — 유지보수 부담, queryFn과 불일치 위험
useQuery<User[], Error>({
  queryKey: ['users'],
  queryFn: fetchUsers,
});
```

**`queryOptions()` 헬퍼로 queryKey + queryFn을 co-locate한다.** queryKey와 queryFn이 항상 함께 다니므로 타입이 자동으로 흐르고, `prefetchQuery`, `getQueryData` 등에서도 타입이 유지된다.

```tsx
import { queryOptions } from '@tanstack/react-query';

// ✅ queryOptions로 queryKey + queryFn co-location
function usersOptions(params?: UserSearchParams) {
  return queryOptions({
    queryKey: ['users', params] as const,
    queryFn: () => usersApi.getAll(params),
    staleTime: 5 * 1000,
  });
}

// 사용: 어디서든 타입 완전 추론
useQuery(usersOptions());
useSuspenseQuery(usersOptions({ role: 'ADMIN' }));
queryClient.prefetchQuery(usersOptions());
queryClient.getQueryData(usersOptions().queryKey); // User[] | undefined 자동 추론
```

**추론 체인의 시작점인 API 함수에서 반환 타입을 확정하라.** HTTP 클라이언트(axios, fetch)는 기본적으로 `any`를 반환한다. 여기서 타입이 끊기면 `useQuery`까지 전파되지 않는다.

```tsx
// ✅ API 함수에서 타입 확정 → queryOptions → useQuery까지 자동 추론
const usersApi = {
  getAll: (params?: UserSearchParams) => apiClient.get<User[]>('/users', { params }),
  getById: (id: string) => apiClient.get<User>(`/users/${id}`),
};
```

**글로벌 에러 타입 등록:** 매번 `Error` 타입을 지정하는 대신 `Register` interface로 한 번에 등록한다.

```tsx
// lib/query-client.ts
declare module '@tanstack/react-query' {
  interface Register {
    defaultError: ApiError; // 모든 useQuery/useMutation의 error 타입이 ApiError로 추론
  }
}
```

**조건부 쿼리:** `enabled: false` 대신 `skipToken`을 사용하면 `data`의 타입에서 `undefined`를 올바르게 반영한다.

```tsx
import { skipToken } from '@tanstack/react-query';

useQuery({
  queryKey: ['user', userId],
  queryFn: userId ? () => usersApi.getById(userId) : skipToken,
});
```

> 📎 출처: TanStack Query 공식 TypeScript 문서, queryOptions 가이드

### Zustand — 명시적 타입 + curried create

**`create<T>()(fn)` curried 형태로 스토어 타입을 명시한다.** Zustand의 `create` 함수는 미들웨어 파이프라인의 타입 추론을 위해 curried 호출이 필요하다. 타입을 생략하면 `set`/`get`의 타입이 불완전해질 수 있다.

```tsx
// ✅ 명시적 타입 + curried create
type BearState = {
  bears: number;
  increase: (by: number) => void;
  reset: () => void;
};

const useBearStore = create<BearState>()((set) => ({
  bears: 0,
  increase: (by) => set((state) => ({ bears: state.bears + by })),
  reset: () => set({ bears: 0 }),
}));
```

미들웨어 조합 시 `devtools`는 항상 가장 바깥(마지막)에 위치한다. 역순이면 타입이 손실된다.

```tsx
// ✅ 미들웨어 순서: immer → persist → devtools (안에서 밖으로)
const useStore = create<State>()(
  devtools(
    persist(
      immer((set) => ({ /* ... */ })),
      { name: 'store' },
    ),
  ),
);
```

> 📎 출처: Zustand 공식 Advanced TypeScript 가이드

***

## 5. readonly

**유틸 함수의 배열·객체 파라미터에는 `readonly`를 적극 사용한다.** 함수가 입력을 변경하지 않겠다는 의도를 타입으로 표현하면, 호출자가 `as const`로 만든 불변 배열도 안전하게 전달할 수 있다.

```tsx
// ✅ 유틸 함수 파라미터 — readonly로 입력 보호
function getFirst<T>(items: readonly T[]): T | undefined {
  return items[0];
}

function sumPrices(items: readonly { price: number }[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}

// ✅ 설정/상수 객체 타입
type AppConfig = Readonly<{
  apiUrl: string;
  timeout: number;
}>;
```

**React 컴포넌트에서는 불필요하다.** React의 props는 이미 frozen 상태이고, `useState`의 불변성은 React가 관리한다. `Readonly<Props>`를 붙이는 것은 중복이다.

**`readonly`와 `as const`의 관계:** `as const`를 쓰면 자동으로 deep readonly가 적용된다. `as const` 배열을 받는 함수가 `readonly` 파라미터가 아니면 타입 에러가 발생하므로, 유틸 함수 파라미터에 `readonly`를 붙이는 것이 `as const`와의 호환성을 높인다.

**주의:** `readonly`는 "바이럴"하다. 한 함수가 `readonly` 배열을 받으면 그 배열을 전달받는 하위 함수도 `readonly`여야 한다. 도입 범위를 의식적으로 결정하라.

> 📎 출처: Matt Pocock, *Total TypeScript Book*, Chapter 7

***

## 6. tsconfig 권장 설정

프로젝트의 `tsconfig.base.json` 또는 공유 tsconfig 패키지를 따른다. 아래는 React/Next.js 프로젝트에서 권장하는 핵심 설정과 근거다.

```jsonc
{
  "compilerOptions": {
    "strict": true,                    // 모든 strict 플래그 활성화
    "noUncheckedIndexedAccess": true,  // obj[key]가 T | undefined로 추론
    "noImplicitReturns": true,         // 모든 코드 경로에서 반환값 강제
    "noFallthroughCasesInSwitch": true,// switch fall-through 방지
    "isolatedModules": true,           // 번들러 호환 (SWC, esbuild)
    "moduleResolution": "bundler",     // Next.js/Vite 표준
    "skipLibCheck": true               // node_modules .d.ts 검사 생략 (빌드 속도)
  }
}
```

***

> 📎 관련: [code-quality.md](code-quality.md) · [error-handling.md](error-handling.md)
