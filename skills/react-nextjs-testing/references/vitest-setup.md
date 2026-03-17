# Vitest Setup Guide

React + Next.js 프로젝트의 Vitest 설정 가이드.

## Table of Contents

- [기본 설정](#기본-설정)
- [vitest.config.ts](#vitestconfigts)
- [vitest.setup.ts](#vitestsetupts)
- [Coverage 설정](#coverage-설정)
- [스크립트 설정](#스크립트-설정)
- [디렉토리 구조](#디렉토리-구조)
- [성능 최적화](#성능-최적화)

---

## 기본 설정

### 설치

```bash
pnpm add -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event @vitejs/plugin-react jsdom msw
```

---

## vitest.config.ts

```tsx
/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    // 환경 설정
    environment: 'jsdom',

    // 셋업 파일
    setupFiles: ['./vitest.setup.ts'],

    // 글로벌 API (describe, it, expect를 import 없이 사용)
    globals: true,

    // 테스트 파일 패턴
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', 'e2e/**'],

    // CSS 처리 (CSS modules를 빈 객체로)
    css: {
      modules: { classNameStrategy: 'non-scoped' },
    },

    // 타임아웃
    testTimeout: 10000,

    // Alias 설정 (tsconfig paths와 일치시킴)
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/test-utils': path.resolve(__dirname, './src/test-utils'),
    },
  },
});
```

### Next.js와 함께 사용 시

```tsx
// next.js의 @next/env를 로드하려면
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    alias: {
      '@': './src',
    },
    // Next.js 서버 전용 모듈 무시
    server: {
      deps: {
        inline: ['next'],
      },
    },
  },
});
```

---

## vitest.setup.ts

```tsx
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll, afterAll, vi } from 'vitest';
import { server } from './src/mocks/server';

// --- MSW ---
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// --- RTL 자동 cleanup ---
afterEach(() => { cleanup(); });

// --- next/navigation Mock ---
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  })),
  usePathname: vi.fn(() => '/'),
  useSearchParams: vi.fn(() => new URLSearchParams()),
  useParams: vi.fn(() => ({})),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

// --- next/image Mock ---
vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

// --- window.matchMedia Mock ---
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// --- ResizeObserver Mock ---
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// --- IntersectionObserver Mock ---
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// --- scrollTo Mock ---
window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
```

---

## Coverage 설정

```tsx
// vitest.config.ts 내 test 설정에 추가
{
  coverage: {
    provider: 'v8',
    reporter: ['text', 'html', 'lcov'],
    include: ['src/**/*.{ts,tsx}'],
    exclude: [
      'src/**/*.test.{ts,tsx}',
      'src/**/*.stories.{ts,tsx}',
      'src/test-utils.tsx',
      'src/test/**',
      'src/mocks/**',
      'src/types/**',
      'src/**/*.d.ts',
    ],
    // 목표 커버리지 (선택)
    thresholds: {
      statements: 70,
      branches: 70,
      functions: 70,
      lines: 70,
    },
  },
}
```

실행:

```bash
pnpm vitest run --coverage
```

---

## 스크립트 설정

```json
// package.json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:ui": "vitest --ui",
    "test:watch": "vitest --watch",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui"
  }
}
```

| 명령어 | 용도 |
|--------|------|
| `pnpm test` | watch 모드로 실행 (개발 중) |
| `pnpm test:run` | 한 번 실행 (CI) |
| `pnpm test:coverage` | 커버리지 리포트 생성 |
| `pnpm test:ui` | Vitest UI 대시보드 |
| `pnpm test:e2e` | Playwright E2E 실행 |

---

## 디렉토리 구조

```
project/
├── vitest.config.ts         ← Vitest 설정
├── vitest.setup.ts          ← 글로벌 셋업 (MSW, Mock, RTL)
├── playwright.config.ts     ← Playwright 설정
├── src/
│   ├── test-utils.tsx       ← Custom render + re-exports
│   ├── test/
│   │   └── factories.ts    ← Test data factory 함수들
│   ├── mocks/
│   │   ├── server.ts       ← MSW setupServer
│   │   └── handlers.ts     ← 핸들러 루트 (feature 핸들러를 모음)
│   ├── features/
│   │   └── users/
│   │       ├── api/
│   │       │   └── handlers.ts  ← Feature별 MSW 핸들러
│   │       ├── components/
│   │       │   ├── UserList.tsx
│   │       │   └── UserList.test.tsx
│   │       └── hooks/
│   │           ├── useUsers.ts
│   │           └── useUsers.test.ts
│   └── utils/
│       ├── formatDate.ts
│       └── formatDate.test.ts
└── e2e/
    ├── pages/               ← Page Object Models
    │   └── LoginPage.ts
    └── tests/               ← E2E 테스트 파일
        └── login.spec.ts
```

---

## 성능 최적화

### 1. 테스트 격리: `pool: 'forks'`

기본 `threads`보다 격리가 확실하고, MSW 관련 이슈가 줄어든다.

```tsx
test: {
  pool: 'forks',
}
```

### 2. 불필요한 모듈 제외

```tsx
test: {
  deps: {
    optimizer: {
      web: {
        include: ['@testing-library/react', '@testing-library/user-event'],
      },
    },
  },
}
```

### 3. 타입 체크 분리

Vitest에서 타입 체크를 하지 않고, `tsc --noEmit`으로 별도 실행.

```bash
# CI에서
pnpm tsc --noEmit && pnpm vitest run
```

### 4. 병렬 실행

```tsx
test: {
  // 파일 수준 병렬 (기본 활성)
  fileParallelism: true,
  // 테스트 수준 병렬은 비활성 권장 (RTL cleanup 충돌)
  sequence: { concurrent: false },
}
```
