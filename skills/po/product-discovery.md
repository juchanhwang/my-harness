# Product Discovery - 전체 내용

## Continuous Discovery (Teresa Torres)

### 핵심 원칙

Product discovery는 **일회성 이벤트가 아니라 지속적인 습관**이다. Teresa Torres의 Continuous Discovery Habits에서 정의한 6가지 마인드셋:

1. **Outcome-oriented** — Feature가 아닌 outcome에서 시작
2. **Customer-centric** — 매주 고객과 대화
3. **Collaborative** — Product Trio (PM + Designer + Engineer)가 함께
4. **Visual** — OST 등 시각적 도구로 사고
5. **Experimental** — 가설을 실험으로 검증
6. **Continuous** — 한 번이 아닌 매주 반복

### Product Trio

Discovery는 PM 혼자 하는 것이 아니다:

* **Product Manager**: 비즈니스 viability, 전략 방향
* **Designer**: 사용자 경험, usability
* **Engineer**: 기술 feasibility, 구현 복잡도

세 관점이 동시에 작동해야 좋은 솔루션이 나온다.

### 주간 Discovery 리듬

```
월: Customer interview (30-60분)
    → Interview snapshot 작성
    → OST 업데이트

화-수: Opportunity 분석 & 솔루션 브레인스토밍
    → Assumption mapping
    → 실험 설계

목: Assumption test 실행
    → Prototype test / Data analysis / Survey

금: 학습 정리 & 다음 주 계획
    → Decision log 업데이트
    → 다음 주 인터뷰 대상 확보
```

## Opportunity Solution Tree (OST)

### 구조

```
                    ┌──────────────┐
                    │   Outcome    │ ← 팀의 목표 지표
                    └──────┬───────┘
              ┌────────────┼────────────┐
        ┌─────┴─────┐┌────┴─────┐┌─────┴─────┐
        │Opportunity││Opportunity││Opportunity│ ← 고객 니즈/페인
        │     A     ││     B    ││     C     │
        └─────┬─────┘└────┬─────┘└───────────┘
         ┌────┴────┐  ┌───┴───┐
     ┌───┴──┐┌─────┴┐┌┴──────┐
     │Sol. 1││Sol. 2││Sol. 3 │ ← 가능한 솔루션
     └───┬──┘└──┬───┘└───┬───┘
     ┌───┴──┐┌──┴───┐┌───┴──┐
     │Test 1││Test 2││Test 3│ ← Assumption tests
     └──────┘└──────┘└──────┘
```

### OST 작성 규칙

**Outcome (결과)**

* 팀이 영향을 줄 수 있는 구체적이고 측정 가능한 지표
* 좋은 예: "신규 사용자의 7일 retention을 25%→40%로 개선"
* 나쁜 예: "사용자 경험 개선" (측정 불가)

**Opportunity (기회)**

* 고객 인터뷰에서 발견한 니즈, 페인포인트, 욕구
* 고객의 언어로 표현 (내부 용어 X)
* 좋은 예: "팀원의 작업 상태를 파악하려면 일일이 물어봐야 한다"
* 나쁜 예: "대시보드가 필요하다" (솔루션이 아닌 문제를 써야)
* 큰 기회 → 작은 하위 기회로 분해 (actionable한 수준까지)

**Solution (솔루션)**

* 특정 opportunity를 해결하는 구체적 아이디어
* 하나의 opportunity에 최소 3개 이상의 솔루션을 생성
* 솔루션 간 비교를 통해 최선을 선택

**Assumption Test (가정 테스트)**

* 솔루션의 리스크를 줄이기 위한 빠른 실험
* 가정 유형: Desirability, Viability, Feasibility, Usability, Ethics

### OST 안티패턴

1. **Feature tree**: 기회가 아닌 기능을 나열 → opportunity space를 제대로 매핑하지 않음
2. **One solution per opportunity**: 솔루션 다양성 부족 → 최소 3개 비교
3. **Static tree**: 한 번 만들고 업데이트 안 함 → 매주 인터뷰 후 갱신
4. **Too many outcomes**: 한 번에 하나의 outcome에 집중
5. **Skipping tests**: 솔루션을 바로 build → assumption test 먼저

## Assumption Mapping

### Assumption 유형

