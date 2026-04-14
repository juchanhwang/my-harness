# Vitest 설정 가이드

React + Next.js 프로젝트의 Vitest 설정 가이드.

***

## 목차

1. [설치](#설치)
2. [vitest.config.ts](#vitestconfigts)
3. [vitest.setup.ts](#vitestsetupts) — MSW, next/navigation, next/image, DOM Mock
4. [Coverage 설정](#coverage-설정)
5. [스크립트 설정](#스크립트-설정)
6. [디렉토리 구조](#디렉토리-구조)
7. [성능 최적화](#성능-최적화)

***

## 설치

```bash
pnpm add -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event @vitejs/plugin-react jsdom msw
```

***

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

    // 격리: forks가 threads보다 MSW/RTL과의 호환성이 좋다 (§성능 최적화 참조)
    pool: 'forks',

    // `vi.stubGlobal`을 afterEach마다 자동 원복 — 테스트 간 mock 누설 방지.
    // IntersectionObserver/matchMedia 등을 테스트별로 오버라이드할 때 필수.
    // 수동 원복 대안: `afterEach(() => vi.unstubAllGlobals())`
    unstubGlobals: true,

    // Next.js 프로젝트에서만 필요: next/* 서버 전용 모듈이 ESM으로 로드되지 않는 문제 회피.
    // Next.js가 아니면 이 블록 전체를 제거해도 무방하다.
    server: {
      deps: { inline: ['next'] },
    },
  },
});
```

***

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
// `next/image`는 DOM `<img>`에 없는 props를 받는다 (fill, priority, placeholder,
// blurDataURL, quality, loader, unoptimized, onLoadingComplete, fetchPriority).
// 이들을 그대로 spread하면 React가 "Received `true` for a non-boolean attribute" 경고를
//쏟아내고, 경고 노이즈에 묻혀 진짜 경고를 놓치게 된다. 테스트 관점에서 필요한 건
// src/alt/width/height뿐이므로 나머지는 제거하고 `<img>`에 전달한다.
// 출처: https://nextjs.org/docs/app/api-reference/components/image
const NEXT_IMAGE_NON_DOM_PROPS = [
  'fill', 'priority', 'placeholder', 'blurDataURL', 'quality',
  'loader', 'loaderFile', 'onLoadingComplete', 'unoptimized', 'fetchPriority',
] as const;

vi.mock('next/image', () => ({
  default: (allProps: Record<string, unknown>) => {
    const props = { ...allProps };
    for (const key of NEXT_IMAGE_NON_DOM_PROPS) delete props[key];
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...(props as React.ImgHTMLAttributes<HTMLImageElement>)} />;
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

### 전역 Mock의 역할 구분

위의 `next/navigation`, `next/image`, `matchMedia`, `ResizeObserver`,
`IntersectionObserver`, `scrollTo`는 모두 **no-op 전역 stub**이다. 목적은 단 하나 —
jsdom에 없거나 Next.js 런타임에서만 존재하는 API를 참조하는 컴포넌트가
**import/렌더 시점에 터지지 않게** 하는 것이다. 테스트의 기대값을 검증하는 용도가 아니다.

행동을 트리거해야 하는 테스트(예: 스크롤 진입 시 다음 페이지 로드, 뷰포트 변경 시 레이아웃 분기)는
이 no-op을 **테스트 파일 내에서 `vi.stubGlobal`로 오버라이드**한다:

```tsx
const mockIntersectionObserver = vi.fn();
mockIntersectionObserver.mockReturnValue({
  observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn(),
});
vi.stubGlobal('IntersectionObserver', mockIntersectionObserver);

// 이후 mockIntersectionObserver.mock.calls[0][0]을 통해
// observer 콜백을 수동으로 호출해 "뷰포트 진입" 이벤트를 시뮬레이션
```

**원복은 자동이 안전하다**. 위 `vitest.config.ts`에 `unstubGlobals: true`를 켜두면 Vitest가
`afterEach`마다 `vi.unstubAllGlobals()`를 호출한다. 이 옵션이 없으면 한 테스트의 stub이
다음 테스트에 누설되어 "왜 observe가 두 번 불리지?" 같은 디버깅 지옥에 빠진다.
수동 대안: `afterEach(() => vi.unstubAllGlobals())`.

출처: Vitest `vi.stubGlobal` — https://vitest.dev/api/vi.html#vi-stubglobal

***

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

***

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

***

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

***

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

***

> 관련: [testing.md](testing.md)
