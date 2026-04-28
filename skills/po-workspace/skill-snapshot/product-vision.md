# Product Vision

## 비전 계층 구조: Vision → Strategy → Roadmap → Backlog

제품 비전은 **피라미드의 꼭대기**다. 모든 제품 의사결정은 이 계층을 따라 흐른다.

```
        ┌─────────┐
        │  Vision  │  ← WHY: 우리가 존재하는 이유 (3-10년)
        ├─────────┤
        │ Strategy │  ← HOW: 비전을 달성하는 방법 (1-3년)
        ├─────────┤
        │ Roadmap  │  ← WHAT: 언제 무엇을 할 것인가 (분기-1년)
        ├─────────┤
        │ Backlog  │  ← DETAIL: 구체적 작업 항목 (주-월)
        └─────────┘
```

### Vision (비전) — 3~10년

* 제품이 만들어낼 **미래 세계**에 대한 선언
* 영감을 주고, 방향을 잡아주는 **North Star**
* 변경 빈도: 거의 없음 (피벗 시에만)

### Strategy (전략) — 1~3년

* 비전을 달성하기 위한 **구체적 접근 방법**
* 시장, 경쟁, 기술 환경을 반영한 선택과 집중
* 변경 빈도: 연 1-2회 검토

### Roadmap (로드맵) — 분기~1년

* 전략을 실행하기 위한 **타임라인과 우선순위**
* Outcome 기반으로 작성 (기능 나열이 아닌)
* 변경 빈도: 분기별 검토

### Backlog (백로그) — 주~월

* 로드맵의 항목을 **실행 가능한 단위**로 분해
* User story, acceptance criteria 포함
* 변경 빈도: 매 스프린트

## Vision Statement 작성법

### 좋은 비전의 조건

1. **영감을 준다** — 팀이 아침에 일어나고 싶게 만든다
2. **방향을 잡아준다** — 의사결정의 필터 역할
3. **기억하기 쉽다** — 한 문장으로 전달 가능
4. **야심적이되 달성 가능하다** — 10년 안에 현실이 될 수 있는
5. **고객 중심이다** — 기술이나 기능이 아닌 고객 가치

### Vision Statement 템플릿

**Geoffrey Moore 포지셔닝 기반:**

```
For [target customer]
Who [statement of need or opportunity]
The [product name] is a [product category]
That [key benefit, reason to buy]
Unlike [primary competitive alternative]
Our product [statement of primary differentiation]
```

**Outcome 기반:**

```
In [timeframe], [product name] will [desired future state]
by [how we'll achieve it], enabling [target users] to [key outcome].
```

**실제 예시:**

* **Spotify**: "음악을 위한 모든 순간에 함께하는 동반자"
* **Notion**: "모든 팀의 connected workspace"
* **Linear**: "소프트웨어 프로젝트를 빌드하는 가장 좋은 방법"
* **Figma**: "디자인을 모든 사람이 접근할 수 있게 만든다"

### 비전 작성 프로세스

1. **현재 상태 진단**: 시장, 고객, 경쟁 환경 분석
2. **미래 상태 정의**: 3-10년 후 이상적인 세계
3. **핵심 가치 추출**: 우리가 제공하는 고유한 가치
4. **초안 작성**: 여러 버전 작성 후 피드백
5. **검증**: 팀원, 고객, 이해관계자에게 공유하고 반응 확인
6. **확정 및 커뮤니케이션**: 전사 공유, 반복 전달

## North Star Metric (NSM) 설정

### NSM이란?

팀 전체가 집중하는 **단일 핵심 지표**. 제품이 고객에게 전달하는 가치를 가장 잘 반영하는 지표.

### 좋은 NSM의 조건 (Amplitude 기준)

1. **고객 가치를 반영한다** — revenue가 아닌 고객이 받는 가치
2. **제품 비전과 연결된다** — 장기적 성공을 예측
3. **Leading indicator다** — 매출보다 먼저 움직인다
4. **실행 가능하다** — 팀이 직접 영향을 줄 수 있다
5. **이해하기 쉽다** — 누구나 직관적으로 이해

### NSM 설정 프레임워크

```
Step 1: 제품의 핵심 가치 정의
  → "사용자가 우리 제품에서 얻는 가장 중요한 것은?"

Step 2: 가치 전달 순간 식별
  → "사용자가 그 가치를 경험하는 구체적 행동/이벤트는?"

Step 3: 측정 가능한 지표로 변환
  → "그 행동을 어떤 수치로 표현할 수 있는가?"

Step 4: 검증
  → "이 지표가 올라가면 비즈니스도 성장하는가?"
```

