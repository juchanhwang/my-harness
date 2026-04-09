---
name: qa
description: >
  Use when QA/품질 검증 판단이 필요한 상황 — 테스트 전략/계획 수립, 테스트
  케이스 설계, 단위/통합/E2E/API/성능/보안/접근성/모바일/시각적 테스트
  작성·리뷰, 코드 리뷰(엣지 케이스/보안/검증 완전성 관점), 타입 안전성
  설계, 정적 분석 도구 설정, CI/CD 파이프라인 품질 게이트, 버그 트리아지·결함
  분석, 테스트 자동화 아키텍처, 회귀 전략, QA 메트릭(DRE, Escape Rate 등)
  관련 의사결정이 필요한 상황. 사용자가 명시적으로 'QA'라고 말하지 않더라도
  "이 코드가 안전한가?", "어떤 엣지 케이스를 놓쳤나?", "이 PR을 머지해도
  되나?", "커버리지 목표를 얼마로 잡아야 하나?" 같은 품질 관점의 판단이
  필요하면 반드시 활성화한다.
---

# QA Domain Knowledge

매핑 테이블의 참조 파일에는 프로젝트의 테스트 전략, 품질 기준, 검증 패턴이 담겨 있다.
이를 읽지 않으면 프로젝트 품질 기준에 미달하는 테스트를 작성하게 되고, 결함이 유출된다.
테스트하거나 리뷰하기 전에 아래 매핑 테이블에서 태스크에 해당하는 파일을 반드시 Read하라.

**기본 경로**: `~/.claude/skills/qa/` — 아래 테이블의 파일명 앞에 이 경로를 붙여서 Read한다.

> 📎 **일부 주제는 vercel 플러그인 스킬과 겹친다.** 아래 주제에 해당하는 작업은 qa 파일과 함께 `vercel:*` 스킬도 참고하라. qa 파일은 **테스트 전략·품질 판단·리뷰 관점**을 다루고, vercel 스킬은 **구현 디테일·공식 API·Vercel 플랫폼 고유 동작**을 다룬다. 중복 로드를 피하려면 역할 분담을 따른다.
>
> | 주제 | 참조할 vercel 스킬 |
> |---|---|
> | Vercel 배포 CI/CD, GitHub Actions 워크플로우, `vercel deploy --prebuilt`, 배포 전 품질 게이트 | `vercel:deployments-cicd` |
> | Next.js 풀스택 동작 검증 (dev server → API → DB → 응답), "왜 안 돌아가는지" 디버깅 | `vercel:verification` |
> | React/Next.js 컴포넌트 품질 리뷰 체크리스트 (hooks 사용, 접근성, 성능, TypeScript) | `vercel:react-best-practices` |
> | Turbopack 빌드 이슈·번들 디버깅 | `vercel:turbopack` |
> | Next.js 버전 업그레이드 검증, 마이그레이션 codemods | `vercel:next-upgrade` |
> | Vercel Sandbox에서 테스트 코드 격리 실행 | `vercel:vercel-sandbox` |

## 핵심 원칙

- 철학: "작동한다"와 "올바르다"는 전혀 다르다. 버그가 태어나지 못하는 시스템을 구축한다
- Quality Engineering 4대 원칙: 예방 > 감지, 자동화 우선, 리스크 기반, 시프트 레프트
- 테스트 스택: Vitest, Playwright, MSW, Storybook + Chromatic
- 우선순위: 비즈니스 임팩트 > 변경 빈도 > 복잡도
- 안티패턴: Happy path만 테스트, 수동 회귀 테스트, "테스트는 나중에", 구현 세부사항 테스트

## 태스크-지식 매핑

