---
name: ops-lead
description: >
  클라이언트 운영 총괄 도메인 knowledge. 프로젝트 관리, 스프린트 기획, 리소스 배분,
  클라이언트 온보딩/커뮤니케이션, SLA, 에스컬레이션, 콘텐츠 QC/워크플로우,
  KPI 대시보드, 성과 리포팅, 프로세스 최적화, 자동화, 문서화, 미팅 퍼실리테이션,
  운영 전략, 스케일링, 벤더 관리 시 활성화.
  프로젝트 운영, 클라이언트 관리, 프로세스 판단이 필요할 때 사용한다.
  사용자가 스프린트 기획, SLA 모니터링, 에스컬레이션 처리, 리소스 배분,
  클라이언트 미팅, 주간/월간 보고, 온보딩 체크리스트, 콘텐츠 QC를 언급하면
  반드시 이 스킬을 활성화하라. 명시적으로 '운영'이라고 말하지 않더라도
  "일정이 밀리고 있다", "클라이언트가 불만이다" 같은
  프로젝트 조율이나 클라이언트 대응이 필요하면 활성화한다.
---

# Ops-Lead Domain Knowledge

매핑 테이블의 참조 파일에는 검증된 운영 프로세스, SLA 기준, 커뮤니케이션 템플릿이 담겨 있다.
이를 읽지 않으면 기존 프로세스와 충돌하는 판단을 하게 되고, 클라이언트 신뢰를 잃는다.
운영 판단이나 문서 작성 전에 아래 매핑 테이블에서 태스크에 해당하는 파일을 반드시 Read하라.

**기본 경로**: `~/.claude/skills/ops-lead/` — 아래 테이블의 파일명 앞에 이 경로를 붙여서 Read한다.

## 핵심 원칙

- 철학: Excellence Through Systems — 완벽한 시스템과 프로세스를 통해 일관된 품질 보장
- 핵심 원칙: Client-First Mindset, Data-Driven Operations, Continuous Improvement
- 의사결정 기준: "클라이언트에게 어떤 가치를 제공하는가?"
- 안티패턴: 추측 기반 운영, 프로세스 없는 실행, 문제 발생 후 대응

## 태스크-지식 매핑

| 태스크 유형 | 판단 기준 | Read할 파일 |
|---|---|---|
| 프로젝트 킥오프 | 신규 프로젝트 시작·스코프 정의 | `project-planning.md` + `client-communication.md` |
| 스프린트 기획 | 스프린트 목표·태스크 분배 | `agile-methodology.md` + `resource-allocation.md` |
| 위험도 평가 | 리스크 식별·완화 계획 수립 | `risk-management.md` + `escalation-handling.md` |
| 리소스 배분 | 인력·시간·예산 할당 | `resource-allocation.md` + `team-coordination.md` |
| 클라이언트 온보딩 | 신규 클라이언트 셋업·기대치 정렬 | `client-onboarding.md` + `client-communication.md` |
| SLA 모니터링 | 서비스 수준 추적·위반 대응 | `sla-management.md` + `performance-reporting.md` |
| 에스컬레이션 처리 | 이슈 상향·긴급 대응·해결 | `escalation-handling.md` + `client-communication.md` |
| 관계 관리 | 클라이언트 만족도·장기 관계 유지 | `client-communication.md` + `stakeholder-updates.md` |
| 콘텐츠 품질 검수 | 산출물 QC·기준 충족 확인 | `content-qc.md` + `content-workflow.md` |
| 에디토리얼 캘린더 관리 | 콘텐츠 일정·발행 계획 | `editorial-calendar.md` + `content-workflow.md` |
| 콘텐츠 성과 분석 | 콘텐츠 KPI·성과 측정 | `content-performance.md` + `performance-reporting.md` |
| 워크플로우 최적화 | 작업 흐름 개선·병목 제거 | `content-workflow.md` + `process-optimization.md` |
| KPI 대시보드 관리 | 핵심 지표 시각화·추적 | `kpi-dashboards.md` + `performance-reporting.md` |
| 경영진 보고서 작성 | 임원 대상 요약·인사이트 전달 | `executive-summaries.md` + `performance-reporting.md` |
| 성과 분석 리포트 | 기간별 성과 분석·트렌드 | `performance-reporting.md` + `content-performance.md` |
| 프로세스 개선 | 기존 프로세스 효율화·표준화 | `process-optimization.md` + `documentation-standards.md` |
| 자동화 도구 구축 | 반복 작업 자동화·툴 도입 | `automation-tools.md` + `process-optimization.md` |
| 문서화 표준 수립 | 문서 템플릿·작성 기준 정의 | `documentation-standards.md` + `process-optimization.md` |
| 미팅 퍼실리테이션 | 회의 운영·어젠다·액션 아이템 | `meeting-facilitation.md` + `stakeholder-updates.md` |
| 이해관계자 소통 | 내외부 커뮤니케이션·업데이트 | `stakeholder-updates.md` + `client-communication.md` |
| 팀 조율 | 팀 간 협업·블로커 해결 | `team-coordination.md` + `resource-allocation.md` |
| 운영 전략 수립 | 운영 방향성·체계 설계 | `operational-strategy.md` + `scaling-operations.md` |
| 스케일링 계획 | 성장 대비 운영 확장 계획 | `scaling-operations.md` + `resource-allocation.md` |
| 벤더 관리 | 외부 파트너·계약·성과 관리 | `vendor-management.md` + `sla-management.md` |

**복합 태스크**: 여러 유형에 해당하면 관련 행의 파일을 합집합으로 읽는다.
- 새 클라이언트 프로젝트 → project-planning.md + client-onboarding.md + client-communication.md + resource-allocation.md + risk-management.md
- 분기 성과 보고 → performance-reporting.md + executive-summaries.md + kpi-dashboards.md + content-performance.md
