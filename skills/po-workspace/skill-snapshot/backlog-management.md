# Backlog Management

## Product Backlog 관리 원칙

### 1. 작고 관리 가능하게 유지

* **이상적 크기**: 활성 아이템 30-50개
* 100개 이상이면 문제 — 오래된 아이템은 과감히 정리
* "6개월 이상 된 아이템은 아직도 중요한가?" 정기적으로 점검

### 2. 항상 우선순위가 정해져 있어야

* 상위 10개는 상세하고 바로 개발 가능 (Ready)
* 중간은 대략적 scope
* 하위는 아이디어 수준 OK

### 3. Outcome과 연결

* 모든 아이템은 현재 분기 Outcome과 연결 가능해야
* 연결할 수 없다면 → Parking Lot 또는 삭제

## Backlog Refinement (Grooming) 프로세스

### 목적

Sprint Planning이 원활하도록 **미리** backlog 아이템을 구체화하는 세션.

### 주기 & 참석

* **주기**: 주 1회 (Sprint의 중간 시점)
* **시간**: 1시간 이내
* **참석**: PO, Engineering Lead, 관련 개발자, Designer

### 진행 순서

```
1. 새 아이템 소개 (PO) — 10분
   → 배경, 문제, 기대 결과

2. 질문 & 토론 (전체) — 20분
   → 기술적 질문, edge case, 의존성

3. User Story & AC 보완 (전체) — 15분
   → Story 수정, Acceptance Criteria 추가

4. 추정 (Engineering) — 10분
   → Story point 또는 T-shirt sizing

5. 우선순위 확인 (PO) — 5분
   → 상위 아이템 순서 재확인
```

### Refinement 아웃풋

* 다음 Sprint에 투입 가능한 Ready 아이템 확보
* 추정 완료된 아이템
* 미결 사항 식별 + 해결 담당 배정

## Epic → Story → Task 분해

```
Epic (큰 목표, 여러 Sprint에 걸침)
  │
  ├── Feature (기능 단위)
  │     │
  │     ├── User Story (사용자 가치 단위, 1 Sprint 내 완료)
  │     │     │
  │     │     ├── Task (기술적 작업 단위, 1-2일)
  │     │     └── Task
  │     │
  │     └── User Story
  │           ├── Task
  │           └── Task
  │
  └── Feature
        └── ...
```

### 분해 원칙

* **Story는 vertical slice**: UI + Logic + Data를 모두 포함하는 사용자 가치 단위
* **Task는 horizontal slice**: 프론트엔드, 백엔드, DB 등 기술 단위
* Story가 5 points 이상이면 → 더 작게 분해
* "기술적으로 완료"가 아닌 "사용자에게 가치"가 Story의 단위

### Story Splitting 기법

1. **Workflow steps**: 긴 프로세스의 각 단계를 별도 Story로
2. **Happy/Unhappy path**: 정상 흐름 먼저, 에러 처리 별도
3. **Input variations**: 입력 유형별 분리
4. **Data variations**: 데이터 소스/형식별 분리
5. **Platform**: 웹 먼저, 모바일 나중
6. **CRUD**: Create 먼저, 나머지 순차적

## Definition of Ready (DoR)

Story가 Sprint에 투입되기 위한 최소 조건:

```markdown
## Definition of Ready ✅

- [ ] User Story가 명확하게 작성됨
- [ ] Acceptance Criteria가 정의됨
- [ ] 디자인 시안이 준비됨 (UI 관련 시)
- [ ] 기술적 질문이 해소됨
- [ ] Story point 추정 완료
- [ ] 의존성이 식별되고 해결 계획 있음
- [ ] 한 Sprint 내 완료 가능한 크기
```

## Definition of Done (DoD)

Story가 "완료"로 간주되기 위한 조건:

```markdown
## Definition of Done ✅

- [ ] 코드 구현 완료
- [ ] 코드 리뷰 통과
- [ ] 단위 테스트 작성 및 통과
- [ ] Acceptance Criteria 모두 충족
- [ ] QA 테스트 통과
- [ ] 성능 기준 충족
- [ ] 문서 업데이트 (필요 시)
- [ ] Feature flag 뒤에 배포 (필요 시)
- [ ] Product review 완료 (PO 승인)
```

### DoR과 DoD를 팀과 합의하는 이유

* "완료"의 기준이 사람마다 다르면 혼란 발생
* 합의된 기준 = 예측 가능한 품질
* 정기적으로 리뷰하고 팀 성숙도에 맞게 업데이트

## Technical Debt 관리

### Tech Debt 유형

| 유형        | 원인              | 예시                     |
| --------- | --------------- | ---------------------- |
| **의도적**   | 속도를 위해 의식적으로 선택 | "일단 하드코딩, 나중에 config화" |
| **비의도적**  | 지식 부족이나 실수      | 잘못된 아키텍처 결정            |
| **환경 변화** | 시간이 지나며 발생      | 라이브러리 업데이트, 보안 패치      |

### PO의 Tech Debt 관리 원칙

1. **20% 규칙**: Sprint 용량의 \~20%를 tech debt에 할당
2. **가시화**: Tech debt도 backlog에 아이템으로 관리
3. **비즈니스 임팩트로 우선순위**: "이 tech debt가 사용자/비즈니스에 미치는 영향은?"
4. **Engineering의 전문성 존중**: 기술적 판단은 엔지니어가, 우선순위는 PO가

### Tech Debt Scoring

```
Impact: 이 debt가 방치되면?
  3 = 서비스 장애 / 보안 위험
  2 = 개발 속도 저하 / 버그 증가
  1 = 코드 품질 저하 (기능에는 영향 없음)

Urgency: 얼마나 빨리?
  3 = 즉시 (현재 Sprint)
  2 = 이번 분기
  1 = 언젠가

→ Impact × Urgency = Priority Score
```