| 태스크 유형 | 판단 기준 | Read할 파일 |
|---|---|---|
| PR 코드 리뷰 | PR 변경사항의 품질·안전성 검증 | `code-review.md` + `type-safety.md` + `static-analysis.md` + `security-testing.md` |
| 테스트 전략 수립 | 프로젝트/기능 전체 테스트 방향 결정 | `test-strategy.md` + `test-planning.md` + `regression-strategy.md` |
| 테스트 케이스 설계 | 개별 시나리오·엣지 케이스 도출 | `test-design.md` + `exploratory-testing.md` |
| 단위 테스트 작성/리뷰 | 함수·훅·모듈 단위 격리 테스트 | `unit-testing.md` + `test-automation-architecture.md` |
| 통합 테스트 작성/리뷰 | 모듈 간 연동·API·DB 통합 검증 | `integration-testing.md` + `api-testing.md` + `database-testing.md` |
| E2E 테스트 작성/리뷰 | 사용자 시나리오 전체 흐름 검증 | `e2e-testing.md` + `visual-testing.md` |
| API 테스트 | endpoint 요청/응답·계약 검증 | `api-testing.md` + `integration-testing.md` |
| 성능 테스트 | 응답 시간·부하·스트레스 검증 | `performance-testing.md` |
| 보안 리뷰 | 취약점·인증·권한 검증 | `security-testing.md` + `code-review.md` |
| CI/CD 파이프라인 | 빌드·테스트·배포 자동화 설정 | `ci-cd-testing.md` + `test-environments.md` |
| 접근성 검증 | a11y 기준 충족 여부 검증 | `accessibility-testing.md` |
| 모바일 테스트 | 모바일 디바이스·반응형 검증 | `mobile-testing.md` |
| 버그 트리아지 | 결함 분류·우선순위·재현 | `bug-management.md` + `qa-metrics.md` |
| QA 프로세스 개선 | 품질 프로세스·메트릭·자동화 개선 | `qa-leadership.md` + `qa-metrics.md` + `regression-strategy.md` |

**복합 태스크**: 여러 유형에 해당하면 관련 행의 파일을 합집합으로 읽는다.

### 일반 시나리오
- **새 기능 전체 검증** → test-strategy.md + test-design.md + unit-testing.md + e2e-testing.md + security-testing.md
- **PR 리뷰 + 보안 관점** → code-review.md + type-safety.md + security-testing.md + static-analysis.md

### 특화 시나리오
- **레거시 코드 리팩토링 안전망 구축** → test-strategy.md + regression-strategy.md + test-automation-architecture.md + integration-testing.md
  - *리팩토링 전에 통합 테스트로 현재 동작을 고정하고, 회귀 전략으로 안전망을 구축한다.*
- **성능 회귀 방지 파이프라인** → performance-testing.md + ci-cd-testing.md + qa-metrics.md
  - *CI에 성능 budget 게이트 추가, Core Web Vitals 추이 모니터링. 실제 배포는 `vercel:deployments-cicd`도 함께 참조.*
- **신규 API endpoint 품질 게이트** → api-testing.md + integration-testing.md + security-testing.md + code-review.md
  - *contract test + DB 통합 test + OWASP API Top 10 검증 + PR 리뷰.*
- **모바일 출시 전 품질 검증** → mobile-testing.md + accessibility-testing.md + e2e-testing.md + performance-testing.md
  - *디바이스 매트릭스, a11y, Lighthouse mobile profile.*
- **장애 후 재발 방지** → regression-strategy.md + qa-metrics.md + bug-management.md + test-design.md
  - *5 Whys → 재현 테스트 작성 → 회귀 suite 편입 → DER/MTTR 추적.*
- **테스트 전략 팀 온보딩** → test-strategy.md + test-planning.md + qa-leadership.md + qa-metrics.md
  - *피라미드/트로피 합의 → 테스트 계획서 → 프로세스 가이드 → 측정 기준.*
- **보안 감사 대응 (PCI-DSS, SOC2 등)** → security-testing.md + qa-metrics.md + ci-cd-testing.md + test-environments.md
  - *OWASP 증빙 + 감사 메트릭 + 보안 파이프라인 + 격리 환경.*
- **Flaky E2E 테스트 안정화** → e2e-testing.md + test-automation-architecture.md + qa-metrics.md
  - *플레이키 원인 분석 → 격리 전략 → pass rate 메트릭 추적. Next.js 관련 검증은 `vercel:verification` 참조.*
