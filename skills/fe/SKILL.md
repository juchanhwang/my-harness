---
name: fe
description: >
  프론트엔드 도메인 knowledge. React/Next.js/TypeScript 컴포넌트 작성,
  상태 관리(Zustand, TanStack Query), 테스트(Vitest, MSW, Playwright),
  성능 최적화, 접근성, 폼, 라우팅, Server Actions, 코드 리뷰, 리팩토링 시 활성화.
  .tsx/.ts/.css 파일 작성/수정/리뷰 시, 프론트엔드 설계 판단이 필요할 때 사용한다.
  사용자가 컴포넌트, 훅, 스타일링, 번들 최적화, React 패턴, UI 테스트를
  언급하면 반드시 이 스킬을 활성화하라. 명시적으로 '프론트엔드'라고 말하지 않더라도
  .tsx/.jsx 파일을 다루거나 React/Next.js 관련 작업이면 활성화한다.
---

# FE Domain Knowledge

매핑 테이블의 참조 파일에는 프로젝트 고유의 컨벤션, 검증된 패턴, 안티패턴이 담겨 있다.
이를 읽지 않으면 프로젝트 스타일과 충돌하는 코드를 작성하게 되고, 리뷰에서 반려된다.
코드를 작성하거나 리뷰하기 전에 아래 매핑 테이블에서 태스크에 해당하는 파일을 반드시 Read하라.

**기본 경로**: `~/.claude/skills/fe/` — 아래 테이블의 파일명 앞에 이 경로를 붙여서 Read한다.

> 📎 **Next.js 전용 주제는 vercel 플러그인 스킬이 자동 로드한다.** `app/**` 경로, `next/*` import, 관련 프롬프트 시그널에서 Claude Code 훅이 자동으로 주입하므로 이 인벤토리에 매핑하지 않는다. 예: Cache Components(`'use cache'`, `cacheLife`, PPR, `updateTag`/`revalidateTag`, `unstable_cache` 마이그레이션) → `vercel:next-cache-components`, Next.js App Router 일반(remote image config, Tailwind 통합, local font 멀티파일, 라우팅) → `vercel:nextjs`, Turbopack 설정/디버깅 → `vercel:turbopack`. 이 문서들은 우리 팀이 관리하는 FE knowledge 파일만 다룬다.

## 핵심 원칙
- 코드 철학: "변경하기 쉬운 코드 = 좋은 코드"
- **코드 품질 4대 원칙** (code-quality.md): 가독성, 예측가능성, 응집도, 결합도
- **아키텍처 5 기본 원칙** (architecture.md §1): Colocation · AHA · 단방향 의존성 · Server-First · SRP

## 기술 스택
* **Language**: TypeScript (strict mode)
* **Framework**: React latest, Next.js (App Router)
* **상태 관리**: Zustand (클라이언트), TanStack Query (서버 상태)
* **디자인 시스템**: TDS (Toss Design System) 패턴, shadcn/ui
* **유틸리티**: es-toolkit, overlay-kit, es-hangul
* **빌드**: Turborepo, pnpm
* **테스트**: Vitest, Playwright

## 태스크-지식 매핑

| 태스크 유형 | 판단 기준 | Read할 파일 |
|---|---|---|
| 컴포넌트 작성/수정 | UI 구조·분리·합성이 핵심 | `code-quality.md` + `component-patterns.md` + `react-effects.md` + `design-system.md` + `testing.md` |
| API 연동/데이터 패칭 | fetch·mutation·캐싱이 핵심 | `async-patterns.md` + `data-fetching.md` + `state-management.md` + `error-handling.md` + `testing.md` |
| 상태 관리 설계 | 상태 위치(서버/URL/전역/로컬) 결정 | `state-management.md` + `state-colocation.md` + `react-effects.md` |
| 프로젝트 구조/설계 | 디렉토리·모듈 경계·레이어 분리 | `architecture.md` + `code-quality.md` |
| 테스트 작성 (기본) | 유틸·훅·로직 단위 테스트 | `testing.md` + `testing-vitest-setup.md` + `testing-msw.md` |
| 테스트 작성 (컴포넌트) | 컴포넌트 렌더링·인터랙션 테스트 | `testing.md` + `testing-component-patterns.md` |
| 테스트 작성 (Next.js) | RSC·라우트 핸들러·미들웨어 테스트 | `testing.md` + `testing-nextjs.md` |
| 성능 이슈 — SSR/streaming | Next.js SSR 런타임, `'use client'` 경계, streaming, push-down 패턴 | `performance-ssr.md` + `monitoring.md` |
| 성능 이슈 — React 렌더링 | Compiler, memo/useMemo/useCallback, 가상화, 1ms 룰 | `performance-react-rendering.md` + `monitoring.md` |
| 성능 이슈 — 빌드/번들 | tree-shaking, 코드 스플리팅, `optimizePackageImports`, Turborepo 캐시 | `build-optimization.md` + `ci-cd.md` |
| 이미지/폰트 최적화 | `next/image`·`next/font`·CLS·LCP 방어 | `next-assets.md` |
| 접근성 관련 | 스크린리더·키보드·ARIA·시맨틱 HTML | `accessibility.md` |
| 디자인 시스템/UI | 공통 UI 컴포넌트·토큰·테마 | `design-system.md` + `component-patterns.md` + `styling.md` |
| 폼 구현 | 사용자 입력 수집·유효성 검증·제출 | `forms.md` + `component-patterns.md` + `error-handling.md` + `accessibility.md` + `testing.md` |
| 에러 처리 | Error Boundary·에러 UI·로깅 | `error-handling.md` |
| 라우팅/네비게이션 | URL 구조·페이지 전환·동적 라우트 | `routing.md` |
| 유틸리티/라이브러리 선택 | 외부 패키지 도입·교체 판단 | `libraries.md` |
| TypeScript 설계 | 타입 정의·제네릭·유틸 타입 | `typescript.md` + `code-quality.md` |
| 국제화(i18n) | 다국어·번역 키·로케일 | `i18n.md` |
| SEO | 메타태그·OG·구조화 데이터 | `seo.md` |
| 보안 | XSS·CSRF·인증 토큰 처리 | `security.md` |
| CI/CD/배포 | 빌드 파이프라인·배포 설정 | `ci-cd.md` + `git-workflow.md` |
| 모니터링/분석 | 에러 추적·사용자 행동 수집 | `monitoring.md` + `analytics.md` |
| Server Actions | 서버 mutation·form action·revalidation | `server-actions.md` + `async-patterns.md` + `error-handling.md` + `testing.md` |
| 리팩토링 | 기존 코드 구조 개선 (기능 변경 없음) | `react-effects.md` + `code-quality.md` + `component-patterns.md` + `architecture.md` + `state-management.md` |
| 코드 리뷰 | PR·코드 품질 검토 | `code-review.md` + `code-quality.md` + `react-effects.md` + `accessibility.md` + 리뷰 대상에 따라 관련 파일 추가 참조 |

**복합 태스크**: 여러 유형에 해당하면 관련 행의 파일을 합집합으로 읽는다.
- 새 페이지 개발 → architecture.md + code-quality.md + design-system.md + async-patterns.md + testing.md
- API 연동 폼 → async-patterns.md + data-fetching.md + forms.md + error-handling.md + testing.md

**테스트 파일 선택 가이드**: testing.md는 항상 읽고, 나머지 테스트 파일은 태스크에 맞게 선택적으로 읽는다.
