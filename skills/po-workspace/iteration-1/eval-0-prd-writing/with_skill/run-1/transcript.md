# Transcript: eval-0-prd-writing (with_skill)

## 읽은 스킬 파일

### 1. `/Users/JuChan/.claude/skills/po/SKILL.md`
- **이유**: 필수 진입점. 태스크-지식 매핑 테이블을 확인하기 위해 가장 먼저 읽었다.
- **결과**: PRD 작성 태스크에 해당하는 행을 확인 → `prd-writing.md` + `user-research.md` + `metrics.md` 3개 파일을 읽도록 지시되어 있음을 확인.

### 2. `/Users/JuChan/.claude/skills/po/prd-writing.md`
- **이유**: 태스크 매핑 테이블의 "PRD 작성" 행에서 명시된 첫 번째 파일. PRD 구조, 템플릿, User Story 작성법, Acceptance Criteria 포맷(Given-When-Then), 좋은 PRD vs 나쁜 PRD 기준을 확인하기 위해 읽었다.
- **활용**: PRD 10개 섹션 구조를 기반으로 문서 뼈대를 잡았다. Given-When-Then Acceptance Criteria 포맷을 Story 1~5에 적용했다. Non-Goals 섹션을 명시적으로 작성하는 원칙, 대안 검토 표 포맷을 직접 반영했다.

### 3. `/Users/JuChan/.claude/skills/po/user-research.md`
- **이유**: 태스크 매핑 테이블의 "PRD 작성" 행에서 명시된 두 번째 파일. Persona 설계 템플릿과 JTBD 포맷을 확인하기 위해 읽었다.
- **활용**: Primary Persona "민준"을 행동 기반 Persona 템플릿(행동 패턴, 핵심 Job, 페인포인트, 현재 대안, 성공 기준, 인용구) 구조로 작성했다. JTBD Job Statement를 `When / I want to / So I can` 포맷으로 작성했다. B2B SaaS - 프로젝트 관리 도구 인터뷰 가이드 예시가 파일에 있어, 이 PRD의 페르소나(Engineering Manager)와 일치하는 컨텍스트로 참고했다.

### 4. `/Users/JuChan/.claude/skills/po/metrics.md`
- **이유**: 태스크 매핑 테이블의 "PRD 작성" 행에서 명시된 세 번째 파일. AARRR 프레임워크, North Star Metric, Leading/Lagging Indicator 개념, Guardrail Metric 설계 방법을 확인하기 위해 읽었다.
- **활용**: 문제 섹션에서 AARRR Funnel 구조로 현황을 표현했다. "Activation 단계가 가장 큰 drop-off"라는 진단을 AARRR 논리로 뒷받침했다. 성공 지표 섹션을 Primary / Secondary / Guardrail Metric 3계층으로 분리했다. "새는 양동이에 물 붓지 않기" 원칙을 비즈니스 맥락 섹션에 반영했다.

## 주요 작성 결정

### 결정 1: 가정 레이블링
사용자 인터뷰 데이터가 없으므로, 이탈 원인 가설 표를 명시적으로 "[가정 — 인터뷰 부재 시 추론]"으로 레이블링했다. 좋은 PRD 기준("데이터/고객 인사이트 기반")을 지키되, 실제 데이터가 없을 때 솔직하게 가정으로 표기하는 방식을 선택했다.

### 결정 2: 솔루션 3개 레이어 구조
인터랙티브 체크리스트 + 템플릿 + 이메일 시퀀스를 함께 묶었다. 이는 Activation rate 20%p 개선이라는 목표가 인앱 경험 개선만으로는 달성하기 어렵고, 이미 이탈한 사용자를 재유입시키는 이메일 레이어가 반드시 필요하다고 판단했기 때문이다. 대안 검토 표에 이 논거를 명시했다.

### 결정 3: Non-Goals 광범위하게 명시
6주라는 짧은 타임라인 안에서 scope creep을 방지하기 위해, 자연스럽게 요청될 수 있는 항목들(팀 초대 개선, 유료 전환 최적화, 모바일, 다국어, 기존 사용자 리온보딩)을 모두 Non-Goals에 명시했다.

### 결정 4: 미결 사항(Open Questions)을 실행 가능하게
미결 사항을 단순 나열이 아니라, 담당자와 기한을 붙여 실제로 W1에 해결할 수 있는 형태로 작성했다. 이는 PRD를 "살아있는 문서"로 운용하기 위한 원칙을 반영한 것이다.

### 결정 5: Analytics Story를 별도 User Story로 분리
Story 5를 "온보딩 분석 인프라 구축"으로 독립시켰다. 측정 없이는 이번 프로젝트의 성공 여부를 판단할 수 없고, 이후 지속적 개선의 기반이 되기 때문이다. metrics.md의 "Funnel Analysis" 원칙을 직접 반영한 결정이다.