| 유형               | 질문             | 예시                            |
| ---------------- | -------------- | ----------------------------- |
| **Desirability** | 사용자가 원하는가?     | "사용자가 이 알림을 유용하게 느낄 것이다"      |
| **Viability**    | 비즈니스에 도움이 되는가? | "이 기능이 conversion을 5% 올릴 것이다" |
| **Feasibility**  | 만들 수 있는가?      | "실시간 동기화가 100ms 이내로 가능하다"     |
| **Usability**    | 사용할 수 있는가?     | "사용자가 3 클릭 내에 목표를 달성한다"       |
| **Ethics**       | 해야 하는가?        | "이 데이터 수집이 사용자에게 해를 끼치지 않는다"  |

### Assumption Prioritization Map

```
                    높은 리스크
                        ↑
                        │
    검증 필요 ←─────────┼─────────→ 검증 완료
    (모르겠다)          │          (확실하다)
                        │
                    낮은 리스크

→ 우상단: 높은 리스크 + 불확실 = 최우선 검증 대상
→ 좌하단: 낮은 리스크 + 불확실 = 나중에
→ 우하단: 낮은 리스크 + 확실 = 무시 OK
```

## Hypothesis-Driven Development

### 가설 작성 템플릿

```
We believe that [change/action]
For [user segment]
Will result in [expected outcome]
We will know this is true when [measurable signal]
```

**예시:**

```
We believe that adding an interactive onboarding checklist
For new users who signed up in the last 7 days
Will result in higher activation rate
We will know this is true when Day-7 activation increases from 25% to 35%
```

### 가설 우선순위 결정

1. **Impact**: 검증되면 얼마나 큰 영향?
2. **Confidence**: 현재 얼마나 확신하는가? (낮을수록 검증 필요)
3. **Effort**: 검증하는 데 얼마나 걸리는가?

→ High Impact + Low Confidence + Low Effort = 먼저 검증

## Lean Experiment 설계

### 실험 유형 (빠른 순서)

| 실험                 | 소요 시간 | 검증 대상                    | 설명                  |
| ------------------ | ----- | ------------------------ | ------------------- |
| **Smoke test**     | 1-2일  | Desirability             | 랜딩 페이지 + CTA로 수요 확인 |
| **Concierge**      | 1-2주  | Desirability + Usability | 수동으로 서비스 제공         |
| **Wizard of Oz**   | 1-2주  | Usability + Feasibility  | 자동화된 척 하지만 수동 처리    |
| **Prototype test** | 3-5일  | Usability                | 클릭 가능한 프로토타입으로 테스트  |
| **A/B test**       | 2-4주  | All                      | 실제 사용자 대상 비교 실험     |
| **Beta/Pilot**     | 4-8주  | All                      | 제한된 사용자에게 실제 기능 제공  |

### 실험 설계 캔버스

```markdown
## Experiment Canvas

### 가설
[We believe... Will result in... We'll know when...]

### 가정 (검증 대상)
[이 실험으로 검증하려는 핵심 가정]

### 실험 방법
[구체적 실행 방법]

### 성공 기준
- 성공: [metric ≥ X]
- 학습: [X > metric ≥ Y]
- 실패: [metric < Y]

### 소요 리소스
- 시간: [N일/주]
- 인원: [누가 참여]
- 비용: [추가 비용]

### 리스크
[실험이 잘못될 수 있는 요인]

### 다음 단계
- 성공 시: [다음 액션]
- 실패 시: [피벗 또는 새 가설]
```

### One-test-at-a-time 원칙

* 한 번에 하나의 가정만 테스트
* 여러 변수를 동시에 바꾸면 무엇이 원인인지 알 수 없다
* 가장 리스크가 높은 가정부터 순서대로

## Discovery ↔ Delivery 연결

### Dual-Track Agile

```
Discovery Track                    Delivery Track
(다음 무엇을 만들지 발견)           (발견한 것을 만들기)

인터뷰 → 기회 발견                  Sprint Planning
   ↓                                  ↓
OST 업데이트                        Development
   ↓                                  ↓
솔루션 탐색 → 가설 수립              Testing & QA
   ↓                                  ↓
Assumption Test                     Release
   ↓                                  ↓
검증된 솔루션 ──────────────────→   Backlog에 추가
                                       ↓
                                   Impact 측정 ──→ Discovery에 피드백
```

* Discovery는 항상 Delivery보다 **1-2 스프린트 앞서** 진행
* 검증되지 않은 솔루션은 Delivery로 넘기지 않는다
* Delivery 결과(데이터)가 다시 Discovery의 입력이 된다
