# Analytics

## Product Analytics 도구

### 주요 도구 비교

| 도구                   | 강점                                    | 약점        | 적합한 상황            |
| -------------------- | ------------------------------------- | --------- | ----------------- |
| **Amplitude**        | 코호트/퍼널 분석 강력, 행동 기반 세그먼트              | 비용, 러닝커브  | 중대규모 B2B/B2C      |
| **Mixpanel**         | 이벤트 분석 직관적, 빠른 셋업                     | 고급 분석 제한적 | 초중기 스타트업          |
| **PostHog**          | 오픈소스, Feature flag 통합, Session replay | 대규모 처리 제한 | 엔지니어링 중심 팀, 비용 민감 |
| **Google Analytics** | 무료, 웹 트래픽 분석                          | 제품 분석 약함  | 마케팅/트래픽 분석        |
| **Heap**             | 자동 이벤트 수집 (codeless)                  | 분석 깊이 제한  | 빠른 시작 필요          |

### 도구 선택 기준

1. **데이터 규모**: 월간 이벤트 수
2. **팀 역량**: SQL 가능한가? 셀프서비스 필요한가?
3. **예산**: 무료 티어로 충분한가?
4. **통합**: Feature flag, A/B test, CDP와의 연동
5. **데이터 소유**: Self-hosted 필요한가? (GDPR 등)

## Event Tracking 설계

### Tracking Plan 구조

```markdown
| Event Name | Description | Properties | Trigger |
|-----------|-------------|------------|---------|
| page_viewed | 페이지 조회 | page_name, referrer | 페이지 로드 시 |
| button_clicked | 버튼 클릭 | button_name, location | 클릭 시 |
| project_created | 프로젝트 생성 | template_used, team_size | 생성 완료 시 |
| feature_used | 기능 사용 | feature_name, duration | 기능 사용 시 |
| signup_completed | 가입 완료 | method, referral_source | 가입 완료 시 |
```

### Event Naming Convention

```
[object]_[action] (snake_case)

예:
project_created
task_completed
invite_sent
payment_submitted
onboarding_step_completed
```

### 이벤트 설계 원칙

1. **행동 기반**: 시스템 이벤트가 아닌 사용자 행동을 추적
2. **맥락 포함**: 이벤트에 충분한 property 부착 (세그먼트 분석을 위해)
3. **일관된 명명**: 팀 전체가 같은 컨벤션 사용
4. **과하지 않게**: 모든 클릭이 아닌 비즈니스 의미 있는 이벤트
5. **문서화**: Tracking plan은 living document로 관리

### User Properties vs Event Properties

```
User Properties (사용자에 고정):
  - plan_type: "pro"
  - company_size: "50-200"
  - signup_date: "2025-01-15"
  - role: "admin"

Event Properties (이벤트마다 다름):
  - button_name: "create_project"
  - page_name: "dashboard"
  - duration_seconds: 45
```

## User Behavior Analysis

### 핵심 분석 패턴

**1. Funnel Analysis**

```
가입 → 온보딩 완료 → 첫 핵심 액션 → 7일 재방문 → 유료 전환
```

각 단계 전환율 측정, 가장 큰 drop-off 식별

**2. Path Analysis** 사용자가 실제로 어떤 경로로 이동하는지 시각화 → 의도한 경로 vs 실제 경로의 차이 발견

**3. Cohort Analysis** 같은 시점에 가입한 사용자 그룹의 시간에 따른 행동 추적 → 제품 변화의 영향 측정

**4. Power User Analysis** 가장 활발한 상위 10% 사용자의 행동 패턴 분석 → 이상적인 사용 패턴 발견 → 다른 사용자를 이 패턴으로 유도

**5. Feature Adoption**

```
Awareness: 기능의 존재를 아는 비율
Activation: 첫 사용
Engagement: 반복 사용
Retention: 지속 사용
```

## SQL for Product Analysis

### 필수 쿼리 패턴

**일별 활성 사용자 (DAU)**

```sql
SELECT date, COUNT(DISTINCT user_id) as dau
FROM events
WHERE date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY date
ORDER BY date;
```

**주간 Retention (Cohort)**

```sql
WITH cohort AS (
  SELECT user_id,
         DATE_TRUNC('week', MIN(created_at)) as cohort_week
  FROM users
  GROUP BY user_id
)
SELECT
  c.cohort_week,
  DATE_TRUNC('week', e.timestamp) as activity_week,
  COUNT(DISTINCT e.user_id) as active_users
FROM cohort c
JOIN events e ON c.user_id = e.user_id
GROUP BY 1, 2
ORDER BY 1, 2;
```

**Funnel Conversion**

```sql
WITH funnel AS (
  SELECT
    user_id,
    MAX(CASE WHEN event = 'signup' THEN 1 END) as step_1,
    MAX(CASE WHEN event = 'onboarding_complete' THEN 1 END) as step_2,
    MAX(CASE WHEN event = 'first_project' THEN 1 END) as step_3
  FROM events
  WHERE date >= '2025-01-01'
  GROUP BY user_id
)
SELECT
  COUNT(*) as total,
  SUM(step_1) as signup,
  SUM(step_2) as onboarding,
  SUM(step_3) as first_project,
  ROUND(100.0 * SUM(step_2) / SUM(step_1), 1) as s1_to_s2_pct,
  ROUND(100.0 * SUM(step_3) / SUM(step_2), 1) as s2_to_s3_pct
FROM funnel;
```

## Dashboard 설계 원칙

### 1. 목적 명확화

* 이 대시보드는 **누가** **어떤 결정**을 위해 보는가?
* 하나의 대시보드 = 하나의 목적

### 2. 구조

```
┌────────────────────────────────────────┐
│ 핵심 지표 (NSM + 3-5개 KPI) — 한 줄    │  ← Summary
├────────────────────────────────────────┤
│ 추세 차트 (시간에 따른 변화)              │  ← Trend
├──────────────────┬─────────────────────┤
│ 세그먼트 분석     │ 퍼널 전환율           │  ← Detail
├──────────────────┼─────────────────────┤
│ 코호트 리텐션     │ 기능별 사용률          │  ← Deep dive
└──────────────────┴─────────────────────┘
```

### 3. 시각화 선택

| 데이터 유형   | 시각화              |
| -------- | ---------------- |
| 추세 (시계열) | 라인 차트            |
| 비교       | 바 차트             |
| 비율/구성    | 파이/도넛 차트 (최대 5개) |
| 분포       | 히스토그램            |
| 상관관계     | 산점도              |
| 단일 숫자    | Big number + 변화율 |

### 4. 경고 시스템

핵심 지표에 임계값 설정:

* 🟢 목표 이상
* 🟡 목표 미만 ~80%
* 🔴 목표 미만 ~60% → 즉시 조사
