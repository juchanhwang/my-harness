# Styling

> 핵심 메시지: **"Tailwind CSS가 기본. 커스텀 CSS 파일은 예외적 상황에서만."**

***

## 1. Tailwind 우선 원칙

```tsx
// ✅ Tailwind 유틸리티 클래스
<div className="flex items-center gap-4 rounded-lg border p-4 shadow-sm">
  <Avatar className="h-10 w-10" />
  <div className="flex flex-col">
    <span className="text-sm font-medium">사용자 이름</span>
    <span className="text-xs text-muted-foreground">설명</span>
  </div>
</div>

// ❌ 커스텀 CSS
// styles/user-card.module.css 만들지 않는다
```

***

## 2. cn() 유틸리티 (clsx + tailwind-merge)

```tsx
import { cn } from '@/lib/utils';

function Button({ variant = 'default', className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'rounded-md px-4 py-2 font-medium transition-colors',
        variant === 'default' && 'bg-primary text-primary-foreground hover:bg-primary/90',
        variant === 'destructive' && 'bg-destructive text-destructive-foreground',
        variant === 'outline' && 'border border-input bg-background hover:bg-accent',
        className, // 외부에서 override 가능
      )}
      {...props}
    />
  );
}
```

***

## 3. 반응형 디자인

| 접두사   | 최소 너비  | 대상    |
| ----- | ------ | ----- |
| (없음)  | 0px    | 모바일   |
| `sm:` | 640px  | 태블릿   |
| `md:` | 768px  | 소형 랩탑 |
| `lg:` | 1024px | 랩탑    |
| `xl:` | 1280px | 데스크톱  |

```tsx
// ✅ Mobile-first
<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
```

***

## 4. 다크 모드

```tsx
// ✅ Tailwind dark: 접두사
<div className="bg-white text-black dark:bg-gray-900 dark:text-white">

// ✅ CSS 변수 기반 (shadcn/ui 방식) — 추천
<div className="bg-background text-foreground">
```

***

## 5. 애니메이션

```tsx
// 간단한 전환 → Tailwind transition
<button className="transition-colors hover:bg-accent">

// 복잡한 애니메이션 → framer-motion
import { motion } from 'framer-motion';
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: -20 }}
  transition={{ duration: 0.2 }}
/>
```

***

## ❌ 안티패턴

* **인라인 style 속성**: `style={{ marginTop: 8 }}` → `className="mt-2"`
* **CSS Modules 새로 만들기**: Tailwind로 안 되는 경우만
* **!important 사용**: cn()의 tailwind-merge가 충돌 해결
* **px 단위 하드코딩**: Tailwind spacing 시스템 사용 (4px 단위)
* **색상 하드코딩**: CSS 변수 기반 테마 토큰 사용

***

> 📎 관련: [design-system.md](design-system.md) · [performance-react-rendering.md](performance-react-rendering.md)
