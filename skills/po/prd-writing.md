# PRD Writing 완전 가이드

## PRD란?

PRD(Product Requirements Document)는 **"왜 만드는지, 누구를 위한 것인지, 무엇을 만드는지, 성공을 어떻게 측정하는지"를 정리한 문서**입니다. 개발팀이 구축해야 할 대상을 명확히 이해해야 합니다.

## PRD 구조

### 1. Overview (개요)

```markdown
## Overview
- **문서명**: [Feature/Project Name]
- **작성자**: [PO 이름]
- **최종 수정**: [날짜]
- **상태**: Draft / In Review / Approved
- **관련 문서**: [디자인 스펙, 기술 문서 링크]
```

### 2. Background & Problem (배경 & 문제)

구축 동기를 설명하는 섹션입니다.

* 현재 상황 (AS-IS)
* 해결하려는 문제 (구체적 데이터 기반)
* 고객의 목소리 (인터뷰/서포트 티켓에서 직접 인용)
* 비즈니스 맥락 (전략적 의미)

### 3. Goals & Non-Goals (목표 & 비목표)

**Goals (이번에 달성할 것):**

* 구체적이고 측정 가능한 목표 3개 이내

**Non-Goals (이번에 하지 않는 것):**

* 명시적으로 범위 밖인 것 — 범위 확대 방지
* "나중에 할 수도 있지만, 이번엔 아닌 것"

### 4. Target Users (대상 사용자)

* Primary persona: [누구?]
* Secondary persona: [누구?]
* Non-target: [명시적으로 대상이 아닌 사용자]

### 5. User Stories & Requirements (사용자 스토리 & 요구사항)

### 6. Success Metrics (성공 지표)

### 7. Design (디자인)

### 8. Technical Considerations (기술 고려사항)

### 9. Timeline & Milestones (타임라인)

### 10. Open Questions (미결 사항)

### 11. Appendix (부록)

## 좋은 PRD vs 나쁜 PRD

| 좋은 PRD            | 나쁜 PRD             |
| ----------------- | ------------------ |
| 문제부터 시작한다         | 솔루션부터 시작한다         |
| 성공 지표가 명확하다       | 모호한 표현으로 가득하다 |
| Non-goals가 있다     | 범위가 끝없이 확장된다       |
| 개발자가 읽고 이해한다      | PO만 이해한다           |
| 데이터/고객 인사이트 기반    | 추측과 가정으로 가득하다 |
| 1-pager로 핵심 전달 가능 | 30페이지 소설           |
| 열린 질문을 명시한다       | 모든 것을 아는 척한다       |
| 대안을 검토한 흔적이 있다    | 첫 번째 아이디어 = 최종 결정  |

### PRD 리뷰 체크리스트

* [ ] 해결하는 문제가 명확한가?
* [ ] 타겟 사용자가 구체적인가?
* [ ] 성공 지표가 측정 가능한가?
* [ ] Non-goals가 정의되어 있는가?
* [ ] 기술팀이 이해할 수 있는가?
* [ ] 미결 사항이 명시되어 있는가?
* [ ] 대안 검토가 포함되어 있는가?

## User Story 작성법

### 기본 포맷

```
As a [user type],
I want to [action],
So that [benefit/outcome].
```

### 좋은 User Story의 조건: INVEST

| 원칙              | 설명                     |
| --------------- | ---------------------- |
| **I**ndependent | 다른 스토리와 독립적으로 개발/배포 가능 |
| **N**egotiable  | 구현 방식은 협상 가능 (결과만 고정)  |
| **V**aluable    | 사용자에게 가치를 전달           |
| **E**stimable   | 개발팀이 규모를 추정 가능         |
| **S**mall       | 한 스프린트 내 완료 가능         |
| **T**estable    | 완료 여부를 검증 가능           |

### User Story 예시

**나쁜 예:**

```
As a user, I want a dashboard.
```

→ 누구인가? 왜 필요한가? 어떤 대시보드인가?

**좋은 예:**

```
As an engineering manager,
I want to see my team's sprint progress at a glance,
So that I can identify blockers early without asking each team member.

Acceptance Criteria:
- Sprint burndown chart 표시
- 각 팀원의 현재 작업 상태 표시
- Blocked 상태인 아이템 하이라이트
- 페이지 로드 2초 이내
```

### Epic → Story → Task 분해 예시

