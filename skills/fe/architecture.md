# Architecture

> 참조: [Bulletproof React](https://github.com/alan2207/bulletproof-react) · [Kent C. Dodds — Colocation](https://kentcdodds.com/blog/colocation) · [AHA Programming](https://kentcdodds.com/blog/aha-programming) · [Dan Abramov — The Two Reacts](https://overreacted.io/the-two-reacts/) · [Feature-Sliced Design](https://feature-sliced.design/) · [Next.js — Project Organization](https://nextjs.org/docs/app/building-your-application/routing/colocation)
> 핵심 메시지: **"좋은 아키텍처는 변경 비용을 낮춘다."**

프론트엔드 아키텍처에 정답은 하나가 아니다. 팀 규모·제품 성숙도·기능 복잡도에 따라 최적해가 달라진다. 이 문서는 **판단 기준**과 **허용되는 선택지**를 함께 제공한다.

## 목차

1. [기본 원칙](#1-기본-원칙) — Colocation · AHA · 단방향 의존성 · Server-First · SRP
2. [모노레포 (Turborepo + pnpm)](#2-모노레포-turborepo--pnpm)
3. [디렉토리 구조 — 허용 패턴과 안티패턴](#3-디렉토리-구조--허용-패턴과-안티패턴)
4. [Feature Boundary 규칙](#4-feature-boundary-규칙)
5. [컴포넌트 분리 기준](#5-컴포넌트-분리-기준)
6. [Server / Client 경계 (Next.js App Router)](#6-server--client-경계-nextjs-app-router)

***

## 1. 기본 원칙

### 1.1 Colocation — 관련된 코드를 가까이 둔다

어떤 컴포넌트·훅·테스트·스타일이 특정 기능에만 속한다면 그 기능 폴더 안에 둔다. "공통 위치에 모아두는 편이 찾기 쉽다"는 직관은 대부분 틀린다. 사용처와 가까울수록:

* 삭제하기 쉽다 — 기능을 지우면 관련 코드가 함께 사라진다
* 변경 영향을 파악하기 쉽다
* "이건 어디서 쓰지?"라는 질문이 줄어든다

### 1.2 AHA — 성급한 추상화 금지

> "Prefer duplication over the wrong abstraction." — Sandi Metz

두 번 중복된 코드를 보면 즉시 추상화하고 싶은 충동이 든다. 참아라. **3번째 사용 사례**가 나타날 때까지 기다린다. 잘못된 추상화는 중복보다 훨씬 비싸다 — 잘못 묶인 코드를 풀어내는 비용이 처음부터 중복을 허용하는 비용보다 크다.

### 1.3 Unidirectional Dependency Flow — 단방향 의존성

> 출처: [Bulletproof React — Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)

의존성은 한 방향으로만 흐른다.

```
app (라우팅·조합) → features (비즈니스 모듈) → shared (공통 인프라)
```

* `shared`는 누구도 모른다
* `features`는 `shared`만 쓴다
* `app`은 `features`와 `shared`를 조합한다
* **`features/A`가 `features/B`를 직접 import하지 않는다**

이 원칙을 어기면 모듈 경계가 녹아내리고, 한 feature를 수정했을 때 관련 없어 보이는 곳이 깨진다.

### 1.4 Server-First (Next.js App Router)

Next.js App Router에서는 **Server Component가 기본**이다. UI는 `f(data, state)` 형태로 이해할 수 있으며, Server Component가 `data` 축(데이터 fetch·렌더링)을, Client Component가 `state` 축(인터랙션)을 담당한다. `'use client'`는 상호작용이 필요한 곳(폼·버튼·이벤트 리스너)에만 붙이고, 경계는 **leaf에 가까울수록** 좋다. 번들 사이즈·SSR 성능·하이드레이션 비용 모두에 이득이다.

→ 상세: [performance-ssr.md](performance-ssr.md)

### 1.5 SRP — 단일 책임 원칙

> "A class should have only one reason to change."
> — Robert C. Martin, *Agile Software Development, Principles, Patterns, and Practices*, Prentice Hall, 2003, p. 95.

SOLID의 첫 글자 S. Martin은 2018년 *Clean Architecture*에서 "reason to change"를 **"actor"**(변경을 요청하는 이해관계자 — CFO·COO·CTO 같은 조직 단위)로 정밀화했지만, 프론트엔드 적용에서는 원래의 **"변경 이유"** 관점이 더 직관적이다.

프론트엔드에서 "책임"은 **변경 이유**로 번역된다. 한 컴포넌트·훅·함수가 두 개 이상의 이유로 동시에 수정되어야 한다면 SRP를 어긴 것이다:

* UI 레이아웃이 바뀔 때 + 데이터 패칭 로직이 바뀔 때 → 서로 다른 이유
* 디자인 토큰이 바뀔 때 + 비즈니스 규칙이 바뀔 때 → 서로 다른 이유
* 폼 검증 규칙이 바뀔 때 + 제출 후 라우팅이 바뀔 때 → 서로 다른 이유

이 원칙의 실무 적용은 두 층위로 나뉜다:

* **판단 기준** — [§5 컴포넌트 분리 기준](#5-컴포넌트-분리-기준) 의 Kent 7가지 문제 신호가 "언제 분리할지"를 구체화한다
* **결합도 축 적용** — [code-quality.md §4.1](code-quality.md) 이 "어떻게 코드로 구현되는지" 예시를 제공한다

***

## 2. 모노레포 (Turborepo + pnpm)

여러 앱과 공유 패키지를 하나의 저장소에서 관리한다.

### 2.1 디렉토리 구조

```
apps/
  web/              # Next.js 메인 앱
  admin/            # 관리자 앱
  storybook/        # 디자인 시스템 문서
packages/
  ui/               # 공통 UI 컴포넌트
  utils/            # 유틸리티
  api-client/       # API 클라이언트
  eslint-config/    # 공유 ESLint 설정
  tsconfig/         # 공유 TS 설정
```

### 2.2 Turborepo

Turborepo는 태스크 파이프라인과 원격 캐시를 제공한다. `turbo.json`의 `tasks`에 `build`·`lint`·`test`·`dev`를 정의하고 의존성을 명시한다 (`dependsOn: ["^build"]`).

**⚠️ 함정**: `tasks.build.env`에 필수 환경변수를 빼먹으면 Vercel에서 조용히 잘못된 캐시를 가져온다. 환경변수를 읽는 빌드는 반드시 `env` 또는 `passThroughEnv`에 등록한다.

### 2.3 pnpm

* **Content-addressable storage** — 디스크 공간 절약, 설치 속도 향상
* **엄격한 의존성** — phantom dependency 방지 (symlink 기반 `node_modules`)
* **Workspace** — `pnpm-workspace.yaml`로 워크스페이스 정의

→ 상세: [build-optimization.md](build-optimization.md) · [ci-cd.md](ci-cd.md)

***

## 3. 디렉토리 구조 — 허용 패턴과 안티패턴

프로젝트 구조는 상황에 따라 다르다. 아래 **3가지 패턴은 모두 허용**하며, 팀 상황과 제품 성숙도에 맞춰 선택한다. **1가지 안티패턴은 금지**한다.

### 3.1 ✅ 허용 — Feature-Based (Bulletproof React)

> 출처: [Bulletproof React — Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)

중소형 제품, 빠른 개발 속도가 중요한 팀에 권장.

```
src/
├── app/              # Next.js App Router
├── features/         # 기능별 모듈
│   └── orders/
│       ├── api/      # orders 전용 API 훅
│       ├── components/
│       ├── hooks/
│       ├── types/
│       └── utils/
├── components/       # 공유 UI 컴포넌트 (여러 feature에서 재사용)
├── hooks/            # 공유 훅
├── lib/              # 외부 라이브러리 래퍼·설정
├── types/            # 공유 타입
└── utils/            # 공유 유틸
```

**특징**:

* 단방향 흐름: `features` → `components/hooks/lib/utils` (역방향 금지)
* 각 `features/*`는 독립적 — 다른 feature를 직접 import하지 않는다
* 공통으로 쓰고 싶다면 `features` 밖으로 **승격**해야 한다

### 3.2 ✅ 허용 — Feature-Sliced Design (FSD)

> 출처: [feature-sliced.design](https://feature-sliced.design/)

대형 제품, 여러 팀이 동시에 작업하는 환경에 권장. 레이어 경계가 강제되어 장기 유지보수에 유리하다.

```
src/
├── app/          # 라우팅·전역 providers
├── pages/        # 페이지 조립
├── widgets/      # 페이지 블록 (header, sidebar)
├── features/     # 사용자 시나리오 (로그인, 결제)
├── entities/     # 비즈니스 엔티티 (User, Order)
└── shared/       # 공통 인프라 (UI kit, API client, lib)
```

**레이어 규칙**: 위 레이어는 아래 레이어만 import할 수 있다. `entities`가 `features`를 쓸 수 없다.

### 3.3 ✅ 허용 — Next.js App Router Colocation

> 출처: [Next.js — Project Organization and File Colocation](https://nextjs.org/docs/app/building-your-application/routing/colocation)

페이지 중심 사고가 자연스러운 제품에 권장. 라우트별로 필요한 모든 것을 해당 라우트 폴더에 둔다.

```
app/
├── orders/
│   ├── _components/        # 이 라우트 전용 컴포넌트 (private folder)
│   ├── _hooks/             # 이 라우트 전용 훅
│   ├── page.tsx
│   └── [id]/
│       ├── _components/
│       └── page.tsx
├── (marketing)/            # route group (URL 영향 없음)
│   ├── about/page.tsx
│   └── pricing/page.tsx
└── layout.tsx
```

**Next.js 전용 도구**:

* **`_folder`** — private folder. `_`로 시작하면 라우팅에서 제외된다
* **`(folder)`** — route group. 괄호로 감싸면 URL에 영향 없이 폴더를 그룹핑할 수 있다
* **`src/`** — 선택. `app/`과 루트 설정 파일을 분리하고 싶으면 사용
* **`proxy.ts`** (Next.js 16+) — 이전 `middleware.ts`의 새 이름. 기존 코드 마이그레이션 필요

### 3.4 ❌ 금지 — Type-Based Flat

```
src/
├── components/   # 모든 컴포넌트
├── hooks/        # 모든 훅
├── utils/        # 모든 유틸
├── types/        # 모든 타입
└── api/          # 모든 API
```

왜 금지하는가:

* **Colocation 위반** — 기능 하나를 찾으려면 5개 폴더를 뒤져야 한다
* **삭제가 어려움** — 기능을 지우려면 여러 폴더를 동시에 수정해야 하고, 누락이 발생하기 쉽다
* **의존성 지옥** — `components/Order.tsx`가 `hooks/useOrder.ts`를 쓰고, 그게 `api/orders.ts`를 쓰고… 파일 사이 관계를 파악할 수 없다
* **확장성 없음** — 10명 이상 팀에서는 `components/` 폴더가 200+ 파일로 폭발한다

> 단, **프로토타입·해커톤·토이 프로젝트**처럼 수명이 짧고 파일 수가 적은 경우는 예외다. "10개 미만 파일"에서는 type-based가 오히려 단순할 수 있다.

***

## 4. Feature Boundary 규칙

어떤 구조를 선택하든 아래 규칙은 공통으로 적용한다.

### 4.1 단방향 의존성

[§1.3](#13-unidirectional-dependency-flow--단방향-의존성)에서 정의한 원칙(`app → features → shared`)을 **규칙**으로 구현한다. 위반은 리뷰에서 잡지 말고 **§4.3의 ESLint `no-restricted-paths`가 기계적으로 차단**한다 — 사람의 주의력에 의존하면 결국 뚫린다.

### 4.2 Barrel File (`index.ts`) 회피

> 출처: [Bulletproof React — Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) — "Barrel files can cause issues with tree-shaking"

```ts
// ❌ features/orders/index.ts
export * from './components/OrderList';
export * from './components/OrderDetail';
export * from './hooks/useOrders';
```

문제:

* **Tree-shaking 저해** — Vite·Webpack·Turbopack 모두 barrel을 통한 import를 완전히 분석하지 못해 불필요한 코드가 번들에 포함된다
* **순환 참조 위험** — barrel을 통한 import는 순환 의존성을 만들기 쉽다
* **HMR 느려짐** — 한 파일이 바뀌면 barrel을 import한 모든 파일이 무효화된다

**대안**: 깊은 경로로 직접 import한다.

```ts
// ✅
import { OrderList } from '@/features/orders/components/OrderList';
import { useOrders } from '@/features/orders/hooks/useOrders';
```

### 4.3 ESLint로 경계 강제 — `no-restricted-paths`

규칙을 문서로만 남기면 지켜지지 않는다. `eslint-plugin-import`의 `no-restricted-paths`로 기계적으로 차단한다.

```js
// eslint.config.js (Flat Config 기준)
import importPlugin from 'eslint-plugin-import';

export default [
  {
    plugins: { import: importPlugin },
    rules: {
      'import/no-restricted-paths': ['error', {
        zones: [
          // features 사이 직접 import 금지
          {
            target: './src/features/orders',
            from: './src/features',
            except: ['./orders'],
          },
          // shared에서 features import 금지
          {
            target: './src/shared',
            from: './src/features',
          },
        ],
      }],
    },
  },
];
```

FSD를 채택했다면 `eslint-plugin-boundaries`를 쓰면 레이어 기반으로 더 간단히 정의할 수 있다.

### 4.4 Import 순서

```ts
// 1. 외부 라이브러리
import { useState } from 'react';
import { z } from 'zod';

// 2. 내부 공유 모듈 (@/ alias)
import { Button } from '@/components/ui/button';
import { formatDate } from '@/utils/date';

// 3. 같은 feature 내부 (상대 경로)
import { useOrderForm } from './useOrderForm';
import { OrderSummary } from '../OrderSummary';
```

`@trivago/prettier-plugin-sort-imports` 또는 ESLint `import/order`로 자동화한다.

***

## 5. 컴포넌트 분리 기준

### 5.1 분리는 줄 수가 아니라 "문제"가 기준이다

> 출처: [Kent C. Dodds — When to Break Up a Component into Multiple Components](https://kentcdodds.com/blog/when-to-break-up-a-component-into-multiple-components)

"200줄 넘으면 분리" 같은 기계적 규칙은 경계선을 잘못 긋게 만든다. Kent의 **7가지 문제 신호** 중 하나라도 나타날 때 분리를 고려한다.

1. **리렌더링이 문제가 된다** — 상태가 바뀌는 일부분 때문에 큰 트리가 전부 리렌더링된다
2. **재사용이 필요해졌다** — 같은 UI 조각이 다른 곳에서도 필요하다
3. **상태 관리가 혼란스럽다** — 한 컴포넌트가 너무 많은 책임을 진다
4. **통합 테스트로만 검증 가능하다** — 단위 테스트로는 특정 로직을 검증할 수 없다
5. **머지 컨플릭트가 반복된다** — 같은 파일을 여러 PR이 동시에 수정한다
6. **3rd-party 호환성** — 외부 라이브러리 컴포넌트와 합치려는데 구조가 맞지 않는다
7. **명령형 추상화가 필요하다** — `ref`를 통한 명령형 API(포커스·스크롤 등) 경계가 필요하다

### 5.2 변경 이유 관점 — SRP

[§1.5](#15-srp--단일-책임-원칙) 에서 선언한 SRP의 실무 적용: **변경 이유가 2개 이상이면 분리를 고려한다.** §5.1의 Kent 7가지 신호는 이 판단을 구체화한 체크리스트이고, [code-quality.md §4.1](code-quality.md) 은 결합도 축에서의 코드 예시를 제공한다.

### 5.3 줄 수는 "리뷰 트리거"이지 "분리 기준"이 아니다

* **300줄 이상 파일이 PR에 등장**하면 리뷰어는 §5.1의 7가지 신호 중 해당되는 것이 있는지 **점검**한다
* 해당 없으면 300줄이어도 그대로 둔다 — 예: 긴 폼, 정당한 조건 분기가 많은 화면
* 해당 있으면 분리 제안

→ 상세: [component-patterns.md](component-patterns.md)

***

## 6. Server / Client 경계 (Next.js App Router)

### 6.1 기본값: Server Component

`app/` 아래 모든 컴포넌트는 기본적으로 Server Component다. `'use client'`는 **필요한 곳에만**, **leaf에 가깝게** 붙인다.

```tsx
// ✅ 서버에서 데이터 fetch + 서버 렌더링
// app/orders/page.tsx
export default async function OrdersPage() {
  const orders = await fetchOrders();  // 서버에서 실행
  return <OrderList orders={orders} />;
}

// ✅ 상호작용만 클라이언트
// components/FavoriteButton.tsx
'use client';
export function FavoriteButton({ orderId }: { orderId: string }) {
  const [favorited, setFavorited] = useState(false);
  // ...
}
```

### 6.2 클라이언트 경계를 위로 올리지 말라

```tsx
// ❌ 페이지 전체가 클라이언트 — 서버 렌더링 이점 모두 상실
'use client';
export default function OrdersPage() {
  const { data } = useQuery(['orders'], fetchOrders);
  return <OrderList orders={data} />;
}

// ✅ 페이지는 서버, 상호작용만 클라이언트로 내린다
export default async function OrdersPage() {
  const orders = await fetchOrders();
  return (
    <>
      <OrderList orders={orders} />          {/* 서버 */}
      <OrderFilterBar />                      {/* 'use client' 내부에서만 */}
    </>
  );
}
```

경계를 leaf로 내릴수록:

* JS 번들에서 서버 컴포넌트 코드가 제외된다
* 하이드레이션 대상이 줄어든다
* TTI가 빨라진다

### 6.3 Composition 패턴 — Server → Client → Server

Client Component의 `children` prop에 Server Component를 넘길 수 있다.

```tsx
// ✅ ClientWrapper는 client지만, 그 children은 여전히 server
<ClientWrapper>
  <ServerDataList />
</ClientWrapper>
```

이 패턴을 쓰면 인터랙티브한 래퍼(drawer, tab 등) 안에서도 데이터 fetch를 서버에서 할 수 있다.

→ 상세: [performance-ssr.md](performance-ssr.md)

***

> 📎 관련: [code-quality.md](code-quality.md) · [component-patterns.md](component-patterns.md) · [state-management.md](state-management.md) · [performance-ssr.md](performance-ssr.md) · [git-workflow.md](git-workflow.md) · [code-review.md](code-review.md)
