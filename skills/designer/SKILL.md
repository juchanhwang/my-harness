---
name: designer
description: >
  프로덕트 디자이너 도메인 knowledge. UI 컴포넌트 설계, 디자인 시스템(shadcn/ui),
  디자인 토큰, 레이아웃/그리드, 반응형, 타이포그래피, 색상, 폼 디자인, 접근성(a11y),
  UX 리서치, 유저 플로우, 와이어프레임, 인터랙션, 데이터 시각화, 개발자 핸드오프 시 활성화.
  UI/UX 설계 판단, 디자인 리뷰, 컴포넌트 디자인이 필요할 때 사용한다.
  사용자가 목업, 와이어프레임, 프로토타입, 디자인 스펙, 디자인 토큰, 색상 팔레트,
  타이포그래피 스케일, 컴포넌트 variants, 디자인 시스템 문서를 언급하면 반드시
  이 스킬을 활성화하라. 명시적으로 '디자인'이라고 말하지 않더라도
  "이 화면을 어떻게 구성하지?", "사용자가 헷갈려하지 않을까?" 같은
  시각적 설계나 사용성 판단이 필요하면 활성화한다.
---

# Designer Domain Knowledge

매핑 테이블의 참조 파일에는 프로젝트의 디자인 시스템, 컨벤션, 접근성 기준이 담겨 있다.
이를 읽지 않으면 기존 디자인 언어와 충돌하는 설계를 하게 되고, 일관성이 깨진다.
디자인하거나 리뷰하기 전에 아래 매핑 테이블에서 태스크에 해당하는 파일을 반드시 Read하라.

**기본 경로**: `~/.claude/skills/designer/` — 아래 테이블의 파일명 앞에 이 경로를 붙여서 Read한다.

## 핵심 원칙

- 철학: "예쁜 것"이 아니라 "작동하는 것"을 만든다. 모든 픽셀에는 이유가 있어야 한다
- Design Thinking 4대 원칙: 사용자 공감, 문제 정의, 반복적 개선, 시스템 사고
- 디자인 시스템: shadcn/ui + Radix Primitives + Tailwind CSS
- 접근성: 처음부터 포함. 후순위로 미루지 않는다
- 안티패턴: 근거 없는 미적 판단, 접근성 무시, 개발자 핸드오프 없는 설계

## 태스크-지식 매핑

| 태스크 유형 | 판단 기준 | Read할 파일 |
|---|---|---|
| UI 컴포넌트 설계 | 개별 컴포넌트 구조·variants·상태 | `component-design.md` + `design-tokens.md` + `shadcn-patterns.md` + `design-system.md` |
| 새 화면/페이지 디자인 | 전체 화면 레이아웃·정보 구조 | `layout-grid.md` + `responsive-design.md` + `information-architecture.md` + `user-flows.md` + `typography.md` |
| 폼/입력 화면 | 입력 필드·유효성·에러 메시지 설계 | `form-design.md` + `ux-writing.md` + `accessibility.md` |
| 데이터 대시보드 | 차트·테이블·데이터 표현 설계 | `data-visualization.md` + `layout-grid.md` + `color-theory.md` |
| 디자인 리뷰 | 기존 디자인 품질·일관성 평가 | `design-critique.md` + `design-principles.md` + `accessibility.md` |
| 디자인 시스템 구축/유지 | 토큰·컴포넌트·문서화 체계 | `design-system.md` + `design-tokens.md` + `shadcn-patterns.md` + `component-design.md` |
| 사용자 리서치 | 유저 인터뷰·테스트·인사이트 도출 | `ux-research.md` + `user-flows.md` + `design-process.md` |
| 개발자 협업/핸드오프 | 스펙 전달·토큰·구현 가이드 | `developer-handoff.md` + `design-tokens.md` + `shadcn-patterns.md` |
| AI 기능 디자인 | AI 인터랙션·프롬프트 UI·피드백 | `ai-design.md` + `interaction-design.md` + `ux-writing.md` |
| 와이어프레임 | 저해상도 구조·흐름 스케치 | `wireframing.md` + `information-architecture.md` + `user-flows.md` |
| 인터랙션 설계 | 애니메이션·전환·마이크로인터랙션 | `interaction-design.md` + `component-design.md` |
| 접근성 감사 | WCAG 기준·색상 대비·키보드 검증 | `accessibility.md` + `inclusive-design.md` + `color-theory.md` |
| 비주얼 디자인 | 색상·타이포·비주얼 톤앤매너 | `color-theory.md` + `typography.md` + `design-principles.md` |
| UX 라이팅 | 마이크로카피·에러 메시지·톤 | `ux-writing.md` + `form-design.md` |
| 디자인 리더십 | 프로세스·팀 운영·디자인 문화 | `design-leadership.md` + `design-process.md` + `design-critique.md` |
| 목업 생성 | 디자인 스펙 기반 HTML 목업 작성 | `developer-handoff.md` + `component-design.md` + `shadcn-patterns.md` |

**복합 태스크**: 여러 유형에 해당하면 관련 행의 파일을 합집합으로 읽는다.
- 새 기능 전체 디자인 → user-flows.md + information-architecture.md + component-design.md + shadcn-patterns.md + accessibility.md
- 디자인 시스템 + 핸드오프 → design-system.md + design-tokens.md + developer-handoff.md + shadcn-patterns.md
