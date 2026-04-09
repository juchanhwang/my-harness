# TypeScript

> 핵심 메시지: **"any는 TypeScript를 쓰는 이유를 없앤다. unknown에서 시작하라."**

***

## 1. 기본 규칙

명시적 타입 선언의 중요성을 강조합니다. `any` 사용을 피하고, 대신 `unknown`으로 시작하여 타입 가드를 통해 타입을 좁혀가는 패턴을 권장합니다.

```tsx
// ✅ 명시적 반환 타입
function calculateTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}
```

***

## 2. 제네릭 활용

재사용 가능한 컴포넌트 작성을 위해 제네릭을 활용합니다. Select 컴포넌트 예시에서 `getLabel`과 `getValue` 함수로 유연한 데이터 처리를 구현합니다.

```tsx
// ✅ 제네릭 Select 컴포넌트
interface SelectProps<T> {
  options: T[];
  getLabel: (item: T) => string;
  getValue: (item: T) => string;
  onChange: (value: string) => void;
}

function Select<T>({ options, getLabel, getValue, onChange }: SelectProps<T>) {
  return (
    <select onChange={e => onChange(e.target.value)}>
      {options.map(option => (
        <option key={getValue(option)} value={getValue(option)}>
          {getLabel(option)}
        </option>
      ))}
    </select>
  );
}
```

***

## 3. 유틸리티 타입

- **Partial**: 모든 필드를 선택사항으로 변환
- **Pick**: 특정 필드만 선택
- **Omit**: 특정 필드 제외
- **Record**: 키-값 매핑 구조 생성

```tsx
// ✅ 유틸리티 타입 활용
type UserUpdate = Partial<User>;
type UserSummary = Pick<User, 'id' | 'name' | 'email'>;
type UserWithoutPassword = Omit<User, 'password'>;
type StatusMap = Record<Status, string>;
```

***

## 4. 타입 가드

`error is ApiError` 문법으로 타입을 좁혀 안전성을 확보합니다. Discriminated Union을 통해 success/failure 패턴을 구현합니다.

```tsx
// ✅ 타입 가드
function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

// ✅ Discriminated Union
type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function handleResult<T>(result: Result<T>) {
  if (result.success) {
    // result.data 접근 가능 (타입 안전)
    console.log(result.data);
  } else {
    // result.error 접근 가능
    console.error(result.error);
  }
}
```

***

## 5. tsconfig.json 권장 설정

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

***

## ❌ 안티패턴

* **`any` 남발**: `unknown`으로 시작하고 타입 가드로 좁힌다
* **`as` 타입 단언 남용**: 런타임 에러의 원인. 타입 가드 사용
* **`@ts-ignore` 절대 금지**: 타입 에러는 해결해야지 무시하면 안 된다
* **빈 인터페이스 선언**: `interface Props {}` → 의미 없는 타입
* **타입 중복 정의**: Zod 스키마에서 `z.infer<typeof schema>`로 파생

***

> 📎 관련: [code-quality.md](code-quality.md) · [error-handling.md](error-handling.md)