```
Epic: "신규 사용자 온보딩 개선"
  │
  ├── Story: "첫 로그인 시 인터랙티브 튜토리얼"
  │     ├── Task: 튜토리얼 UI 컴포넌트 구현
  │     ├── Task: 스텝별 콘텐츠 작성
  │     └── Task: 완료율 트래킹 이벤트 추가
  │
  ├── Story: "프로젝트 템플릿 선택 화면"
  │     ├── Task: 템플릿 데이터 모델 설계
  │     ├── Task: 템플릿 선택 UI 구현
  │     └── Task: 템플릿 기반 프로젝트 생성 API
  │
  └── Story: "온보딩 이메일 시퀀스"
        ├── Task: 이메일 콘텐츠 작성
        ├── Task: 이메일 자동화 설정
        └── Task: A/B 테스트 설계
```

## Acceptance Criteria 작성법

### Given-When-Then 포맷

```
Given [precondition/context],
When [action/trigger],
Then [expected result].
```

**예시:**

```
Scenario: 만료된 쿠폰 사용 시도

Given 사용자가 만료된 쿠폰 코드를 가지고 있고
  And 결제 화면에 있을 때
When 쿠폰 코드를 입력하고 적용 버튼을 클릭하면
Then "이 쿠폰은 [만료일]에 만료되었습니다" 메시지가 표시되고
  And 할인이 적용되지 않고
  And 결제 금액은 변경되지 않는다
```

### Acceptance Criteria 체크리스트

* [ ] Happy path (정상 흐름)가 있는가?
* [ ] Edge case (경계 조건)를 고려했는가?
* [ ] Error case (오류 상황)를 정의했는가?
* [ ] 성능 요구사항이 있는가? (응답 시간, 처리량)
* [ ] 접근성 요구사항이 있는가?

## 실제 PRD 템플릿

```markdown
# PRD: [Feature Name]

> **Author**: [이름] | **Status**: Draft | **Last Updated**: YYYY-MM-DD
> **Reviewers**: [Engineering Lead], [Design Lead], [Data Analyst]

---

## 1. 배경 & 문제

### 현재 상황
[데이터 기반으로 현재 상태 설명]

### 문제
[해결하려는 구체적 문제. 고객 인용 포함]

### 기회
[이 문제를 해결하면 얻는 비즈니스 가치]

## 2. 목표 & 비목표

### Goals
1. [측정 가능한 목표 1]
2. [측정 가능한 목표 2]

### Non-Goals
- [명시적으로 이번에 하지 않는 것]

## 3. 대상 사용자

**Primary**: [Persona + 핵심 JTBD]
**Secondary**: [Persona + JTBD]

## 4. 제안 솔루션

### 개요
[1-2 문단으로 솔루션 요약]

### User Flow
[주요 사용자 흐름 — 다이어그램 또는 단계별 설명]

### User Stories
[Story 1 + Acceptance Criteria]
[Story 2 + Acceptance Criteria]

### 대안 검토
| 옵션 | 장점 | 단점 | 선택 여부 |
|------|------|------|---------|
| A (선택) | ... | ... | ✅ |
| B | ... | ... | ❌ — [이유] |

## 5. 성공 지표

| 지표 | 현재 | 목표 | 측정 방법 |
|------|------|------|---------|
| [Primary metric] | X% | Y% | [도구/방법] |
| [Secondary metric] | ... | ... | ... |
| [Guardrail metric] | ... | 변화 없음 | ... |

## 6. 기술 고려사항
- [API 변경, 데이터 모델, 성능, 보안 등]
- [기술 부채/의존성]

## 7. 디자인
- [Figma 링크]
- [핵심 UI 결정사항]

## 8. 타임라인
| 마일스톤 | 날짜 | 설명 |
|---------|------|------|
| Design complete | W1 | ... |
| Dev complete | W3 | ... |
| QA & Beta | W4 | ... |
| GA rollout | W5 | ... |

## 9. 미결 사항
- [ ] [열린 질문 1]
- [ ] [열린 질문 2]

## 10. 변경 이력
| 날짜 | 변경 내용 | 작성자 |
|------|---------|--------|
```

## PRD 작성 안티패턴

1. **소설 쓰기**: 30페이지 문서 → 아무도 읽지 않음. 핵심은 1-2페이지로 압축
2. **솔루션 먼저**: 문제 정의 없이 기능 아이디어부터 제시 → 문제 이해부터 시작
3. **성공 지표 없음**: "완료"가 성공의 기준이 아님 → 명확한 측정 가능 지표 필수
4. **한 번 쓰고 끝**: PRD는 살아있는 문서 → 변경사항 지속적 반영
5. **PO 혼자 작성**: Engineering과 Design의 의견 배제 → 협력적 작성 필수

---

이 가이드를 참고하여 실질적이고 실행 가능한 PRD를 작성할 수 있습니다.
