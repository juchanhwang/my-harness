# Prioritization

## 왜 우선순위가 중요한가?

리소스는 항상 부족하고, 아이디어는 항상 넘친다. **모든 것을 하겠다는 것은 아무것도 안 하겠다는 것과 같다.** 시니어 PO의 핵심 역량은 "무엇을 하지 않을 것인가"를 결정하는 것이다.

## RICE Framework

Intercom이 개발한 정량적 우선순위 프레임워크.

### 공식

```
RICE Score = (Reach × Impact × Confidence) / Effort
```

### 각 요소

| 요소             | 설명                 | 측정 단위                                              |
| -------------- | ------------------ | -------------------------------------------------- |
| **Reach**      | 일정 기간 내 영향받는 사용자 수 | 분기당 사용자 수                                          |
| **Impact**     | 개인에게 미치는 영향 정도     | 3=massive, 2=high, 1=medium, 0.5=low, 0.25=minimal |
| **Confidence** | 추정의 확신도            | 100%=높음, 80%=보통, 50%=낮음                            |
| **Effort**     | 필요한 작업량            | person-months                                      |

### 실제 예시

```
Feature A: 온보딩 체크리스트
  Reach: 5,000 (신규 가입자/분기)
  Impact: 2 (high)
  Confidence: 80%
  Effort: 2 person-months
  RICE = (5000 × 2 × 0.8) / 2 = 4,000

Feature B: 다크 모드
  Reach: 15,000 (전체 MAU)
  Impact: 0.5 (low)
  Confidence: 90%
  Effort: 3 person-months
  RICE = (15000 × 0.5 × 0.9) / 3 = 2,250

Feature C: 실시간 알림
  Reach: 8,000
  Impact: 1 (medium)
  Confidence: 50%
  Effort: 4 person-months
  RICE = (8000 × 1 × 0.5) / 4 = 1,000

→ 우선순위: A (4000) > B (2250) > C (1000)
```

### RICE 주의사항

* Confidence가 50% 미만이면 **먼저 리서치/실험**으로 confidence를 올린다
* 전략적 중요도는 RICE에 반영되지 않으므로 별도 고려
* 숫자는 절대적이 아니라 **상대적 비교** 용도

## ICE Scoring

더 빠르고 간단한 우선순위 프레임워크.

### 공식

```
ICE Score = Impact × Confidence × Ease
```

| 요소             | 설명                  | 척도   |
| -------------- | ------------------- | ---- |
| **Impact**     | 목표 지표에 미치는 영향       | 1-10 |
| **Confidence** | 추정의 확신도             | 1-10 |
| **Ease**       | 구현 용이성 (Effort의 역수) | 1-10 |

### RICE vs ICE

|          | RICE     | ICE        |
| -------- | -------- | ---------- |
| 정밀도      | 높음       | 보통         |
| 속도       | 느림       | 빠름         |
| Reach 고려 | ✅        | ❌          |
| 적합한 상황   | 주요 기능 결정 | 빠른 실험 우선순위 |

## MoSCoW Method

요구사항을 4가지 카테고리로 분류:

| 카테고리                       | 의미                  | 비율 (권장) |
| -------------------------- | ------------------- | ------- |
| **Must** have              | 없으면 출시 불가           | 60%     |
| **Should** have            | 중요하지만 workaround 가능 | 20%     |
| **Could** have             | 있으면 좋지만 필수는 아님      | 15%     |
| **Won't** have (this time) | 이번에는 안 함            | 5%      |

### MoSCoW 실전 팁

* **Must의 기준을 엄격히**: "있으면 좋겠다" ≠ Must
* **Won't를 명시적으로 선언**: scope creep 방지의 핵심
* **이해관계자와 합의**: 각 항목의 카테고리를 함께 결정
* Must가 60% 넘으면 범위 재조정 필요

## Opportunity Scoring (importance vs satisfaction)

### 개념

Dan Olsen(The Lean Product Playbook)의 프레임워크:

