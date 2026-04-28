# Product Leadership

## Product Culture 구축

### Empowered Product Culture vs Feature Factory

| Feature Factory  | Empowered Culture    |
| ---------------- | -------------------- |
| 이해관계자가 기능 목록 전달  | 팀에게 문제/outcome 부여    |
| PO = 프로젝트 매니저    | PO = 미니 CEO          |
| 성과 = 출시한 기능 수    | 성과 = 달성한 outcome     |
| "언제 되나요?"        | "어떤 임팩트를 만들었나요?"     |
| Roadmap = 기능 일정표 | Roadmap = outcome 방향 |
| Discovery 없음     | 주간 Discovery 리듬      |

### Product Culture 구축 단계

```
1. Language (언어 바꾸기)
   → "기능" 대신 "outcome", "output" 대신 "impact"
   → 팀 내 용어를 통일

2. Rituals (의식 만들기)
   → 주간 Discovery Session
   → 월간 Metrics Review
   → 분기 Strategy Review

3. Artifacts (산출물 바꾸기)
   → Feature roadmap → Outcome roadmap
   → Gantt chart → Now/Next/Later
   → 프로젝트 보고 → Impact 보고

4. Incentives (보상 구조)
   → 기능 출시가 아닌 지표 개선에 보상
   → 실패한 실험에서 학습한 팀 인정
```

## 팀 역량 개발과 멘토링

### PO/PM 성장 단계 (Ravi Mehta의 Product Competency Framework)

| 역량                    | Junior | Mid    | Senior       | Lead      |
| --------------------- | ------ | ------ | ------------ | --------- |
| **Product Execution** | 기능 정의  | 전체 PRD | 전략적 기획       | 팀 표준 수립   |
| **Customer Insight**  | 인터뷰 참관 | 독립 인터뷰 | Discovery 리드 | 조직 리서치 체계 |
| **Product Strategy**  | 전략 이해  | 전략 기여  | 전략 수립        | 비전 설정     |
| **Influencing**       | 팀 내 소통 | 크로스팀   | 경영진 설득       | 조직 변화 주도  |
| **Data & Analytics**  | 지표 이해  | 분석 수행  | 실험 설계        | 데이터 문화 구축 |

### 멘토링 프레임워크

**1:1 미팅 구조 (30분, 주간)**

```
1. 근황/감정 체크 (5분)
   → "이번 주 어떠셨어요? 에너지 레벨은?"

2. 현재 과제 (15분)
   → 진행 중인 작업에서 어려운 점
   → 함께 문제 해결 (답을 주기보다 질문으로 유도)

3. 성장 영역 (10분)
   → 장기 성장 목표 확인
   → 리소스 추천 (책, 아티클, 사례)
   → 다음 주 도전 과제 설정
```

**멘토링 원칙:**

* **답을 주지 말고 질문한다**: "어떻게 생각해요?"가 "이렇게 해요"보다 낫다
* **실패를 허용한다**: 안전한 환경에서 실수하고 학습
* **점진적 위임**: 작은 결정부터 → 큰 결정으로 범위 확대
* **피드백은 즉시**: 분기 리뷰까지 기다리지 않는다

## Product Review 운영

### Product Review의 목적

* 전략과의 정렬 확인
* Cross-functional 피드백 수집
* 품질 기준 유지
* 팀 학습 촉진

### Product Review 구조 (30분, 격주)

```
1. Context (5분)
   → 어떤 문제를 해결하는가?
   → 관련 데이터/고객 인사이트

2. Demo (10분)
   → 현재 상태 시연
   → 핵심 사용자 플로우

3. 피드백 & 토론 (10분)
   → 구조화된 피드백:
     - 잘된 점 (Keep)
     - 우려 사항 (Concern)
     - 제안 (Suggest)

4. 결정 & 다음 스텝 (5분)
   → Go / No-Go / 수정 필요
   → 구체적 액션 아이템
```

### Product Review 안티패턴

* **HiPPO Review**: 가장 높은 사람의 취향 리뷰 → 데이터/사용자 기반 논의로
* **Detail Spiral**: 색상/폰트 논의에 빠짐 → 전략적 질문에 집중
* **없는 Review**: 리뷰 없이 출시 → 최소한 PO + Tech Lead + Design Lead

## Product Council/Board 관리

### 언제 필요한가?

* 여러 제품/팀이 있는 조직
* 리소스 배분 결정이 필요한 경우
* 제품 간 전략 정렬이 필요한 경우

### Product Council 구성

```
참석자: VP Product + 각 팀 PO/PM Lead + CTO + 필요 시 CEO
주기: 월간 또는 분기
시간: 90분

어젠다:
1. 전체 제품 포트폴리오 상태 (15분)
2. 전략 정렬 점검 (20분)
3. 리소스 배분 논의 (30분)
4. Cross-product 의존성 (15분)
5. 결정 & 다음 스텝 (10분)
```

## 실패에서 배우는 문화

### Blameless Post-mortem

```markdown
## Post-mortem: [이벤트/실패 제목]

**날짜**: YYYY-MM-DD
**참석자**: [관련된 모든 사람]
**원칙**: 사람이 아닌 시스템을 개선한다

### 타임라인
| 시간 | 사건 |
|------|------|
| ... | ... |

### 임팩트
- [영향받은 사용자 수, 기간, 비즈니스 영향]

### Root Cause (5 Whys)
1. Why? →
2. Why? →
3. Why? →
4. Why? →
5. Why? → [근본 원인]

### 교훈
1. [학습 1]
2. [학습 2]

### Action Items
| 액션 | 담당 | 기한 | 유형 |
|------|------|------|------|
| | | | 예방/감지/대응 |
```

### 실패 문화의 원칙

1. **실패 = 학습** (가설이 틀린 것도 가치 있는 결과)
2. **빠르게 실패** (3개월 후보다 2주 후가 낫다)
3. **같은 실패를 반복하지 않는다** (학습을 시스템에 반영)
4. **투명하게 공유** (실패를 숨기면 조직이 학습하지 못한다)
5. **실패의 규모를 관리** (작은 실험으로 실패, 큰 베팅으로 성공)
