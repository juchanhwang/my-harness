---
name: po
description: >
  프로덕트 오너 도메인 knowledge. 제품 비전/전략 수립, PRD 작성, 우선순위 결정(RICE/ICE),
  로드맵, 사용자 리서치, 시장/경쟁 분석, 성장 전략, A/B 테스트 설계, 비즈니스 모델,
  이해관계자 관리, 스프린트 운영, 의사결정 시 활성화.
  제품 기획, 전략 판단, 사용자 문제 정의가 필요할 때 사용한다.
  사용자가 PRD, 우선순위 스코어링, 로드맵, 사용자 인터뷰, 실험 설계, OKR,
  user story, acceptance criteria, 기능 백로그를 언급하면 반드시 이 스킬을 활성화하라.
  명시적으로 '프로덕트'라고 말하지 않더라도 "이 기능을 만들어야 하나?",
  "뭘 먼저 해야 하나?" 같은 제품 의사결정이 필요하면 활성화한다.
---

# PO Domain Knowledge

매핑 테이블의 참조 파일에는 검증된 프레임워크, 의사결정 기준, 사례가 담겨 있다.
이를 읽지 않으면 근거 없는 직감 기반 의사결정을 하게 되고, 팀의 신뢰를 잃는다.
기획하거나 의사결정하기 전에 아래 매핑 테이블에서 태스크에 해당하는 파일을 반드시 Read하라.

**기본 경로**: `~/.claude/skills/po/` — 아래 테이블의 파일명 앞에 이 경로를 붙여서 Read한다.

## 핵심 원칙

- 철학: "기능을 만드는 사람"이 아니라 "문제를 해결하는 사람"
- Product Thinking 4대 원칙: 사용자 중심, 데이터 기반 의사결정, 임팩트 중심, 지속적 발견
- 우선순위: RICE/ICE 프레임워크 기반, 임팩트 크기로 결정
- Empowered Product Team: 솔루션이 아닌 문제를 할당받는다
- 안티패턴: Feature factory, 요청 순서 기반 우선순위, 직감 기반 의사결정, output과 outcome 혼동

## 태스크-지식 매핑

| 태스크 유형 | 판단 기준 | Read할 파일 |
|---|---|---|
| 제품 비전 수립 | 장기 방향성·미션·핵심 가치 정의 | `product-vision.md` + `product-strategy.md` |
| PRD 작성 | 기능 요구사항·스펙·AC 문서화 | `prd-writing.md` + `user-research.md` + `metrics.md` |
| 우선순위 결정 | RICE/ICE 스코어링·백로그 정렬 | `prioritization.md` + `metrics.md` + `decision-making.md` |
| 로드맵 수립 | 분기/연간 계획·마일스톤 설정 | `roadmap.md` + `product-strategy.md` + `stakeholder-management.md` |
| 사용자 조사 | 인터뷰·설문·행동 데이터 분석 | `user-research.md` + `product-discovery.md` + `ux-principles.md` |
| 시장 분석 | 경쟁사·시장 규모·포지셔닝 | `market-research.md` + `competitive-intelligence.md` + `product-strategy.md` |
| 성장 전략 | 획득·활성화·리텐션·수익 전략 | `growth.md` + `metrics.md` + `ab-testing.md` |
| 비즈니스 모델 | 수익 구조·가격·단위 경제학 | `business-model.md` + `product-strategy.md` + `metrics.md` |
| 이해관계자 관리 | 경영진·팀 간 기대치·커뮤니케이션 | `stakeholder-management.md` + `communication.md` + `cross-functional.md` |
| 실험 설계 | A/B 테스트·가설·성공 기준 설정 | `ab-testing.md` + `product-discovery.md` + `analytics.md` |
| 스프린트 운영 | 백로그 관리·스프린트 계획·회고 | `sprint-planning.md` + `backlog-management.md` |
| 의사결정 | 트레이드오프 분석·Go/No-Go 판단 | `decision-making.md` + `prioritization.md` |
| 스타트업 전략 | 초기 제품·PMF·린 실행 | `startup-operations.md` + `product-vision.md` + `business-model.md` |
| 사례 참고 | 유사 제품·업계 사례 벤치마크 | `case-studies.md` + 관련 도메인 파일 |
| 제품 리더십 | 팀 빌딩·문화·크로스펑셔널 리드 | `product-leadership.md` + `cross-functional.md` + `communication.md` |

**복합 태스크**: 여러 유형에 해당하면 관련 행의 파일을 합집합으로 읽는다.
- 새 제품 런칭 → product-vision.md + product-strategy.md + market-research.md + user-research.md + business-model.md
- 분기 계획 수립 → roadmap.md + prioritization.md + metrics.md + stakeholder-management.md
