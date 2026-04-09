# my-harness

Claude Code 개인 하네스 설정 저장소.

에이전트, 스킬, 커맨드, 훅, 플러그인, 글로벌 설정을 포함한다.

## 구조

```
my-harness/
├── agents/          # 서브 에이전트 정의 (18개)
├── skills/          # 스킬 정의 (15개, 도메인 스킬 7개 포함, 참조 파일 148개)
├── commands/        # 슬래시 커맨드 (2개)
├── hooks/           # 이벤트 훅 스크립트 (4개)
├── bin/             # CLI 커맨드 (1개)
├── CLAUDE.md        # 글로벌 지침
├── settings.json    # Claude Code 설정
└── keybindings.json # 키 바인딩
```

## 에이전트 (18)

[oh-my-opencode](https://github.com/anthropics/oh-my-opencode)의 에이전트 시스템을 벤치마킹하여 구성했다.

### 코어 에이전트

| 파일 | 모델 | 설명 |
|---|---|---|
| `orchestrator.md` | opus | 메인 진입점. 탐색→위임→검증 루프 조율 |
| `planner.md` | opus | 전략적 작업 계획 수립 (구현 없음) |
| `pre-planner.md` | opus | 사전 요구사항 분석, 모호성 식별 |
| `plan-reviewer.md` | opus | 계획 검토 및 검증 |
| `oracle.md` | opus | 아키텍처 설계, 고난이도 디버깅 컨설팅 |
| `analyzer.md` | opus | 코드베이스 분석 (read-only) |
| `deep-worker.md` | opus | 자율 심층 작업, 목표 지향 실행 |
| `librarian.md` | opus | 외부 문서/OSS 검색, 공식 문서 참조 |
| `delegator.md` | sonnet | 범용 작업 위임 및 조율 |
| `search.md` | haiku | 빠른 팩트 조회, 파일/경로 검색 |
| `media-reader.md` | sonnet | PDF, 이미지 등 미디어 파일 해석 |

### 도메인 전문가 에이전트

| 파일 | 모델 | 설명 |
|---|---|---|
| `fe-dev.md` | opus | 시니어 프론트엔드 엔지니어 (React/Next.js, TypeScript) |
| `be-dev.md` | opus | 시니어 백엔드 엔지니어 (Node.js, PostgreSQL, API 설계) |
| `designer.md` | sonnet | 시니어 프로덕트 디자이너 (UI/UX, 디자인 시스템) |
| `po.md` | sonnet | 시니어 프로덕트 오너 (제품 전략, PRD, 로드맵) |
| `qa.md` | sonnet | 시니어 QA 엔지니어 (테스트 전략, 자동화, 보안) |
| `ops-lead.md` | opus | 클라이언트 운영 총괄 (프로젝트 관리, CI/CD) |
| `data-analyst.md` | opus | 시니어 데이터 애널리스트 (SQL, 퍼널/코호트 분석) |

## 스킬 (15)

### 도메인 스킬 (7)

도메인 전문가 에이전트의 지식 베이스. 각 스킬은 `SKILL.md`(진입점 + 태스크-지식 매핑)와 도메인별 참조 파일로 구성된다. `SKILL.md`는 Claude Code가 트리거 조건을 판단할 때 읽고, 참조 파일은 에이전트가 태스크-지식 매핑 테이블에 따라 on-demand로 Read한다.

| 스킬 | 역할 | 참조 파일 |
|---|---|---|
| `be` | 백엔드 — Node.js/TS, PostgreSQL/Drizzle, Redis, BullMQ, Fastify 5 / NestJS 11 variant | 44개 |
| `fe` | 프론트엔드 — React/Next.js, 상태 관리, 성능, 테스트, 접근성 | 32개 |
| `po` | 프로덕트 오너 — 비전/전략, PRD, 우선순위, 사용자 리서치, 성장 | 24개 |
| `designer` | 디자인 — UI/UX, 디자인 시스템, 토큰, 접근성, 리서치 | 24개 |
| `qa` | QA — 테스트 전략, 자동화, 성능/보안/접근성 테스트, 정적 분석 | 24개 |
| `ops-lead` | 운영 — 프로젝트 관리, 클라이언트, SLA, 프로세스 최적화 | *SKILL.md only* |
| `data-analyst` | 데이터 — SQL, 퍼널/코호트 분석, A/B 테스트, 대시보드 | *SKILL.md only* |

> **ops-lead / data-analyst 공개 정책**: 이 두 스킬은 공개 repo에 `SKILL.md`만 트랙한다. 참조 파일은 로컬(`~/.claude/skills/`)에만 존재한다.

<details>
<summary><b><code>be</code> 참조 파일 (44) — framework-agnostic 25 + Fastify 7 + NestJS 12</b></summary>

#### Framework-agnostic (`be/`) — 25 files

**API & Architecture**

| 파일 | 역할 |
|---|---|
| `architecture.md` | 레이어드 아키텍처·서비스 계층·이벤트 기반 설계 |
| `api-design.md` | REST/gRPC·리소스 모델링·페이지네이션·버저닝 |
| `system-design.md` | 시스템 설계·리버스 프록시·로드 밸런서 |
| `microservices.md` | 서비스 분해·API Gateway·서비스 간 통신 |
| `distributed-systems.md` | 합의·서비스 디스커버리·idempotency |

**Data Layer**

| 파일 | 역할 |
|---|---|
| `database.md` | 트랜잭션·격리 수준·커넥션 풀 |
| `postgresql.md` | PostgreSQL 고유 기능·인덱스·쿼리 튜닝 |
| `drizzle-orm.md` | Drizzle schema·쿼리 빌더·관계 정의 |
| `data-patterns.md` | Event Sourcing·CQRS·Saga |
| `domain-driven-design.md` | Aggregate·Repository·Bounded Context |

**Runtime & Performance**

| 파일 | 역할 |
|---|---|
| `nodejs-internals.md` | V8·Event Loop·GC |
| `concurrency.md` | Worker Threads·Cluster·비동기 처리 |
| `performance.md` | 프로파일링·메모리 누수 진단 |
| `caching.md` | Redis·CDN·Cache-aside |
| `networking.md` | HTTP/2·DNS·TLS |

**Reliability & Operations**

| 파일 | 역할 |
|---|---|
| `resilience.md` | Circuit Breaker·Retry 패턴 (이론) |
| `error-handling.md` | 에러 분류·AppError 계층 (이론) |
| `observability.md` | Pino·OpenTelemetry (이론) |
| `debugging.md` | Heap snapshot·프로파일링 |
| `security.md` | 인증·XSS·Rate Limiting (이론, app-level) |
| `deployment.md` | 배포·환경 변수·헬스체크 |
| `message-queues.md` | BullMQ·Worker·Pub/Sub (core) |

**Process & Cost**

| 파일 | 역할 |
|---|---|
| `testing.md` | Vitest·테스트 전략 (이론) |
| `cost-optimization.md` | 클라우드 비용 절감·리소스 최적화 |
| `technical-leadership.md` | 기술 리더십·의사결정 프로세스 |

#### Fastify variant (`be/fastify/`) — 7 files

| 파일 | 역할 |
|---|---|
| `architecture.md` | Plugin 기반 아키텍처·encapsulation |
| `api-design.md` | Route 등록·JSON Schema·hooks |
| `error-handling.md` | `setErrorHandler`·onError·onResponse |
| `observability.md` | Fastify + Pino logger 설정·request hooks |
| `resilience.md` | Graceful shutdown·onClose hook |
| `security.md` | `@fastify/jwt`·`@fastify/rate-limit`·`@fastify/helmet` |
| `testing.md` | `app.inject()` 통합 테스트 |

#### NestJS variant (`be/nestjs/`) — 12 files

| 파일 | 역할 |
|---|---|
| `architecture.md` | Module·DI Container·Layered structure |
| `providers-di.md` | `@Injectable`·Scope·Custom Provider |
| `controllers.md` | `@Controller`·`@Get/Post`·Guards·Interceptors |
| `request-lifecycle.md` | Middleware → Guard → Interceptor → Pipe → Filter |
| `validation.md` | class-validator·DTO·ValidationPipe |
| `error-handling.md` | `@Catch`·ExceptionFilter·HttpException |
| `observability.md` | nestjs-pino·`@nestjs/terminus`·OpenTelemetry |
| `lifecycle-shutdown.md` | `OnModuleDestroy`·`enableShutdownHooks` |
| `drizzle-integration.md` | Drizzle을 NestJS Provider로 등록 |
| `microservices.md` | `@nestjs/microservices`·Transport·Pattern |
| `swagger.md` | `@nestjs/swagger`·OpenAPI 자동 생성 |
| `testing.md` | `Test.createTestingModule`·E2E with `supertest` |

</details>

<details>
<summary><b><code>fe</code> 참조 파일 (32)</b></summary>

**Architecture & Code Quality**

| 파일 | 역할 |
|---|---|
| `architecture.md` | 레이어·모듈 경계·단방향 의존성·Server-First |
| `code-quality.md` | 가독성·예측가능성·응집도·결합도 (4대 원칙) |
| `code-review.md` | PR 리뷰 체크리스트·품질 기준 |
| `typescript.md` | 타입 정의·제네릭·유틸 타입 |

**Components & UI**

| 파일 | 역할 |
|---|---|
| `component-patterns.md` | 합성·분리·상태 hoisting·경계 |
| `design-system.md` | TDS 패턴·공통 컴포넌트·variants |
| `styling.md` | Tailwind·CSS Module·스타일 가이드 |
| `forms.md` | 입력·검증·`ActionResult<T>`·Zod |
| `react-effects.md` | `useEffect`·deps·cleanup·안티패턴 |

**Data & State**

| 파일 | 역할 |
|---|---|
| `state-management.md` | Zustand·TanStack Query·URL (nuqs) |
| `state-colocation.md` | 상태 위치 결정·lift/colocate |
| `async-patterns.md` | 비동기 흐름·race condition·취소 |
| `data-fetching.md` | fetch·mutation·캐싱 전략 |
| `error-handling.md` | Error Boundary·에러 UI·로깅 |

**Performance**

| 파일 | 역할 |
|---|---|
| `performance-react-rendering.md` | React Compiler·memo·가상화·1ms 룰 |
| `performance-ssr.md` | Next.js SSR 런타임·streaming·`'use client'` 경계 |
| `build-optimization.md` | tree-shaking·code splitting·Turborepo 캐시 |
| `next-assets.md` | `next/image`·`next/font`·CLS·LCP |

**Testing**

| 파일 | 역할 |
|---|---|
| `testing.md` | 테스트 전략 개요 (항상 선행 Read) |
| `testing-vitest-setup.md` | Vitest 기본 설정·유틸 |
| `testing-component-patterns.md` | 컴포넌트 렌더링·인터랙션 |
| `testing-msw.md` | MSW 기반 네트워크 모킹 |
| `testing-nextjs.md` | RSC·라우트 핸들러·미들웨어 테스트 |

**Operations**

| 파일 | 역할 |
|---|---|
| `ci-cd.md` | 빌드 파이프라인·품질 게이트 |
| `git-workflow.md` | 브랜치 전략·PR 프로세스 |
| `monitoring.md` | 에러 추적·Web Vitals |
| `analytics.md` | 사용자 행동·이벤트 트래킹 |
| `libraries.md` | 외부 패키지 도입 판단·교체 |

**Quality & Other**

| 파일 | 역할 |
|---|---|
| `accessibility.md` | 스크린리더·ARIA·키보드 네비게이션 |
| `security.md` | XSS·CSRF·인증 토큰 처리 |
| `seo.md` | 메타태그·OG·구조화 데이터 |
| `i18n.md` | 다국어·번역 키·로케일 |

</details>

<details>
<summary><b><code>po</code> 참조 파일 (24 + <code>evals/</code>)</b></summary>

**Vision & Strategy**

| 파일 | 역할 |
|---|---|
| `product-vision.md` | 장기 방향성·미션·핵심 가치 |
| `product-strategy.md` | 전략·포지셔닝·차별화 |
| `market-research.md` | 시장 규모·트렌드 조사 |
| `competitive-intelligence.md` | 경쟁사 분석·벤치마킹 |

**Discovery & Research**

| 파일 | 역할 |
|---|---|
| `product-discovery.md` | 솔루션 검증·가설 테스트 |
| `user-research.md` | 인터뷰·설문·행동 데이터 |
| `ux-principles.md` | 사용성 원칙·UX 휴리스틱 |

**Planning & Prioritization**

| 파일 | 역할 |
|---|---|
| `prd-writing.md` | PRD 템플릿·AC·스펙 문서화 |
| `prioritization.md` | RICE/ICE·백로그 정렬 |
| `roadmap.md` | 분기/연간 계획·마일스톤 |
| `decision-making.md` | 트레이드오프·Go/No-Go |
| `backlog-management.md` | 백로그 구조·그루밍 |

**Execution**

| 파일 | 역할 |
|---|---|
| `sprint-planning.md` | 스프린트 계획·회고 |
| `cross-functional.md` | 팀 간 협업 패턴 |
| `stakeholder-management.md` | 경영진·내외부 이해관계자 |

**Growth & Metrics**

| 파일 | 역할 |
|---|---|
| `growth.md` | AARRR·획득·활성화·리텐션 |
| `metrics.md` | KPI·North Star·OKR |
| `ab-testing.md` | 실험 설계·가설·성공 기준 |
| `analytics.md` | 이벤트 트래킹·분석 설계 |

**Leadership & Business**

| 파일 | 역할 |
|---|---|
| `product-leadership.md` | 팀 빌딩·문화·코칭 |
| `communication.md` | 제품 커뮤니케이션 기법 |
| `business-model.md` | 수익 구조·가격·단위 경제학 |
| `startup-operations.md` | 초기 제품·PMF·린 실행 |

**Reference**

| 파일 | 역할 |
|---|---|
| `case-studies.md` | 유사 제품·업계 사례 벤치마크 |
| `evals/evals.json` | skill-creator 트리거 eval 세트 |

</details>

<details>
<summary><b><code>designer</code> 참조 파일 (24)</b></summary>

**Foundations (Visual)**

| 파일 | 역할 |
|---|---|
| `color-theory.md` | 색상 팔레트·대비·의미 체계 |
| `typography.md` | 타입 스케일·행간·계층 |
| `layout-grid.md` | 그리드·정렬·여백 시스템 |
| `responsive-design.md` | 브레이크포인트·모바일 우선 |

**Design System**

| 파일 | 역할 |
|---|---|
| `design-system.md` | shadcn/ui·Radix·토큰 기반 |
| `design-tokens.md` | Color·Spacing·Radius·Motion 토큰 |
| `shadcn-patterns.md` | shadcn 컴포넌트 합성·커스텀 |
| `component-design.md` | 개별 컴포넌트·variants·상태 |

**Interaction & Flow**

| 파일 | 역할 |
|---|---|
| `interaction-design.md` | 애니메이션·전환·마이크로인터랙션 |
| `user-flows.md` | 태스크 플로우·결정 분기 |
| `wireframing.md` | 저해상도 구조·스케치 |
| `information-architecture.md` | 정보 구조·네비게이션 체계 |

**Forms & UX Writing**

| 파일 | 역할 |
|---|---|
| `form-design.md` | 필드·유효성·에러 메시지 |
| `ux-writing.md` | 마이크로카피·톤앤매너 |
| `design-critique.md` | 디자인 리뷰·품질 평가 |

**Research & Process**

| 파일 | 역할 |
|---|---|
| `ux-research.md` | 유저 리서치·인사이트 도출 |
| `design-process.md` | 디자인 프로세스·이터레이션 |
| `design-principles.md` | 디자인 원칙·판단 기준 |

**Accessibility & Inclusion**

| 파일 | 역할 |
|---|---|
| `accessibility.md` | WCAG·ARIA·키보드·스크린리더 |
| `inclusive-design.md` | 포용 디자인·다양성 고려 |

**Specialized**

| 파일 | 역할 |
|---|---|
| `data-visualization.md` | 차트·테이블·데이터 표현 |
| `ai-design.md` | AI 인터랙션·프롬프트 UI·피드백 |

**Handoff & Leadership**

| 파일 | 역할 |
|---|---|
| `developer-handoff.md` | 스펙 전달·구현 가이드 |
| `design-leadership.md` | 디자인 팀 운영·문화 |

</details>

<details>
<summary><b><code>qa</code> 참조 파일 (24)</b></summary>

**Strategy & Planning**

| 파일 | 역할 |
|---|---|
| `test-strategy.md` | 테스트 피라미드/트로피·커버리지 목표 |
| `test-planning.md` | 테스트 계획서·스코프·일정 |
| `test-design.md` | 케이스 설계·엣지 케이스 도출 |
| `regression-strategy.md` | 회귀 스위트·우선순위 |

**Unit & Integration**

| 파일 | 역할 |
|---|---|
| `unit-testing.md` | 함수·훅·모듈 단위 격리 |
| `integration-testing.md` | 모듈 간 연동·API·DB |
| `test-automation-architecture.md` | 테스트 자동화 구조·DRY·유지보수 |

**E2E & Exploratory**

| 파일 | 역할 |
|---|---|
| `e2e-testing.md` | Playwright·사용자 시나리오 |
| `visual-testing.md` | 시각적 회귀 테스트 (Chromatic) |
| `exploratory-testing.md` | 휴리스틱·세션 기반 탐색 |

**Specialized Testing**

| 파일 | 역할 |
|---|---|
| `api-testing.md` | endpoint·계약 검증·contract test |
| `database-testing.md` | 스키마·마이그레이션·seed |
| `performance-testing.md` | 부하·스트레스·Core Web Vitals |
| `security-testing.md` | OWASP·취약점·인증/권한 |
| `accessibility-testing.md` | a11y 자동/수동 검증 |

**Platform & Environment**

| 파일 | 역할 |
|---|---|
| `mobile-testing.md` | 디바이스 매트릭스·반응형 |
| `ci-cd-testing.md` | 빌드·테스트 파이프라인·품질 게이트 |
| `test-environments.md` | 격리·seed·환경 동기화 |

**Code Quality & Review**

| 파일 | 역할 |
|---|---|
| `code-review.md` | PR 리뷰 체크리스트 (QA 관점) |
| `type-safety.md` | TypeScript strict·타입 설계 |
| `static-analysis.md` | ESLint·SonarQube·SAST 설정 |

**Operations**

| 파일 | 역할 |
|---|---|
| `bug-management.md` | 트리아지·우선순위·재현 |
| `qa-metrics.md` | DRE·Escape Rate·MTTR |
| `qa-leadership.md` | QA 프로세스·팀 운영 |

</details>

### 범용 스킬 (7)

| 스킬 | 역할 |
|---|---|
| `commit-convention` | Conventional Commits + Tim Pope + Chris Beams 기반 Git 커밋 컨벤션 |
| `find-skills` | `npx skills` CLI로 오픈 스킬 생태계 검색 및 설치 지원 |
| `mcp-builder` | MCP(Model Context Protocol) 서버 설계 및 구축 가이드 (Python/Node) |
| `pdf` | PDF 읽기·병합·분할·워터마크·폼 작성·OCR 등 전방위 PDF 처리 |
| `pptx` | PPTX 읽기·생성·편집·템플릿 작업 (markitdown + pptxgenjs 기반) |
| `remotion-best-practices` | Remotion(React 비디오) 개발 베스트 프랙티스 (30개+ 규칙) |
| `web-design-guidelines` | Vercel Web Interface Guidelines 기반 UI 접근성·UX 가이드 |

> React/Next.js 성능 규칙은 vercel 플러그인의 `vercel:react-best-practices` 스킬로 통합되어 standalone 스킬은 제거했다 (플러그인 버전은 자동 트리거와 shadcn 체이닝 지원).

## 플러그인 (10)

`settings.json`의 `enabledPlugins`에 선언. Claude Code가 자동으로 설치/업데이트한다.

| 플러그인 | 용도 |
|---|---|
| `superpowers` | 스킬 시스템 자동 평가/활성화 |
| `context7` | 라이브러리 공식 문서 실시간 검색 |
| `code-review` | 멀티 에이전트 기반 PR 코드 리뷰 |
| `feature-dev` | 탐색→설계→구현→리뷰 기능 개발 워크플로우 |
| `frontend-design` | 고품질 프론트엔드 UI/UX 디자인 |
| `skill-creator` | 스킬 생성·테스트·평가·개선 루프 |
| `typescript-lsp` | TypeScript LSP 연동 (타입 진단, 자동 완성) |
| `playwright` | Playwright 브라우저 자동화 테스트 |
| `github` | GitHub MCP 서버 (이슈·PR·레포 관리) |
| `vercel` | Vercel 플랫폼 연동 (배포, 로그, 환경 변수) |

## 커맨드 (2)

| 커맨드 | 설명 |
|---|---|
| `/init-deep` | 계층적 CLAUDE.md 자동 생성 |
| `/ulw-loop` | Oracle 검증 기반 자기 참조 개발 루프 |

## 훅 (4)

| 훅 | 이벤트 | 역할 |
|---|---|---|
| `claude-remote-notification.sh` | `Notification` | 원격 알림 전송 |
| `claude-remote-session-start.sh` | `SessionStart` | 세션 시작 알림 |
| `claude-remote-stop.sh` | `Stop` | 세션 종료 알림 |
| `notify.sh` | `Notification`, `Stop` | macOS 로컬 알림 |

## CLI (bin/)

`~/bin/`에 심링크하여 터미널 어디서든 사용할 수 있는 CLI 커맨드.

### claude-team

에이전트 팀을 즉시 생성하는 래퍼 스크립트. `--append-system-prompt`로 팀 생성을 강제한다.

```bash
claude-team [team-type] ["작업 설명"]
```

| 팀 타입 | 구성 |
|---|---|
| `full` | 전체팀 (7명: PO + Designer + FE + BE + QA + OPS + DA) |
| `prod` | 프로덕션팀 (5명: PO + Designer + FE + BE + QA) |
| `dev` | 개발팀 (5명: FE + BE + QA + OPS + DA) |

```bash
# 개발팀 생성 + 작업 할당
claude-team dev "새로운 기능 개발"

# 프로덕션팀 생성 (작업 대기)
claude-team prod
```

설치:

```bash
ln -sf ~/Documents/FE/my-harness/bin/claude-team ~/bin/claude-team
```

## 사용법

설치 후 `--agent` 플래그로 에이전트를 지정해서 Claude Code를 실행한다.

**오케스트레이터 (권장)**

```bash
claude --agent orchestrator
```

탐색→위임→검증 루프를 자동으로 수행하는 메인 에이전트. 대부분의 작업에 이걸 쓰면 된다.

**플래너**

```bash
claude --agent planner
```

구현 없이 작업 계획만 수립한다. 복잡한 태스크의 설계/분석 단계에서 사용.

**에이전트 팀**

```bash
claude-team dev "작업 설명"
```

도메인 전문가 에이전트들을 팀으로 구성하여 협업. 자세한 내용은 위의 [CLI (bin/)](#cli-bin) 참조.

## 환경 변수

원격 훅 스크립트가 API 키를 사용한다. 사용 전 환경 변수를 설정해야 한다.

```bash
export CLAUDE_REMOTE_API_KEY="your-actual-api-key"
```

셸 프로필(`~/.zshrc` 등)에 추가하면 영구 적용된다.
