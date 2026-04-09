# Design Tokens

## 목차

1. [디자인 토큰이란?](#1-디자인-토큰이란)
2. [토큰 3-Layer 구조](#2-토큰-3-layer-구조)
   - Layer 1: Primitive Tokens
   - Layer 2: Semantic Tokens
   - Layer 3: Component Tokens
3. [다크 모드 (Multi-Theme)](#3-다크-모드-multi-theme)
4. [멀티 브랜드 테마](#4-멀티-브랜드-테마)
5. [Figma Variables 연동](#5-figma-variables-연동)
6. [토큰 네이밍 컨벤션](#6-토큰-네이밍-컨벤션)
7. [안티패턴](#7-안티패턴)

---

## 1. 디자인 토큰이란?

디자인 결정을 **이름 있는 값(named values)** 으로 추상화한 것. 색상, 타이포, 간격, 그림자 등 시각적 속성을 플랫폼/도구 독립적으로 정의.

```
#3b82f6  →  color.blue.500  →  color.primary  →  button.bg
(값)        (primitive)        (semantic)        (component)
```

### 왜 토큰인가?

* **일관성**: 하드코딩된 값 → 중앙 관리 값
* **테마 지원**: 토큰 값만 교체하면 다크모드/브랜드 테마
* **디자인-코드 동기화**: Figma Variables = CSS Custom Properties
* **스케일**: 새 플랫폼 추가 시 토큰만 변환

---

## 2. 토큰 3-Layer 구조

### Layer 1: Primitive Tokens (원시 토큰)

가장 기본적인 값. 색상 팔레트, 폰트 크기 스케일 등 순수한 값.

```css
/* Colors */
--blue-50: #eff6ff;
--blue-100: #dbeafe;
--blue-500: #3b82f6;
--blue-900: #1e3a8a;

--red-50: #fef2f2;
--red-500: #ef4444;
--red-900: #7f1d1d;

--gray-50: #f9fafb;
--gray-100: #f3f4f6;
--gray-500: #6b7280;
--gray-900: #111827;

/* Typography */
--font-size-xs: 0.75rem;    /* 12px */
--font-size-sm: 0.875rem;   /* 14px */
--font-size-base: 1rem;     /* 16px */
--font-size-lg: 1.125rem;   /* 18px */
--font-size-xl: 1.25rem;    /* 20px */
--font-size-2xl: 1.5rem;    /* 24px */
--font-size-3xl: 1.875rem;  /* 30px */
--font-size-4xl: 2.25rem;   /* 36px */

/* Spacing */
--space-1: 0.25rem;   /* 4px */
--space-2: 0.5rem;    /* 8px */
--space-3: 0.75rem;   /* 12px */
--space-4: 1rem;      /* 16px */
--space-5: 1.25rem;   /* 20px */
--space-6: 1.5rem;    /* 24px */
--space-8: 2rem;      /* 32px */
--space-10: 2.5rem;   /* 40px */
--space-12: 3rem;     /* 48px */
--space-16: 4rem;     /* 64px */

/* Border Radius */
--radius-sm: 0.25rem;   /* 4px */
--radius-md: 0.375rem;  /* 6px */
--radius-lg: 0.5rem;    /* 8px */
--radius-xl: 0.75rem;   /* 12px */
--radius-full: 9999px;

/* Shadows */
--shadow-xs: 0 1px 2px 0 rgb(0 0 0 / 0.05);
--shadow-sm: 0 1px 3px 0 rgb(0 0 0 / 0.1);
--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
--shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
--shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1);
```

### Layer 2: Semantic Tokens (의미적 토큰)

Primitive에 **의미/용도**를 부여. 테마 전환의 핵심.

```css
:root {
  /* Background */
  --color-bg: var(--gray-50);
  --color-bg-surface: white;
  --color-bg-elevated: white;
  --color-bg-muted: var(--gray-100);

  /* Text */
  --color-text-primary: var(--gray-900);
  --color-text-secondary: var(--gray-500);
  --color-text-tertiary: var(--gray-400);
  --color-text-inverse: white;

  /* Border */
  --color-border: var(--gray-200);
  --color-border-strong: var(--gray-300);

  /* Interactive */
  --color-primary: var(--blue-500);
  --color-primary-hover: var(--blue-600);
  --color-primary-active: var(--blue-700);
  --color-primary-bg: var(--blue-50);

  /* Feedback */
  --color-success: var(--green-600);
  --color-success-bg: var(--green-50);
  --color-warning: var(--amber-600);
  --color-warning-bg: var(--amber-50);
  --color-error: var(--red-600);
  --color-error-bg: var(--red-50);

  /* Typography */
  --text-body: var(--font-size-base);
  --text-heading: var(--font-size-2xl);

  /* Spacing (semantic) */
  --spacing-component: var(--space-4);
  --spacing-section: var(--space-12);
}
```

### Layer 3: Component Tokens (컴포넌트 토큰)

특정 컴포넌트에 바인딩된 토큰. 선택적 — 시스템이 충분히 크면 유용.

```css
/* Button */
--button-bg: var(--color-primary);
--button-text: var(--color-text-inverse);
--button-border-radius: var(--radius-md);
--button-padding-x: var(--space-4);
--button-padding-y: var(--space-2);

/* Input */
--input-bg: var(--color-bg-surface);
--input-border: var(--color-border);
--input-border-focus: var(--color-primary);
--input-border-error: var(--color-error);
--input-border-radius: var(--radius-md);

/* Card */
--card-bg: var(--color-bg-surface);
--card-border: var(--color-border);
--card-border-radius: var(--radius-lg);
--card-shadow: var(--shadow-sm);
--card-padding: var(--space-6);
```

---

## 3. 다크 모드 (Multi-Theme)

Semantic Token 값만 교체하면 테마 전환 완료.

```css
.dark {
  /* Background */
  --color-bg: var(--gray-950);
  --color-bg-surface: var(--gray-900);
  --color-bg-elevated: var(--gray-800);
  --color-bg-muted: var(--gray-800);

  /* Text */
  --color-text-primary: var(--gray-50);
  --color-text-secondary: var(--gray-400);
  --color-text-tertiary: var(--gray-500);

  /* Border */
  --color-border: var(--gray-800);
  --color-border-strong: var(--gray-700);

  /* Interactive — 밝은 shade 사용 */
  --color-primary: var(--blue-400);
  --color-primary-hover: var(--blue-300);
  --color-primary-bg: var(--blue-950);

  /* Feedback — 밝은 shade */
  --color-success: var(--green-400);
  --color-error: var(--red-400);

  /* Shadow — 더 강하게 */
  --shadow-sm: 0 1px 3px 0 rgb(0 0 0 / 0.3);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.4);
}
```

### 테마 전환 구현

```tsx
// Tailwind + next-themes
<ThemeProvider attribute="class" defaultTheme="system">
  {children}
</ThemeProvider>

// 토글 컴포넌트
function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      <Sun className="hidden dark:block" />
      <Moon className="block dark:hidden" />
    </Button>
  );
}
```

---

## 4. 멀티 브랜드 테마

같은 프로덕트에 다른 브랜드 적용:

```css
[data-theme="brand-a"] {
  --color-primary: var(--blue-500);
  --radius-md: 0.375rem;
  --font-family: 'Inter', sans-serif;
}

[data-theme="brand-b"] {
  --color-primary: var(--purple-600);
  --radius-md: 1rem;  /* 더 둥근 */
  --font-family: 'Poppins', sans-serif;
}
```

---

## 5. Figma Variables 연동

### Figma Variables 구조

```
Collection: Primitives
├── blue/50, blue/100, ..., blue/900
├── gray/50, gray/100, ..., gray/900
├── space/1, space/2, ..., space/16
└── radius/sm, radius/md, radius/lg

Collection: Semantic (Mode: Light, Dark)
├── bg/default, bg/surface, bg/muted
├── text/primary, text/secondary
├── border/default, border/strong
└── interactive/primary, interactive/primary-hover

Collection: Component (optional)
├── button/bg, button/text
├── input/border, input/border-focus
└── card/bg, card/shadow
```

### 동기화 도구

* **Tokens Studio (Figma Plugin)**: Figma <-> JSON <-> CSS
* **Style Dictionary (Amazon)**: 토큰 JSON → 멀티 플랫폼 변환
* **수동 동기화**: 작은 팀에서는 수동도 OK (Figma Variables를 CSS에 반영)

---

## 6. 토큰 네이밍 컨벤션

### 규칙

* `kebab-case` 사용 (`color-primary`, not `colorPrimary`)
* `{category}-{property}-{variant}-{state}` 구조
* 시각적 값이 아닌 **용도**로 명명 (Semantic level)

### 예시

```
color-text-primary     (용도 기반) (O)
color-dark-gray        (시각적 값 기반) (X)

spacing-component-gap  (용도 기반) (O)
spacing-16px           (값 기반) (X)

color-error            (의미 기반) (O)
color-red              (색상 기반) (X)
```

---

## 7. 안티패턴

* **토큰 없는 하드코딩**: `color: #3b82f6` 직접 사용 → 테마 불가
* **과도한 토큰**: 모든 값을 토큰화 → 관리 불가. 재사용되는 값만 토큰화
* **Layer 혼합**: Primitive를 컴포넌트에서 직접 참조 (`var(--blue-500)` 대신 `var(--color-primary)`)
* **네이밍 불일치**: Figma와 코드에서 다른 이름
* **문서 부재**: 어떤 토큰을 언제 사용하는지 가이드 없음

---

## 참고 자료

* Design Tokens W3C Community Group (design-tokens.github.io)
* Tokens Studio (tokens.studio)
* Style Dictionary (amzn.github.io/style-dictionary)
* shadcn/ui Theming (ui.shadcn.com/docs/theming)
