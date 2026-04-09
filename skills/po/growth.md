# Growth - 전체 콘텐츠

## Growth Hacking 프레임워크

### Growth Loop vs Funnel

전통적 퍼널(획득→활성화→수익)은 선형적이지만, 실제 성장은 **루프**로 작동한다.

```
Funnel (선형):
  Acquisition → Activation → Retention → Revenue
  (각 단계에서 탈락, 다시 맨 위부터)

Growth Loop (순환):
  New User → Core Action → Output → New User
  (아웃풋이 다시 인풋이 됨)
```

### Growth Loop 유형

**1. Viral Loop**

```
사용자 A가 제품 사용 → 자연스럽게 다른 사람에게 노출/초대
→ 사용자 B가 가입 → 사용자 B도 노출/초대 → ...
```

* Slack: 팀원 초대 → 팀 사용 → 다른 팀에 전파
* Figma: 디자인 공유 → 코멘트 → 가입

**2. Content Loop**

```
사용자가 콘텐츠 생성 → SEO/소셜로 발견 → 새 사용자 유입 → 콘텐츠 생성
```

* Notion: 템플릿 공유 → 검색 유입 → 가입

**3. Paid Loop**

```
Revenue → 마케팅 투자 → 신규 사용자 → Revenue
```

* LTV > CAC여야 작동

## Product-Led Growth (PLG)

### PLG란?

**제품 자체가 acquisition, activation, retention, expansion의 주요 드라이버**인 성장 전략. Sales/Marketing이 아닌 제품 경험이 성장을 이끈다.

### PLG 핵심 원칙

1. **End user가 먼저**: C-level이 아닌 실제 사용자부터 시작
2. **Self-serve**: 영업 없이 가입, 사용, 결제 가능
3. **Time to Value 최소화**: 가입 후 빠르게 가치 경험
4. **Viral by design**: 혼자 쓰면 좋고, 같이 쓰면 더 좋은 제품

### PLG Flywheel

```
     Evaluator (평가자)
    ↗                 ↘
Beginner (초보자)    Champion (옹호자)
    ↖                 ↙
     ← Expansion ←
```

1. **Evaluator**: 무료로 제품 체험
2. **Beginner**: 핵심 기능 사용 시작
3. **Regular**: 습관적 사용 (Aha moment 경험)
4. **Champion**: 팀에 추천, 확산
5. **Expansion**: 더 많은 기능/시트 구매

### PLG 핵심 지표

| 지표                           | 설명                  | 목표              |
| ---------------------------- | ------------------- | --------------- |
| TTV (Time to Value)          | 가입→가치 경험            | <5분             |
| Activation Rate              | 핵심 행동 수행 비율         | >40%            |
| PQL (Product Qualified Lead) | 제품 사용 기반 적격 리드      | 정의 필요           |
| Natural rate of growth       | Organic + viral 성장률 | >60% of total   |
| Expansion revenue            | 기존 고객 추가 매출         | >30% of new ARR |

## Activation 최적화

### Aha Moment 찾기

Aha Moment = 사용자가 **제품의 핵심 가치를 처음 경험하는 순간**

**찾는 방법:**

1. Retained user vs Churned user 비교
2. 초기 N일 내 행동 패턴 분석
3. 어떤 행동이 retention과 가장 강한 상관관계?

**유명한 예시:**

* Facebook: 10일 내 7명의 친구 추가
* Slack: 팀에서 2,000개 메시지 교환
* Dropbox: 1개 파일을 다른 기기에서 접근
* Zoom: 첫 미팅 호스트

### Activation Funnel 최적화

```
가입 → 온보딩 → 셋업 → 핵심 행동 → Aha Moment
  |       |        |        |           |
 95%     70%      50%      35%        25%  ← 각 단계 전환율 측정

→ 가장 큰 drop-off 단계에 집중
```

### 온보딩 패턴

1. **Product tour**: 인터랙티브 가이드 (Tooltip, Spotlight)
2. **Checklist**: 핵심 행동 리스트 + 진행률 표시
3. **Template**: 빈 상태(empty state) 대신 템플릿 제공
4. **Progressive disclosure**: 기능을 점진적으로 노출
5. **Personalization**: 사용 목적에 따라 경험 맞춤화

## Retention 전략

### Habit Loop (BJ Fogg / Nir Eyal)

```
Trigger (외부/내부)
    ↓
Action (핵심 행동)
    ↓
Variable Reward (보상)
    ↓
Investment (투자)
    ↓
    → Trigger (다시 돌아옴)
```

**제품 적용:**

* **Trigger**: 이메일 알림, 팀원 멘션, 습관적 체크
* **Action**: 앱 열기, 작업 확인, 코멘트 달기
* **Reward**: 새 알림, 진행 상황 확인, 성취감
* **Investment**: 데이터 축적, 설정 커스터마이징, 관계 형성

### Engagement Loop

```
Content/Activity 생성 → Notification → 재방문 → 새로운 Content 발견 → 참여
```

### Retention 개선 전략

| 단계            | 전략              | 예시            |
| ------------- | --------------- | ------------- |
| **D1** (첫날)   | 온보딩 최적화, TTV 단축 | 인터랙티브 튜토리얼    |
| **D7** (첫 주)  | 핵심 행동 반복 유도     | 이메일 넛지, 체크리스트 |
| **D30** (첫 달) | 습관 형성, 소셜 연결    | 팀 기능, 알림 설정   |
| **D90+** (장기) | 고급 기능 발견, 확장    | 파워유저 기능, 통합   |

## Viral Loop & Network Effects

### Viral Coefficient (K-factor)

```
K = i × c

i = 사용자당 평균 초대 수
c = 초대 → 가입 전환율

K > 1: 바이럴 성장 (자연 성장)
K = 0.5-1: 보조적 바이럴 (마케팅과 병행)
K < 0.5: 바이럴 약함
```

### Network Effects 유형

| 유형           | 설명                | 예시          |
| ------------ | ----------------- | ----------- |
| **Direct**   | 사용자가 많을수록 가치 증가   | 메신저, 전화     |
| **Indirect** | 한쪽 사용자가 다른쪽 가치 증가 | Marketplace |
| **Data**     | 데이터가 많을수록 제품 개선   | 추천 알고리즘     |
| **Platform** | 개발자/앱이 많을수록 가치    | App Store   |

## Pricing Strategy 기초

### Pricing Model 유형

| 모델              | 설명           | 적합한 경우   |
| --------------- | ------------ | -------- |
| **Flat rate**   | 단일 가격        | 단순한 제품   |
| **Per seat**    | 사용자 수 기반     | 협업 도구    |
| **Usage-based** | 사용량 기반       | API, 인프라 |
| **Tiered**      | 기능별 등급       | 다양한 세그먼트 |
| **Freemium**    | 기본 무료 + 프리미엄 | PLG      |

### Freemium 경계 설정

```
무료 (Hook)              유료 (Value)
─────────────────────    ─────────────────────
핵심 가치 경험 가능       고급 기능 / 더 많은 사용량
개인 사용에 충분          팀/비즈니스 기능
가치를 증명               가치를 확장

핵심: 무료가 너무 좋으면 전환 안 되고,
      너무 제한적이면 가치 경험이 안 된다.
```

### 가격 결정 원칙

1. **가치 기반 (Value-based)**: 비용이 아닌 고객이 받는 가치 기준
2. **경쟁 참조**: 시장 가격대를 벤치마크로
3. **테스트**: A/B 테스트로 가격 민감도 확인
4. **단순하게**: 이해하기 어려운 가격 구조 = 전환율 하락
