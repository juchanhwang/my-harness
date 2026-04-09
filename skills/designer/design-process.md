# Design Process

## 1. 더블 다이아몬드 (Double Diamond)

British Design Council이 제안한 디자인 프로세스 모델. 발산(Diverge)과 수렴(Converge)의 반복.

```
Diamond 1: 올바른 문제 찾기         Diamond 2: 올바른 솔루션 찾기
        ╱ ╲                               ╱ ╲
      ╱     ╲                           ╱     ╲
    ╱ Discover ╲                      ╱ Develop  ╲
  ╱               ╲                 ╱               ╲
╱                   ╲             ╱                   ╲
╲                   ╱             ╲                   ╱
  ╲               ╱                 ╲               ╱
    ╲  Define   ╱                     ╲  Deliver ╱
      ╲       ╱                         ╲       ╱
        ╲   ╱                             ╲   ╱
```

### Discover (발견) — 발산

문제 공간을 넓게 탐색.

* 사용자 인터뷰, 필드 관찰
* 경쟁사 분석, 시장 리서치
* 데이터 분석 (분석 도구, 지원 티켓)
* Stakeholder 인터뷰

### Define (정의) — 수렴

발견한 인사이트를 정리하고 핵심 문제를 정의.

* Affinity mapping (친화도 분석)
* Persona 또는 JTBD (Jobs to Be Done)
* How Might We (HMW) 질문
* Problem Statement 작성
* 우선순위 결정

### Develop (개발) — 발산

다양한 솔루션을 탐색.

* 아이데이션 워크샵 (Crazy 8s, Brainstorming)
* 와이어프레임, 프로토타입
* 사용성 테스트
* 반복적 개선

### Deliver (전달) — 수렴

최종 솔루션을 정교화하고 출시.

* High-fidelity 디자인
* 개발 핸드오프
* QA, 디자인 QA
* 출시 후 모니터링

---

## 2. Design Sprint (Google Ventures)

Jake Knapp이 개발한 5일 집중 프로세스. 큰 문제를 빠르게 검증.

### 5일 프로세스

**Monday — Map & Choose**

* 장기 목표 설정
* Sprint 질문 작성 ("~할 수 있을까?")
* 전문가 인터뷰
* 문제 공간 맵핑
* 타겟 선정 (어떤 사용자, 어떤 순간)

**Tuesday — Sketch**

* Lightning Demos (영감 수집)
* 개인별 솔루션 스케치
* Crazy 8s (8분, 8가지 아이디어)
* Solution Sketch (상세 3패널 스토리보드)

**Wednesday — Decide**

* Art Museum (스케치 전시)
* Heat Map 투표 (스티커 점)
* Speed Critique
* Decider 최종 결정
* 스토리보드 작성 (테스트용)

**Thursday — Prototype**

* 하루 만에 사실적 프로토타입 제작
* Figma로 핵심 플로우만
* "충분히 진짜처럼" 보이면 OK
* 인터뷰 스크립트 준비

**Friday — Test**

* 5명 사용성 테스트
* 1:1 인터뷰 (각 60분)
* 관찰 + 패턴 발견
* Sprint 결과 정리

### Design Sprint 적합 상황

* 새 제품/기능의 방향성 검증
* 중요한 사용자 경험 문제 해결
* 팀 간 합의가 필요한 디자인 결정
* 시간이 제한된 상황 (빠른 검증)

---

## 3. 디자인 씽킹 (Design Thinking)

IDEO/Stanford d.school의 5단계 프로세스.

### 5단계

**1. Empathize (공감)**

* 사용자 관찰 및 인터뷰
* Empathy Map 작성 (Says, Thinks, Does, Feels)
* 가정이 아닌 관찰 기반

**2. Define (정의)**

* Point of View (POV) 문장: "[사용자]는 [니즈]가 필요하다. 왜냐하면 [인사이트]이기 때문이다."
* How Might We (HMW) 질문 도출

**3. Ideate (아이디어)**

* 브레인스토밍 (판단 유보, 양이 질)
* Mind Mapping
* SCAMPER (Substitute, Combine, Adapt, Modify, Put to other use, Eliminate, Reverse)

