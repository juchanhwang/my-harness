# Metrics & KPIs

## AARRR (Pirate Metrics) 프레임워크

Dave McClure가 만든 스타트업 지표 프레임워크. 사용자 라이프사이클의 각 단계를 측정한다.

```
Acquisition → Activation → Retention → Revenue → Referral
  (획득)       (활성화)     (유지)      (수익)    (추천)
```

### 각 단계별 핵심 지표

| 단계              | 질문            | 핵심 지표                        | 예시                          |
| --------------- | ------------- | ---------------------------- | --------------------------- |
| **Acquisition** | 사용자가 어떻게 오는가? | 채널별 방문자, CAC, CPA            | Google Ads → 5,000 visits/월 |
| **Activation**  | 첫 가치를 경험하는가?  | Activation rate, TTV         | 가입 후 프로젝트 생성 = 45%          |
| **Retention**   | 돌아오는가?        | D1/D7/D30 retention, DAU/MAU | D30 retention = 35%         |
| **Revenue**     | 돈을 내는가?       | MRR, ARPU, Conversion rate   | Free → Paid = 5%            |
| **Referral**    | 추천하는가?        | NPS, Viral coefficient, 초대율  | NPS = 55                    |

### AARRR Funnel 분석

```
방문자: 100,000 (100%)
  ↓
가입: 10,000 (10%)        ← Acquisition
  ↓
활성화: 3,000 (30%)       ← Activation ⭐ 가장 큰 drop-off
  ↓
7일 후 재방문: 1,200 (40%)← Retention
  ↓
유료 전환: 180 (15%)      ← Revenue
  ↓
추천: 36 (20%)            ← Referral
```

→ **가장 큰 drop-off 단계에 집중**: 이 예시에서는 가입→활성화 (30%)

## North Star Metric (NSM) 설정법

### Input Metric Tree

NSM을 분해하여 팀별로 영향을 줄 수 있는 지표를 도출:

```
         NSM: Weekly Active Projects
                    │
    ┌───────────────┼───────────────┐
    │               │               │
New Project    Returning         Projects
Creation       Projects          Per User
    │               │               │
 ┌──┴──┐        ┌──┴──┐        ┌──┴──┐
Signup  First   W1    W4     Invite  Feature
Rate    Project Ret   Ret    Rate    Adoption
        Rate    Rate  Rate
```

### NSM 선택 시 흔한 실수

1. **Revenue를 NSM으로**: Revenue는 lagging indicator, 고객 가치를 먼저
2. **Vanity metric**: 총 가입자 수(증가만 하는 지표)보다 활성 사용자
3. **너무 높은 수준**: "MAU"보다 "주간 핵심 작업 완료 수"가 더 actionable
4. **팀이 영향 줄 수 없는 지표**: 팀의 행동으로 움직일 수 있어야

## Leading vs Lagging Indicators

|        | Leading                   | Lagging             |
| ------ | ------------------------- | ------------------- |
| **성격** | 미래 예측                     | 과거 결과               |
| **시점** | 먼저 변동                     | 나중에 변동              |
| **통제** | 직접 영향 가능                  | 간접적으로만              |
| **예시** | Feature adoption, 온보딩 완료율 | Revenue, Churn rate |
| **용도** | 일상 운영 의사결정                | 전략 평가               |

### 실전 매핑

```
Leading (우리가 바꿀 수 있는 것)    Lagging (결과)
───────────────────────────────    ──────────────
온보딩 완료율 ──────────────────→  Activation rate
Feature X 사용 빈도 ───────────→  Retention rate
NPS / CSAT ────────────────────→  Churn rate
Qualified leads ───────────────→  MRR
```

## Cohort Analysis

### 코호트란?

**같은 시점에 같은 경험을 한 사용자 그룹**. 시간에 따른 행동 변화를 추적.

### Retention Cohort Table

```
         Week 0  Week 1  Week 2  Week 3  Week 4
Jan W1   100%    45%     32%     28%     25%
Jan W2   100%    48%     35%     30%     27%
Jan W3   100%    52%     38%     33%     30%
Feb W1   100%    55%     40%     35%     --
```

→ 시간이 갈수록 W1 retention이 개선 = 제품이 나아지고 있다

### 코호트 분석 활용

