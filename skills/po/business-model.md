# Business Model - Complete Content

## SaaS Business Model

### SaaS 핵심 특성

* **구독 기반 수익**: MRR(Monthly Recurring Revenue) / ARR(Annual)
* **높은 Gross Margin**: 70-90% (소프트웨어는 복제 비용이 거의 없음)
* **예측 가능한 매출**: 구독 → 미래 매출 예측 가능
* **확장 수익(Expansion)**: 기존 고객에서 추가 매출 (upsell, cross-sell)

### SaaS 핵심 지표

```
MRR = 월간 반복 매출
ARR = MRR × 12
Net Revenue Retention (NRR) = (시작 MRR + Expansion - Churn - Contraction) / 시작 MRR
Gross Revenue Retention (GRR) = (시작 MRR - Churn - Contraction) / 시작 MRR

좋은 SaaS 기준:
  NRR > 120% (확장이 이탈을 넘어섬)
  GRR > 90%
  Gross Margin > 70%
  CAC Payback < 12개월
```

### SaaS Growth 공식

```
Net New ARR = New ARR + Expansion ARR - Churned ARR

성장 = 새 고객 + 기존 고객 확장 - 이탈

3T2D Rule of 40:
  Growth Rate + Profit Margin ≥ 40%
  (성장률 + 이익률의 합이 40% 이상이면 건강)
```

## B2B vs B2C vs B2B2C

|             | B2B              | B2C                  | B2B2C          |
| ----------- | ---------------- | -------------------- | -------------- |
| **고객**      | 기업               | 개인                   | 기업를 통해 개인      |
| **의사결정**    | 복잡 (다수 관여)       | 단순 (개인)              | 중간             |
| **세일즈 사이클** | 길다 (월-년)         | 짧다 (분-일)             | 다양             |
| **ACV**     | 높음 ($5K-$1M+)    | 낮음 ($5-$200)         | 중간             |
| **Churn**   | 낮음 (2-5%/년)      | 높음 (5-10%/월)         | 중간             |
| **GTM**     | Sales-led 또는 PLG | Marketing-led        | Partnership    |
| **성공 지표**   | ARR, NRR, ACV    | MAU, Conversion, LTV | GMV, Take rate |

### B2B 특수성

* **Multi-stakeholder**: 사용자 ≠ 구매자 ≠ 결정자
* **Enterprise sales**: RFP, 보안 심사, 계약 협상
* **Integration**: 기존 시스템과의 연동 필수
* **SLA**: 가용성, 지원 수준 보장 필요

## Revenue Models

### Subscription (구독)

```
장점: 예측 가능, 높은 LTV, 안정적 현금흐름
단점: 초기 매출 작음, churn 관리 필수
예시: Slack, Notion, Spotify
```

### Freemium

```
장점: 낮은 진입 장벽, 바이럴, PLG 적합
단점: 무료→유료 전환율이 핵심 (2-5% 일반적)
예시: Zoom, Dropbox, Figma
```

### Usage-Based (사용량 기반)

```
장점: 고객 성장에 따라 매출 자동 증가, 진입 장벽 낮음
단점: 매출 예측 어려움, 사용량 최적화 위험
예시: AWS, Twilio, OpenAI API
```

### Marketplace / Transaction Fee

```
장점: 네트워크 효과, 확장성
단점: 양면시장 초기 구축 어려움 (chicken-and-egg)
예시: Airbnb (호스트 수수료), Stripe (거래 수수료)
```

### Hybrid Model

대부분의 성숙한 SaaS는 **복합 모델**:

* Base subscription + Usage overage (Slack)
* Freemium + Per seat + Feature tier (Notion)
* Platform fee + Transaction fee (Shopify)

## Unit Economics Deep Dive

### CAC (Customer Acquisition Cost)

```
Blended CAC = 총 S&M 비용 / 총 신규 고객
Paid CAC = 유료 마케팅 비용 / 유료 채널 고객
Organic CAC = 0 (또는 매우 낮음)

CAC 구성:
  - 마케팅 비용 (광고, 콘텐츠, 이벤트)
  - 영업 비용 (급여, 커미션, 도구)
  - 온보딩 비용 (CS, 교육)
```

### LTV (Lifetime Value)

```
Simple: LTV = ARPU × Gross Margin / Churn Rate
Advanced: LTV = ARPU × Gross Margin × Σ(1/(1+d)^t × Retention(t))
  (d = discount rate, t = 기간)

LTV 개선 레버:
  1. ARPU 증가 (upsell, pricing)
  2. Churn 감소 (retention)
  3. Gross Margin 개선 (비용 최적화)
```

### Magic Number

```
Magic Number = Net New ARR / 전 분기 S&M 비용

> 1.0: 매우 효율적 → 더 투자
0.5-1.0: 적절 → 유지
< 0.5: 비효율 → S&M 최적화 필요
```

### Burn Multiple

```
Burn Multiple = Net Burn / Net New ARR

< 1x: 매우 효율적
1-2x: 좋음
2-3x: 평균
> 3x: 비효율 ⚠️
```

## Monetization Timing

### 언제 수익화를 시작할 것인가?

```
PMF 전: ❌ 수익화 → 가치 검증에 집중
PMF 직후: 🟡 초기 수익화 → 지불 의향 확인
PMF 확인 후: ✅ 본격 수익화 → 가격 최적화, 확장

PMF 신호:
  - Retention curve가 평평해짐
  - 유기적 성장 발생
  - 사용자가 돈을 내겠다고 먼저 물어봄
```

### 수익화 단계

```
Stage 1: Value Discovery (PMF 전)
  → 무료 또는 매우 저가
  → 목표: 사용자 확보, 가치 검증

Stage 2: Value Validation (PMF 달성)
  → 초기 가격 설정
  → 목표: 지불 의향 확인, 가격 민감도 테스트

Stage 3: Value Optimization (Scale)
  → 가격 최적화, 티어 설계
  → 목표: ARPU 최대화, NRR 개선

Stage 4: Value Expansion (Mature)
  → 새 제품/서비스, 플랫폼화
  → 목표: TAM 확장, 신규 수익원
```

### 너무 일찍 수익화하면?

* 사용자 성장 저해 (무료 경쟁자에게 뺏김)
* "지불 의향 있는 사용자"와 "제품을 진정으로 좋아하는 사용자"가 다를 수 있음

### 너무 늦게 수익화하면?

* "무료니까 쓰는" 사용자가 유료 전환 거부
* 수익 없이 번아웃 (스타트업 생존 위협)
* 사용자의 지불 의향이 실제로 있는지 확인 불가
