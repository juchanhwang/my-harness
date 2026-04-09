# Design System

> TDS(Toss Design System) 패턴을 참고한 컴포넌트 설계 원칙. shadcn/ui 기반으로 커스텀 디자인 시스템을 구축한다.

***

## 1. TDS (Toss Design System) 패턴

토스의 디자인 시스템은 **일관성, 재사용성, 접근성**을 핵심으로 한다.

### 핵심 원칙

1. **Composable**: "컴포넌트는 조합 가능해야 한다. 하나의 만능 컴포넌트보다 작은 조각을 조합하는 방식"
2. **Consistent**: 같은 컴포넌트는 어디서든 같은 모습과 동작을 한다.
3. **Accessible**: 모든 컴포넌트에 접근성이 내장되어 있다.

### 컴포넌트 계층

```
Foundation (Token)
  └── Primitive (기본 UI 요소: Button, Input, Select...)
      └── Pattern (복합 패턴: SearchInput, DateRangePicker...)
          └── Feature (비즈니스 로직 포함: OrderForm, PaymentWidget...)
```

***

## 2. 컴포넌트 설계 원칙

### Headless + Styled 분리

로직과 스타일을 분리하면 재사용성이 높아진다.

```tsx
// hooks/useToggle.ts — Headless 로직
function useToggle(initialValue = false) {
  const [isOn, setIsOn] = useState(initialValue);
  const toggle = useCallback(() => setIsOn(prev => !prev), []);
  const on = useCallback(() => setIsOn(true), []);
  const off = useCallback(() => setIsOn(false), []);
  return { isOn, toggle, on, off };
}

// components/ui/Switch.tsx — Styled 컴포넌트
function Switch({ checked, onChange, label }: SwitchProps) {
  return (
    <label className="flex items-center gap-2">
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-11 rounded-full transition-colors',
          checked ? 'bg-blue-500' : 'bg-gray-300'
        )}
      >
        <span className={cn(
          'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform',
          checked && 'translate-x-5'
        )} />
      </button>
      <span>{label}</span>
    </label>
  );
}
```

### Compound Component 패턴

"복잡한 컴포넌트는 하위 컴포넌트를 조합하여 구성"한다.

```tsx
// Compound Component
function Card({ children, className }: PropsWithChildren<{ className?: string }>) {
  return <div className={cn('rounded-lg border bg-white p-6', className)}>{children}</div>;
}

Card.Header = function CardHeader({ children }: PropsWithChildren) {
  return <div className="mb-4 border-b pb-4">{children}</div>;
};

Card.Title = function CardTitle({ children }: PropsWithChildren) {
  return <h3 className="text-lg font-semibold">{children}</h3>;
};

Card.Content = function CardContent({ children }: PropsWithChildren) {
  return <div>{children}</div>;
};

// 사용
<Card>
  <Card.Header>
    <Card.Title>주문 상세</Card.Title>
  </Card.Header>
  <Card.Content>
    <OrderDetails order={order} />
  </Card.Content>
</Card>
```

### Variant 패턴 (cva)

`class-variance-authority`로 컴포넌트 변형을 관리한다.

```tsx
import { cva, type VariantProps } from 'class-variance-authority';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-blue-500 text-white hover:bg-blue-600',
        secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200',
        ghost: 'hover:bg-gray-100',
        destructive: 'bg-red-500 text-white hover:bg-red-600',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

type ButtonProps = ComponentPropsWithoutRef<'button'> & VariantProps<typeof buttonVariants>;

function Button({ variant, size, className, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
```

***

## 3. shadcn/ui 활용 패턴

### 원칙

shadcn/ui는 **복사해서 사용하는** 컴포넌트 라이브러리다. 코드를 소유하므로 자유롭게 커스텀할 수 있다.

```bash
# 컴포넌트 추가
npx shadcn-ui@latest add button dialog select
```

### 커스텀 가이드

```
components/
└── ui/                    # shadcn/ui 기본 컴포넌트 (수정 최소화)
    ├── button.tsx
    ├── dialog.tsx
    └── input.tsx
└── custom/                # 프로젝트 전용 확장 컴포넌트
    ├── search-input.tsx   # ui/input 기반 확장
    └── confirm-dialog.tsx # ui/dialog 기반 확장
```

* `ui/` 디렉토리: "shadcn/ui 원본에 가깝게 유지. 업데이트 추적 용이"
* `custom/` 디렉토리: 프로젝트 전용 확장. ui/ 컴포넌트를 조합하여 구성.

***

## 4. 토큰 기반 스타일링

### Design Tokens

"디자인 시스템의 기본 값(색상, 간격, 폰트 등)을 CSS 변수로 정의"한다.

```css
/* globals.css */
:root {
  /* Colors */
  --color-primary: 221.2 83.2% 53.3%;
  --color-primary-foreground: 210 40% 98%;
  --color-secondary: 210 40% 96.1%;
  --color-destructive: 0 84.2% 60.2%;

  /* Spacing */
  --spacing-xs: 0.25rem;
  --spacing-sm: 0.5rem;
  --spacing-md: 1rem;
  --spacing-lg: 1.5rem;
  --spacing-xl: 2rem;

  /* Border Radius */
  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;

  /* Typography */
  --font-sans: 'Pretendard', -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
}

.dark {
  --color-primary: 217.2 91.2% 59.8%;
  /* ... dark mode tokens */
}
```

### Tailwind CSS 연동

```js
// tailwind.config.ts
export default {
  theme: {
    extend: {
      colors: {
        primary: 'hsl(var(--color-primary))',
        'primary-foreground': 'hsl(var(--color-primary-foreground))',
        secondary: 'hsl(var(--color-secondary))',
        destructive: 'hsl(var(--color-destructive))',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
    },
  },
};
```

### cn 유틸리티

```tsx
// lib/utils.ts
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

***

## 5. 컴포넌트 문서화

Storybook으로 컴포넌트를 문서화하고, 인터랙티브하게 테스트한다.

```tsx
// Button.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './button';

const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary', 'ghost', 'destructive'] },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = { args: { children: '버튼', variant: 'primary' } };
export const Secondary: Story = { args: { children: '버튼', variant: 'secondary' } };
```

***

> 📎 관련: [accessibility.md](accessibility.md) · [code-quality.md](code-quality.md)