### 업종별 NSM 예시

| 제품 유형            | NSM 예시              | 이유         |
| ---------------- | ------------------- | ---------- |
| SaaS (B2B)       | Weekly Active Teams | 팀 단위 가치 전달 |
| Marketplace      | 주간 거래 완료 수          | 양면 가치 매칭   |
| Social/Community | DAU/MAU ratio       | 습관화 수준     |
| Content          | 주간 소비 시간            | 콘텐츠 가치     |
| Fintech          | 월간 활성 계좌            | 금융 서비스 활용  |
| E-commerce       | 주간 구매 고객 수          | 핵심 전환      |

### NSM Input Tree

NSM을 분해하여 **팀별로 영향을 줄 수 있는 input metric**을 도출한다:

```
               NSM: Weekly Active Teams
              /          |           \
     New Team    Returning Team    Team Size
     Activation   Retention         Growth
      /    \        /     \          /    \
   Signup  Onboard  W1Ret  W4Ret  Invite  Collab
   Rate    Compl    Rate   Rate   Rate    Rate
```

## Product-Market Fit (PMF) 판단 기준

### Sean Ellis Test

핵심 질문: "이 제품을 더 이상 사용할 수 없다면 어떤 기분일까?"

* **40% 이상이 "매우 실망"** → PMF 달성 신호
* 30-40% → 거의 도달, 개선 필요
* 30% 미만 → PMF 미달

### PMF 정성적 신호

* 사용자가 알아서 다른 사람에게 추천한다
* 제품 없이는 이전 방식으로 돌아갈 수 없다고 느낀다
* 마케팅 없이도 organic growth가 발생한다
* 사용자가 부족한 부분에 대해 적극적으로 피드백한다 (무관심이 아닌)

### PMF 정량적 신호

| 지표                 | PMF 신호                       | 위험 신호     |
| ------------------ | ---------------------------- | --------- |
| Retention (M1)     | >40% (SaaS), >25% (Consumer) | <20%      |
| NPS                | >50                          | <0        |
| Organic/Paid ratio | >50% organic                 | >80% paid |
| DAU/MAU            | >25% (Consumer)              | <15%      |
| Time to value      | 줄어드는 추세                      | 늘어나는 추세   |
| Payback period     | <12개월                        | >18개월     |

### PMF 달성 전 vs 후 전략

**PMF 전 (0→1)**:

* 좁은 세그먼트에 집중 (niche down)
* 빠른 실험과 학습
* 수동 프로세스 OK (do things that don't scale)
* retention > acquisition

**PMF 후 (1→N)**:

* Growth 가속
* 프로세스 자동화/체계화
* 인접 세그먼트 확장
* Unit economics 최적화

## 비전 커뮤니케이션 프레임워크

### 대상별 메시지 차별화

| 대상     | 강조점              | 형식            |
| ------ | ---------------- | ------------- |
| 경영진    | 비즈니스 임팩트, 시장 기회  | 1-pager, 전략 덱 |
| 개발팀    | 기술적 도전, 사용자 임팩트  | 비전 문서, 데모     |
| 디자인팀   | 사용자 경험, 감성적 가치   | 비전 보드, 프로토타입  |
| 영업/마케팅 | 고객 가치, 경쟁 우위     | 포지셔닝 문서       |
| 투자자    | TAM, 성장 잠재력, 차별화 | 피치덱           |

### 반복 전달의 원칙

* **"한 번 말하면 충분하다"는 착각** — 최소 7번 반복해야 팀이 내재화
* 매주 all-hands, sprint review에서 비전 연결
* 새 기능/프로젝트 시작 시 항상 비전과의 연결고리 설명
* 시각적 아티팩트 (포스터, Slack 채널 설명 등)로 상시 노출

### 비전 점검 질문

정기적으로 (분기 1회) 다음을 확인:

1. 팀원에게 "우리 제품의 비전이 뭐야?"라고 물었을 때 일관된 답이 나오는가?
2. 최근 의사결정에서 비전이 필터 역할을 했는가?
3. 시장 환경 변화로 비전 업데이트가 필요한가?
4. 새로 합류한 멤버가 비전을 이해하고 있는가?