1. **기능 출시 전후 비교**: 온보딩 개편 전 코호트 vs 후 코호트
2. **세그먼트별 비교**: 유료 vs 무료, 채널 A vs B
3. **시즌성 파악**: 계절/이벤트에 따른 행동 차이
4. **PMF 진단**: Retention curve가 평평해지는가? (flatten = good)

## Funnel Analysis

### Funnel 설계 원칙

1. **핵심 전환 경로** 정의 (가입 → 활성화 → 유료 전환)
2. 각 단계별 **전환율** 측정
3. **가장 큰 drop-off** 식별
4. **세그먼트별** 비교 (기기, 채널, 사용자 유형)

### Funnel Optimization 순서

가장 **밑에서부터** 최적화:

```
1. Retention 먼저 (새는 양동이에 물 붓지 않기)
2. Activation (핵심 가치 전달)
3. Revenue (수익화)
4. Acquisition (더 많은 사용자 획득)
5. Referral (바이럴)
```

## Retention Curves

### 건강한 vs 불건강한 Retention

```
Retention %
100│
   │\
   │ \
   │  \_______________  ← 건강: 특정 시점에서 평평해짐 (PMF 신호)
   │   \
   │    \
   │     \
   │      \
   │       \___________→ 0  ← 불건강: 계속 하락 (PMF 미달)
   └──────────────────
         Time
```

### Retention Benchmark (2024 기준)

| 제품 유형           | D1  | D7  | D30 | Good     |
| --------------- | --- | --- | --- | -------- |
| SaaS B2B        | 80% | 60% | 45% | D30 >40% |
| Consumer Social | 40% | 25% | 15% | D30 >15% |
| E-commerce      | 30% | 15% | 8%  | D30 >8%  |
| Gaming (Casual) | 35% | 15% | 5%  | D30 >5%  |

## Unit Economics

### 핵심 지표

**CAC (Customer Acquisition Cost)**

```
CAC = 총 마케팅/영업 비용 ÷ 신규 고객 수

예: $100,000 마케팅 비용 / 500 신규 고객 = $200 CAC
```

**LTV (Lifetime Value)**

```
LTV = ARPU × Gross Margin × (1 / Churn Rate)

예: $50/월 × 70% margin × (1/5% monthly churn) = $700

또는 간단히:
LTV = ARPU × Average Customer Lifetime
    = $50/월 × 20개월 = $1,000
```

**LTV/CAC Ratio**

```
LTV/CAC > 3x → 건강한 비즈니스
LTV/CAC 1-3x → 개선 필요
LTV/CAC < 1x → 돈을 잃고 있음 ⚠️
```

**Payback Period**

```
Payback = CAC ÷ (ARPU × Gross Margin)

예: $200 ÷ ($50 × 70%) = 5.7개월

목표: <12개월 (SaaS)
```

### Unit Economics 대시보드

```markdown
| 지표 | 현재 | 목표 | 상태 |
|------|------|------|------|
| CAC | $200 | $150 | 🟡 |
| LTV | $700 | $900 | 🟡 |
| LTV/CAC | 3.5x | >3x | 🟢 |
| Payback | 5.7개월 | <6개월 | 🟢 |
| Monthly Churn | 5% | <3% | 🔴 |
| ARPU | $50 | $60 | 🟡 |
| Gross Margin | 70% | 75% | 🟡 |
```

## 메트릭 대시보드 설계

### 레이어별 대시보드

**Level 1: Executive (경영진)**

* North Star Metric + 추세
* Revenue (MRR, ARR, Growth rate)
* Unit Economics (LTV, CAC, LTV/CAC)
* 핵심 지표 3-5개

**Level 2: Product (PO/PM)**

* AARRR 단계별 전환율
* Feature adoption rates
* Retention cohorts
* 실험 결과

**Level 3: Team (Engineering/Design)**

* 기능별 사용률
* 에러/성능 지표
* Sprint velocity
* 기술 부채 지표

### 대시보드 설계 원칙

1. **한 눈에 파악**: 스크롤 없이 핵심 지표 파악
2. **액션 연결**: "이 숫자가 빨간색이면 무엇을 해야 하는가?"
3. **비교 가능**: 이전 기간, 목표, 벤치마크와 비교
4. **실시간성**: 얼마나 자주 업데이트되는지 명시
5. **접근성**: 팀 전원이 볼 수 있어야
