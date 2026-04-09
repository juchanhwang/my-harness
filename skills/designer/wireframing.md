# Wireframing

## 1. 와이어프레임이란?

UI의 골격(skeleton). 시각적 디자인을 배제하고 **구조, 콘텐츠 배치, 기능**에 집중하는 설계 도구. 색상, 타이포, 이미지 없이 레이아웃과 정보 우선순위를 결정한다.

---

## 2. Fidelity 레벨

### Low-Fidelity (Lo-fi)

**형태**: 손 스케치, 박스와 선, 텍스트 자리표시
**목적**: 빠른 아이디어 탐색, 다양한 접근법 비교
**소요 시간**: 화면당 5-15분
**도구**: 종이 + 펜, iPad + Pencil, Excalidraw

```
┌─────────────────────────┐
│ [Logo]    [Nav] [Nav] [□]│
├─────────────────────────┤
│                         │
│  xxxxxxxxxxxxxxxx       │
│  xxxx                   │
│                         │
│  [Button]               │
│                         │
├──────────┬──────────────┤
│ [■]      │ [■]          │
│ xxx      │ xxx          │
│ xxxxxxxx │ xxxxxxxx     │
└──────────┴──────────────┘
```

**장점**:

* 빠르게 여러 안 비교 가능
* "예쁜 디자인"에 피드백이 집중되는 것 방지
* 비디자이너도 참여 가능
* 버리기 쉬움 (Sunk cost 낮음)

### Mid-Fidelity (Mid-fi)

**형태**: 디지털 와이어프레임, 실제 텍스트, 기본 레이아웃
**목적**: 레이아웃 확정, 콘텐츠 구조 검증, 개발자 초기 논의
**소요 시간**: 화면당 30-60분
**도구**: Figma (wireframe kit), Balsamiq, Whimsical

* 실제 텍스트 사용 (Lorem ipsum 최소화)
* 기본 그리드와 spacing 적용
* 인터랙티브 영역 표시
* 컴포넌트 구분 (버튼, 입력, 카드)

### High-Fidelity (Hi-fi)

**형태**: 완성에 가까운 디자인, 실제 콘텐츠, 타이포/컬러
**목적**: 사용성 테스트, 이해관계자 승인, 개발 핸드오프
**소요 시간**: 화면당 2-8시간
**도구**: Figma (primary)

* 디자인 시스템 컴포넌트 사용
* 실제 데이터/콘텐츠
* 인터랙션 프로토타입 포함
* 반응형 변형 (모바일/태블릿/데스크톱)

### 언제 어떤 Fidelity?

| 상황 | 권장 Fidelity |
|------|-------------|
| 아이디어 탐색, 브레인스토밍 | Lo-fi |
| 이해관계자에게 방향성 설명 | Lo-fi ~ Mid-fi |
| 사용성 테스트 (초기) | Mid-fi |
| 개발자 협의 | Mid-fi |
| 사용성 테스트 (후기) | Hi-fi |
| 최종 승인, 핸드오프 | Hi-fi |

---

## 3. 와이어프레임 프로세스

### 1단계: 준비

* 유저 플로우 확인 (어떤 화면이 필요한지)
* 콘텐츠 인벤토리 (각 화면에 무엇이 들어가는지)
* 기술적 제약 파악 (API 데이터 구조, 기존 컴포넌트)

### 2단계: 스케치 (Lo-fi)

* **Crazy 8s**: 8분 동안 8가지 다른 접근법 스케치
* 다양한 레이아웃 탐색
* 팀과 공유, 피드백

### 3단계: 디지털 와이어프레임 (Mid-fi)

* 선택된 방향을 디지털화
* 실제 콘텐츠로 교체
* 반응형 고려 시작
* 상태별 화면 (Empty, Loading, Error)

### 4단계: 프로토타입 + 테스트

* 핵심 플로우를 인터랙티브 프로토타입으로
* 사용성 테스트 실시
* 피드백 반영하여 반복

### 5단계: 비주얼 디자인 (Hi-fi)

