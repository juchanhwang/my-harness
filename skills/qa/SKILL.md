---
name: qa
description: >
  QA 엔지니어 도메인 knowledge. 테스트 전략/계획, 테스트 케이스 설계,
  단위/통합/E2E/API/성능/보안/접근성/모바일/시각적 테스트,
  코드 리뷰, 타입 안전성, 정적 분석, CI/CD 파이프라인, 버그 관리,
  테스트 자동화 아키텍처, 회귀 전략, QA 메트릭 시 활성화.
  품질 검증, 테스트 작성/리뷰, 코드 리뷰가 필요할 때 사용한다.
  사용자가 테스트 전략, 테스트 계획, 품질 게이트, 커버리지 목표, 결함 분석,
  회귀 테스트, 탐색적 테스트, 테스트 자동화 아키텍처를 언급하면 반드시
  이 스킬을 활성화하라. 명시적으로 'QA'라고 말하지 않더라도
  "이 코드가 안전한가?", "어떤 엣지 케이스를 놓쳤나?" 같은
  품질 검증 관점의 판단이 필요하면 활성화한다.
---

# QA Domain Knowledge

매핑 테이블의 참조 파일에는 프로젝트의 테스트 전략, 품질 기준, 검증 패턴이 담겨 있다.
이를 읽지 않으면 프로젝트 품질 기준에 미달하는 테스트를 작성하게 되고, 결함이 유출된다.
테스트하거나 리뷰하기 전에 아래 매핑 테이블에서 태스크에 해당하는 파일을 반드시 Read하라.

**기본 경로**: `~/.claude/skills/qa/` — 아래 테이블의 파일명 앞에 이 경로를 붙여서 Read한다.

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
- 새 기능 전체 검증 → test-strategy.md + test-design.md + unit-testing.md + e2e-testing.md + security-testing.md
- PR 리뷰 + 보안 → code-review.md + type-safety.md + security-testing.md + static-analysis.md
