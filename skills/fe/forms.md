# Forms

> 핵심 메시지: **"React Hook Form + Zod. 이 조합이면 어떤 폼이든 커버 가능하다."**

***

## 1. 기본 구조

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  email: z.string().email('올바른 이메일을 입력하세요'),
  password: z.string().min(8, '비밀번호는 8자 이상이어야 합니다'),
  name: z.string().min(2, '이름은 2자 이상이어야 합니다'),
});

type FormData = z.infer<typeof schema>;

function SignupForm() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    await signupAPI(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Input {...register('email')} error={errors.email?.message} />
      <Input {...register('password')} type="password" error={errors.password?.message} />
      <Input {...register('name')} error={errors.name?.message} />
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? '처리 중...' : '가입'}
      </Button>
    </form>
  );
}
```

***

## 2. 유효성 검증 전략

| 시점        | 방법                 | 용도                |
| --------- | ------------------ | ----------------- |
| 입력 중      | `mode: 'onChange'` | 비밀번호 강도, 실시간 피드백  |
| 포커스 벗어날 때 | `mode: 'onBlur'`   | 이메일, 전화번호 (기본 추천) |
| 제출 시      | `mode: 'onSubmit'` | 대부분의 폼            |

```tsx
const form = useForm<FormData>({
  resolver: zodResolver(schema),
  mode: 'onBlur',          // 포커스 벗어날 때 검증
  reValidateMode: 'onChange', // 에러 후에는 실시간 검증
});
```

***

## 3. 복잡한 폼 패턴

### 다단계 폼 (Wizard)

```tsx
function MultiStepForm() {
  const [step, setStep] = useState(1);
  const form = useForm<FullFormData>({
    resolver: zodResolver(fullSchema),
  });

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      {step === 1 && <PersonalInfoStep form={form} />}
      {step === 2 && <AddressStep form={form} />}
      {step === 3 && <ConfirmStep form={form} />}

      <div>
        {step > 1 && <Button onClick={() => setStep(s => s - 1)}>이전</Button>}
        {step < 3 && <Button onClick={() => setStep(s => s + 1)}>다음</Button>}
        {step === 3 && <Button type="submit">제출</Button>}
      </div>
    </form>
  );
}
```

### 동적 필드 (useFieldArray)

```tsx
const { fields, append, remove } = useFieldArray({
  control: form.control,
  name: 'items',
});

return fields.map((field, index) => (
  <div key={field.id}>
    <Input {...form.register(`items.${index}.name`)} />
    <Button onClick={() => remove(index)}>삭제</Button>
  </div>
));
```

***

## 4. shadcn/ui Form 통합

```tsx
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

<Form {...form}>
  <form onSubmit={form.handleSubmit(onSubmit)}>
    <FormField
      control={form.control}
      name="email"
      render={({ field }) => (
        <FormItem>
          <FormLabel>이메일</FormLabel>
          <FormControl>
            <Input placeholder="email@example.com" {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  </form>
</Form>
```

***

## 5. 서버 액션 연동

> Next.js Server Actions 기본 동작/디렉티브/revalidate 규칙은 `vercel:nextjs` 스킬이 자동 주입한다. 이 절은 **FE 팀 컨벤션**(`ActionResult<T>` 판별 유니온·권한 검증·클라이언트 바인딩)에 집중한다.

### 5.1 `ActionResult<T>` — 판별 유니온으로 반환

Server Action은 **예외를 throw하지 않고** 판별 유니온을 반환한다. 클라이언트가 타입 좁히기로 성공/실패 분기할 수 있다.

```tsx
// actions/create-user.ts
'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

const schema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
});

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; errors: Record<string, string[]> };

export async function createUser(
  _prev: ActionResult<User> | null,
  formData: FormData,
): Promise<ActionResult<User>> {
  const parsed = schema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  const user = await db.users.create(parsed.data);
  revalidatePath('/users');
  return { success: true, data: user };
}
```

### 5.2 클라이언트 바인딩 — `useActionState`

`useActionState`로 폼 상태·pending 플래그를 함께 관리한다. RHF와 병행할 때는 `mode: 'onSubmit'`으로 두고 서버 에러를 `state.errors`에서 수동 매핑한다.

```tsx
'use client';

import { useActionState } from 'react';
import { createUser } from '@/actions/create-user';

export function SignupForm() {
  const [state, formAction, isPending] = useActionState(createUser, null);

  return (
    <form action={formAction}>
      <Input name="email" error={state?.success === false ? state.errors.email?.[0] : undefined} />
      <Input name="name" error={state?.success === false ? state.errors.name?.[0] : undefined} />
      <Button type="submit" disabled={isPending}>
        {isPending ? '처리 중...' : '가입'}
      </Button>
    </form>
  );
}
```

### 5.3 권한 검증 — Server Action 진입 시점에 반드시

Server Action은 **공개 엔드포인트**다. 클라이언트에서 버튼을 숨기는 것과 권한 검증은 별개다. 액션 함수 첫 줄에서 세션과 role을 확인한다.

```tsx
'use server';

import { auth } from '@/lib/auth';

export async function deleteUser(id: string): Promise<ActionResult<void>> {
  const session = await auth();

  if (!session?.user) {
    return { success: false, errors: { _form: ['로그인이 필요합니다'] } };
  }

  if (session.user.role !== 'admin') {
    return { success: false, errors: { _form: ['권한이 없습니다'] } };
  }

  await db.users.delete({ where: { id } });
  revalidatePath('/users');
  return { success: true, data: undefined };
}
```

***

## ❌ 안티패턴

* **useState로 폼 관리**: 필드 10개면 useState 10개 → React Hook Form 사용
* **클라이언트만 검증**: 서버에서도 반드시 Zod 검증 (동일 스키마 공유)
* **에러 메시지 숨기기**: 에러는 즉시 필드 아래에 표시
* **제출 중 버튼 미비활성화**: 더블 제출 방지 필수 (`isSubmitting`)
* **Zod 스키마와 타입 따로 관리**: `z.infer<typeof schema>` 사용
* **Server Action에서 `throw new Error()`**: 판별 유니온으로 `return { success: false, ... }` — 예외는 네트워크/DB 장애 같은 예기치 못한 상황에만
* **`revalidatePath` 누락**: 성공 응답 후 캐시 무효화 안 하면 UI가 구 데이터를 보여준다
* **클라이언트 role 체크만**: 버튼 숨기기는 UX일 뿐, 권한 검증은 반드시 Server Action 진입 시점에서
* **민감 정보 로그**: Server Action 에러 로그에 비밀번호/토큰 포함 금지

***

> 📎 관련: [error-handling.md](error-handling.md) · [state-management.md](state-management.md) §Server Actions 패턴 · `vercel:nextjs` (Next.js Server Actions 기본 동작)