* 디자인 시스템 적용
* 마이크로인터랙션 설계
* 핸드오프 준비

---

## 4. Figma 워크플로우

### 파일 구조

```
📁 Project Name
├── 📄 Research & Insights
├── 📄 Wireframes
│   ├── 🎨 Lo-fi Sketches
│   ├── 🎨 Mid-fi Wireframes
│   └── 🎨 User Flows
├── 📄 Design
│   ├── 🎨 Desktop
│   ├── 🎨 Tablet
│   ├── 🎨 Mobile
│   └── 🎨 Components (local)
├── 📄 Prototype
└── 📄 Handoff
```

### Figma 팁

* **Auto Layout**: 모든 프레임에 Auto Layout 적용. 반응형 기본
* **Constraints**: 부모 프레임 크기 변경 시 자식 요소 행동 정의
* **Components**: 반복되는 요소는 즉시 컴포넌트화
* **Variants**: 버튼 상태 (Default, Hover, Disabled)를 variant로 관리
* **Section**: 관련 프레임을 섹션으로 그룹화
* **Dev Mode**: 개발자가 스펙 확인할 수 있도록

### 네이밍 컨벤션

```
페이지: [Feature] / [Screen Name] / [State]
예: Auth / Login / Default
    Auth / Login / Error
    Auth / Login / Loading
    Dashboard / Overview / Empty
    Dashboard / Overview / Populated
```

---

## 5. 프로토타이핑

### Figma Prototyping

**기본 인터랙션**

* Click/Tap → Navigate to (화면 이동)
* Hover → Change to (호버 상태)
* While pressing → Change to (프레스 상태)
* Drag → Move in/out (바텀시트, 캐러셀)

**트랜지션**

* Dissolve: 부드러운 페이드 (기본)
* Move in/out: 화면 이동 (네비게이션)
* Push: 이전 화면을 밀어냄
* Smart Animate: 같은 이름의 레이어 간 자동 트윈

**프로토타입 범위**

* 모든 화면을 연결할 필요 없음
* **핵심 플로우만** 프로토타이핑 (사용성 테스트 태스크 기준)
* "어디를 클릭해야 하지?" 모먼트가 없도록

### 프로토타이핑 도구 비교

| 도구 | 강점 | 약점 |
|------|------|------|
| Figma | 디자인 통합, 팀 협업 | 복잡한 인터랙션 한계 |
| Framer | 실제 코드 수준 인터랙션 | 학습 곡선 높음 |
| ProtoPie | 센서, 조건부 인터랙션 | 별도 도구 |
| InVision | 간단한 클릭 프로토타입 | 사실상 deprecated |

---

## 6. 와이어프레임 리뷰 체크리스트

* [ ] 콘텐츠 우선순위가 시각적 위계에 반영되었는가?
* [ ] 모든 인터랙티브 요소가 식별 가능한가?
* [ ] CTA가 명확한가? (화면당 1개 Primary CTA)
* [ ] 네비게이션이 직관적인가?
* [ ] 모바일/태블릿 변형이 고려되었는가?
* [ ] Empty, Error, Loading 상태가 포함되었는가?
* [ ] 실제 콘텐츠로 테스트했는가? (Lorem ipsum 아닌)
* [ ] 개발자와 기술적 실현 가능성을 논의했는가?

---

## 7. 안티패턴

* **Pixel-perfect Lo-fi**: Lo-fi에서 디테일에 시간 쓰기 — 목적 위배
* **Lorem Ipsum 의존**: 가짜 텍스트로는 레이아웃 검증 불가
* **모바일 후순위**: 데스크톱 먼저 완성하고 "모바일은 나중에"
* **프로토타입 없이 핸드오프**: 정적 화면만으로는 인터랙션 전달 불가
* **모든 화면 프로토타이핑**: 핵심 플로우만 집중

---

## 참고 자료

* Figma 공식 튜토리얼 / 커뮤니티
* NNGroup — "Paper Prototyping"
* Google Ventures, "Sprint" (Design Sprint)
* Excalidraw (excalidraw.com) — 스케치 도구
