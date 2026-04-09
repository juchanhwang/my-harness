# Sprint Planning

## Sprint Goal 설정

### Sprint Goal이란?

이번 Sprint에서 달성하려는 **하나의 명확한 목표**. 개별 아이템의 나열이 아닌, 그것들이 합쳐서 만드는 결과.

### 좋은 Sprint Goal의 조건

* **한 문장**으로 표현 가능
* **측정 가능**하거나 검증 가능
* 분기 Outcome과 **연결**
* 팀 전원이 **이해하고 동의**

### 예시

나쁜 예: "대시보드 작업, 알림 기능, 버그 수정"
좋은 예: "팀 리더가 프로젝트 상태를 실시간으로 파악할 수 있는 MVP 대시보드 출시"

나쁜 예: "백엔드 리팩토링"
좋은 예: "API 응답 시간을 500ms → 200ms로 개선하여 사용자 체감 속도 향상"

## Capacity Planning

### Sprint Capacity 계산

```
팀 Capacity = Σ (각 멤버의 가용 시간)

각 멤버 가용 시간:
  Sprint 일수 (10일)
  - 휴가/부재 (-N일)
  - 회의/세러모니 (-1~2일)
  - 버그 대응/운영 (-1일)
  = 순수 개발 가능 일수
  × Focus Factor (보통 0.6~0.8)
  = 가용 Story Points
```

### Focus Factor

* 신규 팀: 0.5-0.6
* 안정된 팀: 0.7-0.8
* 시니어 팀: 0.8-0.9

### Capacity 기반 계획

1. 총 가용 포인트 계산
2. Sprint Goal에 직접 기여하는 아이템 먼저 배치
3. Tech debt / 운영 작업 20% 할당
4. Buffer 10-15% 유지 (예상치 못한 작업)

## Story Point Estimation

### Fibonacci 스케일

```
1, 2, 3, 5, 8, 13, 21

1: 단순한 변경 (copy 수정, config 변경)
2: 작은 기능 (간단한 UI 컴포넌트)
3: 보통 기능 (API 연동 포함)
5: 복잡한 기능 (여러 컴포넌트, 로직)
8: 큰 기능 (아키텍처 변경 포함)
13: 매우 큰 기능 → 분해 필요
21: Epic 수준 → 반드시 분해
```

### Planning Poker 프로세스

1. PO가 Story 설명 (3분)
2. 질문 & 토론 (5분)
3. 동시에 카드 공개
4. 최고/최저 추정자가 근거 설명
5. 재논의 후 합의

### 추정 주의사항

* **상대적** 추정: 절대 시간이 아닌 다른 Story 대비 크기
* **복잡도 + 불확실성 + 작업량**을 모두 포함
* Reference Story 하나를 기준으로 삼기 (예: "로그인 페이지 = 3점")
* 13 이상이면 반드시 분해

## Velocity Tracking

### Velocity란?

Sprint당 완료하는 Story Points의 평균.

### 활용

```
평균 Velocity: 최근 3-5 Sprint 평균

예측: 남은 backlog 40 points ÷ Velocity 10 points/sprint = 4 sprints 필요
```

### Velocity 주의사항

* **팀 간 비교 금지**: Velocity는 팀 내부 계획 도구
* **성과 지표가 아님**: Velocity를 KPI로 쓰면 point inflation 발생
* **추세가 중요**: 절대값보다 안정적인가, 하락하는가
* 하락 추세 → 원인 분석 (기술 부채, 팀 변화, 프로세스 문제)

## Sprint Ceremonies

### Sprint Planning (Sprint 시작)

* **시간**: 2시간 (2주 Sprint 기준)
* **참석**: PO, Scrum Master, Dev Team
* **산출물**: Sprint Goal + Sprint Backlog

```
Part 1: WHAT (PO 주도, 30분)
  → Sprint Goal 제안
  → 우선순위 상위 아이템 소개

Part 2: HOW (Dev Team 주도, 90분)
  → 아이템 선택 (Capacity 기반)
  → 기술적 접근 논의
  → Task 분해
```

### Daily Stand-up

* **시간**: 15분 이내
* **각자 답변**: 어제 한 일 / 오늘 할 일 / 블로커
* **PO 참여**: 듣기 위주, 블로커 해소 지원

### Sprint Review (Sprint 종료)

* **시간**: 1시간
* **참석**: 팀 + 이해관계자
* **목적**: 완성물 데모 + 피드백 수집
* **PO 역할**: 데모 맥락 설명, 피드백을 backlog에 반영

```
구조:
1. Sprint Goal 리마인드 (2분)
2. 완성물 데모 (30분)
3. 지표 업데이트 (10분)
4. 이해관계자 피드백 (15분)
5. 다음 Sprint 방향 공유 (3분)
```

### Sprint Retrospective (Review 직후)

* **시간**: 1시간
* **참석**: 팀만 (이해관계자 없음)
* **목적**: 프로세스 개선

**Mad/Sad/Glad 포맷:**

```
😡 Mad (화나는/답답한): [프로세스 문제, 블로커]
😢 Sad (아쉬운): [놓친 것, 아쉬운 결과]
😊 Glad (좋은): [잘한 것, 감사한 것]
```

**Start/Stop/Continue 포맷:**

```
▶️ Start: [새로 시작할 것]
⏹️ Stop: [그만할 것]
⏩ Continue: [계속할 것]
```

### Retro 후 Action Item

* 최대 2-3개 액션 아이템 선정
* 담당자 배정
* 다음 Retro에서 결과 확인
* 액션 아이템 없는 Retro = 의미 없는 Retro