* **Importance**: 사용자에게 이 기능/니즈가 얼마나 중요한가?
* **Satisfaction**: 현재 솔루션에 얼마나 만족하는가?

```
높은 기회 = 높은 Importance + 낮은 Satisfaction
```

### Opportunity Score 계산

```
Opportunity Score = Importance + (Importance - Satisfaction)
                  = Importance + Gap
```

### 시각화

```
Importance (높음)
    │    ★ 기회!          ✓ 유지
    │   (중요한데 불만족)  (중요하고 만족)
    │
    │   ○ 무시            ◇ 과잉투자?
    │   (안 중요, 불만족)  (안 중요한데 만족)
    └──────────────────────────────
              Satisfaction (높음)
```

## Value vs Effort Matrix (2×2)

가장 직관적인 우선순위 도구:

```
Value (높음)
    │
    │  Quick Wins ★     Big Bets
    │  (높은 가치,       (높은 가치,
    │   낮은 노력)       높은 노력)
    │   → 바로 실행       → 전략적 판단
    │
    │  Fill-ins          Money Pit
    │  (낮은 가치,       (낮은 가치,
    │   낮은 노력)       높은 노력)
    │   → 빈 시간에       → 하지 않는다
    │
    └──────────────────────────────
              Effort (높음)
```

### 실행 순서

1. **Quick Wins**: 즉시 실행
2. **Big Bets**: 신중하게 검토 후 전략적으로 배치
3. **Fill-ins**: 여유 있을 때
4. **Money Pit**: 거절

## "No" 말하는 기술

### 왜 No가 중요한가?

* Steve Jobs: "I'm as proud of what we don't do as I am of what we do"
* 모든 Yes는 다른 것에 대한 암묵적 No
* 시니어 PO의 가치는 **필터링 능력**

### No를 말하는 프레임워크

**1. 데이터로 말하기**

```
"데이터를 보면 이 기능을 원하는 사용자는 전체의 3%입니다.
현재 우리의 North Star인 activation rate에 영향을 주는
온보딩 개선에 집중하는 것이 90%의 사용자에게 도움이 됩니다."
```

**2. 트레이드오프 명시하기**

```
"이 기능을 하려면 [A]를 3주 미뤄야 합니다.
[A]의 예상 임팩트는 revenue +15%인 반면,
요청하신 기능의 예상 임팩트는 +2%입니다.
어떻게 하시겠습니까?"
```

**3. "Not now" 프레이밍**

```
"좋은 아이디어입니다. 다만 현재 분기 목표와의 연결이 약합니다.
Q3 로드맵 검토 시 다시 평가하겠습니다.
그때까지 관련 데이터를 더 모아보겠습니다."
```

**4. 대안 제시**

```
"Full 기능 대신, 이 문제를 80% 해결하는
더 작은 범위의 솔루션을 2주 안에 검증해 보면 어떨까요?"
```

### No를 못 말하는 PO의 결과

* Backlog이 100개 이상으로 비대
* 모든 것이 P0/P1 → 실제로는 아무것도 P0이 아닌 상태
* 팀의 집중력 분산 → 품질 하락
* 전략 없는 Feature factory 전락
* 출시는 많지만 임팩트 없음

## 우선순위 결정 프로세스 (실전)

### Step 1: 후보 리스트 수집

* 고객 피드백, 이해관계자 요청, 데이터 인사이트, 전략 이니셔티브

### Step 2: 전략 필터

* 현재 분기 목표/OKR과 연관되는가? → No면 parking lot

### Step 3: 정량 스코어링

* RICE 또는 ICE로 점수화

### Step 4: 정성적 조정

* 전략적 중요도, 기술 부채, 경쟁 대응 등 정량화 어려운 요소

### Step 5: 이해관계자 합의

* Top 5-10 항목에 대해 논의, 최종 확정

### Step 6: 커뮤니케이션

* 선택한 것 + 선택하지 않은 것(과 그 이유) 공유