**4. Prototype (프로토타입)**

* 빠르고 저렴하게 만들기
* 핵심 가설을 테스트할 수 있을 정도만
* "완벽"은 적. "충분히 좋은"이 목표

**5. Test (테스트)**

* 프로토타입으로 사용자 테스트
* 관찰 + 피드백 수집
* 인사이트 → 다시 Empathize 또는 Ideate로

**비선형**: 단계 간 자유롭게 이동. 테스트 후 다시 공감 단계로 돌아갈 수 있음.

---

## 4. Lean UX

Eric Ries의 Lean Startup을 UX에 적용. 가설 기반 반복.

### 핵심 루프

```
가설 → 최소 실험 → 측정 → 학습 → (반복)
```

### Lean UX Canvas

1. **Business Problem**: 해결할 비즈니스 문제
2. **Business Outcomes**: 측정 가능한 비즈니스 결과
3. **Users**: 대상 사용자
4. **User Outcomes & Benefits**: 사용자가 얻는 가치
5. **Solutions**: 가능한 솔루션 아이디어
6. **Hypotheses**: "우리는 [이 기능]이 [이 사용자]에게 [이 결과]를 가져올 것이라고 믿는다"
7. **MVP (Minimum Viable Product)**: 가설 검증을 위한 최소 제품
8. **Experiments**: 가설 검증 방법

### Lean UX vs 전통적 UX

| | 전통적 UX | Lean UX |
|---|---|---|
| 산출물 | 상세 문서, 와이어프레임 | 가설, 실험 결과 |
| 프로세스 | 순차적 | 반복적, 병렬적 |
| 리서치 | 대규모, 선행 | 지속적, 작은 규모 |
| 결정 기반 | 전문가 판단 | 데이터 + 실험 |
| 팀 구조 | 역할 분리 | 교차 기능 팀 |

---

## 5. Jobs to Be Done (JTBD)

Clayton Christensen의 프레임워크. 사용자의 "직업(Job)"에 초점.

### JTBD 문장

```
When [상황], I want to [동기], so I can [기대 결과].
```

예시:

```
When I'm commuting on the subway,
I want to catch up on industry news,
so I can stay informed without dedicating extra time.
```

### JTBD vs Persona

* Persona: "누구"에 초점 (35세, 마케터, 서울 거주)
* JTBD: "무엇을 하려는지"에 초점 (상황 + 동기 + 결과)
* 같은 Job을 가진 다양한 Persona가 존재할 수 있음
* 둘 다 유용. 상황에 따라 선택 또는 병행.

---

## 6. 프로세스 선택 가이드

| 상황 | 권장 프로세스 |
|------|------------|
| 새 제품 초기 탐색 | 디자인 씽킹 + 더블 다이아몬드 |
| 빠른 방향 검증 (1주) | Design Sprint |
| 지속적 개선 | Lean UX |
| 기능 추가/개선 | 간소화된 더블 다이아몬드 |
| 사용자 문제 발견 | 디자인 씽킹 (Empathize + Define) |
| 비즈니스 가설 검증 | Lean UX |

---

## 7. 실무 팁

### 프로세스 ≠ 교조

* 프로세스는 도구이지 목적이 아님
* 상황에 맞게 단계를 건너뛰거나 축소
* "프로세스를 따랐으니 좋은 디자인" ≠ 항상 참

### 시간 관리

* 발산(Discover/Develop)에 시간 제한 두기
* 60% 작업 → 피드백 → 나머지 40%
* "완벽한 리서치 후 디자인" ❌ → "충분한 리서치 후 빠른 검증" ✅

### 문서화

* 프로세스의 **결과물**보다 **결정과 근거**를 기록
* 디자인 결정 로그: "A 대신 B를 선택한 이유"
* 라이트웨이트 문서: Figma 코멘트, Notion 페이지

---

## 참고 자료

* British Design Council, "Double Diamond"
* Jake Knapp, "Sprint"
* IDEO, "Human-Centered Design Toolkit"
* Jeff Gothelf, "Lean UX"
* Clayton Christensen, "Competing Against Luck" (JTBD)
* Stanford d.school (dschool.stanford.edu)
