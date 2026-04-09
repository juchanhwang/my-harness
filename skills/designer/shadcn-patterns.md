# shadcn Patterns

## 목차

1. [shadcn/ui 철학](#1-shadcnui-철학)
2. [Radix Primitives](#2-radix-primitives)
3. [cva (class-variance-authority)](#3-cva-class-variance-authority)
4. [Tailwind CSS 디자인 토큰](#4-tailwind-css-디자인-토큰)
5. [자주 쓰는 shadcn/ui 패턴](#5-자주-쓰는-shadcnui-패턴)
   - Form + React Hook Form + Zod
   - Command (Cmd+K) 패턴
   - DataTable (TanStack Table)
   - Sheet (사이드 패널)
6. [커스터마이징 전략](#6-커스터마이징-전략)
7. [안티패턴](#7-안티패턴)

---

## 1. shadcn/ui 철학

shadcn/ui는 전통적인 npm 패키지 라이브러리가 아니다. **컴포넌트 코드를 프로젝트에 직접 복사(copy-paste)** 하는 방식. 소유권이 개발자에게 있다.

### 핵심 특징

* **Not a library**: node_modules가 아닌 프로젝트 소스에 컴포넌트 존재
* **Full control**: 소스 코드를 직접 수정 가능
* **Radix Primitives 기반**: 접근성 내장
* **Tailwind CSS**: 유틸리티 퍼스트 스타일링
* **TypeScript**: 타입 안전성
* **cva (class-variance-authority)**: Variant 관리

---

## 2. Radix Primitives

headless (스타일 없는) 접근성 완성 컴포넌트 라이브러리. shadcn/ui의 기반.

### 제공하는 것

* **WAI-ARIA 패턴 구현**: 키보드 네비게이션, 포커스 관리, 스크린 리더 지원
* **Controlled & Uncontrolled**: 두 모드 모두 지원
* **Composition**: 작은 파트를 조합하는 compound component 패턴

### 주요 Primitives

| Primitive | 용도 | 접근성 |
|-----------|------|--------|
| Dialog | 모달 다이얼로그 | Focus trap, Escape 닫기 |
| Dropdown Menu | 드롭다운 메뉴 | 화살표 키 네비게이션 |
| Popover | 팝오버 | 포커스 관리, 외부 클릭 닫기 |
| Select | 커스텀 셀렉트 | 네이티브 select 키보드 패턴 |
| Tabs | 탭 | Arrow 키 전환, ARIA tabs |
| Tooltip | 툴팁 | 호버+포커스, 딜레이 |
| Accordion | 아코디언 | Enter/Space 토글 |
| AlertDialog | 확인 다이얼로그 | Focus trap, 강제 결정 |
| Toast | 토스트 알림 | aria-live, 자동 닫기 |
| Sheet | 사이드 시트 | Dialog 변형 |
| Command | 커맨드 팔레트 | 검색+선택, Cmd+K 패턴 |

### Radix 사용 패턴

```tsx
import * as Dialog from '@radix-ui/react-dialog';

<Dialog.Root>
  <Dialog.Trigger>Open</Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 bg-black/50" />
    <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
      <Dialog.Title>제목</Dialog.Title>
      <Dialog.Description>설명</Dialog.Description>
      {/* 내용 */}
      <Dialog.Close>닫기</Dialog.Close>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

---

## 3. cva (class-variance-authority)

Tailwind CSS에서 variant 기반 스타일링을 관리하는 유틸리티.

### 기본 사용법

```tsx
import { cva, type VariantProps } from "class-variance-authority";

const buttonVariants = cva(
  // Base styles (항상 적용)
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);
```

### 컴포넌트와 연결

```tsx
import { cn } from "@/lib/utils";

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
```

### cn() 유틸리티

`clsx` + `tailwind-merge` 조합:

```tsx
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

* `clsx`: 조건부 클래스 결합
* `twMerge`: Tailwind 클래스 충돌 해결 (`p-2 p-4` → `p-4`)

---

## 4. Tailwind CSS 디자인 토큰

### shadcn/ui 색상 체계

CSS Variables로 정의하고 Tailwind에서 참조:

```css
/* globals.css */
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    /* ... dark mode values */
  }
}
```

### tailwind.config 연결

```ts
// tailwind.config.ts
{
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        // ...
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
}
```

---

## 5. 자주 쓰는 shadcn/ui 패턴

### Form + React Hook Form + Zod

```tsx
const formSchema = z.object({
  email: z.string().email("올바른 이메일을 입력해 주세요"),
  password: z.string().min(8, "8자 이상 입력해 주세요"),
});

<Form {...form}>
  <FormField
    control={form.control}
    name="email"
    render={({ field }) => (
      <FormItem>
        <FormLabel>이메일</FormLabel>
        <FormControl>
          <Input placeholder="name@email.com" {...field} />
        </FormControl>
        <FormMessage /> {/* 자동 에러 메시지 */}
      </FormItem>
    )}
  />
</Form>
```

### Command (Cmd+K) 패턴

```tsx
<CommandDialog open={open} onOpenChange={setOpen}>
  <CommandInput placeholder="검색..." />
  <CommandList>
    <CommandEmpty>결과가 없습니다</CommandEmpty>
    <CommandGroup heading="페이지">
      <CommandItem>대시보드</CommandItem>
      <CommandItem>설정</CommandItem>
    </CommandGroup>
    <CommandSeparator />
    <CommandGroup heading="액션">
      <CommandItem>새 프로젝트</CommandItem>
    </CommandGroup>
  </CommandList>
</CommandDialog>
```

### DataTable (TanStack Table)

```tsx
<DataTable
  columns={columns}
  data={data}
  filterableColumns={[
    { id: "status", title: "상태", options: statuses },
  ]}
  searchableColumns={[
    { id: "name", title: "이름" },
  ]}
/>
```

### Sheet (사이드 패널)

```tsx
<Sheet>
  <SheetTrigger asChild>
    <Button variant="outline">설정</Button>
  </SheetTrigger>
  <SheetContent side="right">
    <SheetHeader>
      <SheetTitle>설정</SheetTitle>
      <SheetDescription>프로필 설정을 변경하세요</SheetDescription>
    </SheetHeader>
    {/* 내용 */}
  </SheetContent>
</Sheet>
```

---

## 6. 커스터마이징 전략

### 테마 확장

1. CSS Variables 수정 (globals.css)
2. 새 variant 추가 (cva 확장)
3. 새 컴포넌트 생성 (기존 primitive 조합)

### 커스텀 컴포넌트 생성 시

* shadcn/ui 컨벤션 따르기 (cn(), forwardRef, VariantProps)
* Radix Primitive 기반으로 접근성 확보
* 기존 토큰 시스템 활용
* Storybook Story 작성

### 주의사항

* `npx shadcn@latest add` 후 수정한 컴포넌트는 재설치 시 덮어쓰기됨
* 수정한 컴포넌트는 별도 관리 (git diff로 변경 추적)
* 대규모 커스텀은 별도 컴포넌트로 분리

---

## 7. 안티패턴

* **Radix 없이 커스텀 모달**: Focus trap, 키보드, ARIA 직접 구현 → 버그 원인
* **cn() 미사용**: 클래스 충돌로 스타일 깨짐
* **인라인 스타일 혼용**: Tailwind + `style={{}}` 혼합 → 유지보수 악몽
* **과도한 커스텀**: shadcn/ui 패턴을 완전히 벗어나면 업데이트 불가
* **다크모드 미고려**: CSS Variables 없이 하드코딩된 색상

---

## 참고 자료

* shadcn/ui 공식 문서 (ui.shadcn.com)
* Radix Primitives 문서 (radix-ui.com)
* cva 문서 (cva.style)
* Tailwind CSS 문서 (tailwindcss.com)
* TanStack Table (tanstack.com/table)
