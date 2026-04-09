# Interaction Design

## 1. 마이크로인터랙션 (Micro-interactions)

Dan Saffer가 정의한 4요소로 구성되는 작은 인터랙티브 순간.

### 4요소

**Trigger (트리거)**: 인터랙션을 시작하는 것

* User-initiated: 클릭, 탭, 스와이프, 호버, 키보드 입력
* System-initiated: 시간 기반, 데이터 변경, 위치 기반

**Rules (규칙)**: 트리거 후 무엇이 일어나는지

* "좋아요 버튼 클릭 → 하트가 채워지고, 카운트 +1, 서버에 요청"

**Feedback (피드백)**: 사용자에게 무슨 일이 일어났는지 알려줌

* Visual: 색상 변화, 아이콘 변경, 체크마크
* Motion: 바운스, 스케일, 슬라이드
* Haptic: 진동 (모바일)

**Loops & Modes**: 시간에 따른 행동 변화

* 첫 번째 좋아요 vs 연속 좋아요
* 장시간 비활성 → 다른 모드

### 일상적인 마이크로인터랙션 예시

| 인터랙션 | 트리거 | 피드백 |
|---------|--------|--------|
| Toggle switch | 탭/클릭 | 슬라이드 애니메이션 + 색상 변화 |
| Pull to refresh | 풀다운 | 스피너 회전 + 콘텐츠 업데이트 |
| Like/Heart | 탭 | 하트 팝 애니메이션 + 파티클 |
| Password show/hide | 아이콘 클릭 | 눈 아이콘 전환 + 텍스트 표시 |
| Swipe to delete | 스와이프 | 빨간 배경 노출 + 삭제 아이콘 |
| Character count | 타이핑 | 실시간 카운트 업데이트 |

---

## 2. 애니메이션 원칙

Disney의 12 애니메이션 원칙 중 UI에 적용 가능한 것들:

### Easing (가속/감속)

* **ease-out**: UI 요소가 등장할 때. 빠르게 시작, 부드럽게 정지. 가장 많이 사용
* **ease-in**: UI 요소가 퇴장할 때. 천천히 시작, 빠르게 사라짐
* **ease-in-out**: 화면 전환, 위치 이동
* **linear**: 거의 사용 안 함 (로딩 스피너 정도)

```css
/* 권장 커스텀 easing */
--ease-out: cubic-bezier(0.16, 1, 0.3, 1);      /* 강한 ease-out */
--ease-in:  cubic-bezier(0.55, 0.055, 0.675, 0.19);
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1); /* 스프링 효과 */
```

### Duration (지속 시간)

| 유형 | Duration | 예시 |
|------|----------|------|
| 즉각적 | 100ms | 호버 색상 변화, 체크박스 |
| 빠름 | 150-200ms | 버튼 상태 전환, 드롭다운 열기 |
| 보통 | 200-300ms | 모달 등장, 카드 확장 |
| 느림 | 300-500ms | 페이지 전환, 복잡한 레이아웃 변화 |
| 매우 느림 | 500ms+ | 거의 사용 안 함 (사용자 인내 한계) |

**규칙**: 작은 요소 = 짧은 duration. 큰 요소/긴 거리 = 긴 duration.

### Anticipation (예측)

액션 전 약간의 준비 동작. 버튼 클릭 시 살짝 축소(scale: 0.95) 후 원래 크기로.

### Follow-through

메인 동작 후 약간의 여운. 토스트가 올라온 후 살짝 바운스. 모달이 닫힌 후 배경 페이드.

---

## 3. 트랜지션 (Transitions)

### 페이지/뷰 전환

**Push**: 새 화면이 옆에서 밀고 들어옴 (네비게이션 진행 방향)
**Fade**: 부드러운 크로스페이드 (상위 레벨 전환)
**Scale + Fade**: 약간 확대되며 페이드 (상세 화면 진입)
**Shared Element**: 같은 요소가 두 화면 간 연결되어 자연스럽게 이동 (View Transitions API)

### 모달/오버레이 전환

```css
/* 모달 등장 */
.modal-enter {
  opacity: 0;
  transform: scale(0.95) translateY(10px);
}
.modal-enter-active {
  opacity: 1;
  transform: scale(1) translateY(0);
  transition: all 200ms var(--ease-out);
}

/* 배경 딤 */
.overlay-enter {
  opacity: 0;
}
.overlay-enter-active {
  opacity: 1;
  transition: opacity 200ms ease;
}
```

### 리스트 아이템 전환

* **추가**: Fade in + slide down (높이 0 → auto)
* **제거**: Fade out + slide up + 나머지 아이템 자연스럽게 이동
* **재정렬**: FLIP 기법 (First, Last, Invert, Play)

---

## 4. 피드백 (Feedback)

### 피드백의 유형

**즉각적 피드백 (Immediate)**

* 버튼 클릭: 색상 변화 + ripple effect
* 입력: 실시간 유효성 검증
* 토글: 즉시 상태 반영

**진행 피드백 (Progress)**

* 결정적 (Determinate): 프로그레스 바 (완료율 알 때)
* 비결정적 (Indeterminate): 스피너, skeleton (완료율 모를 때)
* Skeleton Screen > Spinner (지각된 성능 향상)

**확인 피드백 (Confirmation)**

* 토스트 메시지: "저장되었습니다" (2-4초 후 자동 닫기)
* 인라인 확인: 체크마크 아이콘, 초록색 텍스트
* 성공 애니메이션: Lottie 체크마크

### 피드백 원칙

1. **100ms 이내 응답**: 사용자가 "시스템이 반응했다"고 느끼는 한계
2. **1초 이내 완료**: 사용자 집중 유지. 초과 시 로딩 인디케이터 표시
3. **10초 이내**: 사용자 인내 한계. 초과 시 프로그레스 바 + 취소 옵션
4. **Optimistic UI**: 서버 응답 전에 UI 먼저 업데이트. 실패 시 롤백

---

## 5. Affordance (행위유발성)

Don Norman이 정립한 개념. 오브젝트가 어떻게 사용될 수 있는지 시각적으로 암시.

### UI 어포던스

| 요소 | 어포던스 | 시각적 단서 |
|------|---------|-----------|
| 버튼 | "클릭할 수 있다" | 배경색, 보더, 호버 변화 |
| 텍스트 링크 | "클릭할 수 있다" | 파란색, 밑줄 |
| 인풋 | "타이핑할 수 있다" | 보더, placeholder |
| 슬라이더 | "드래그할 수 있다" | 트랙 + 핸들 |
| 카드 | "클릭하면 상세로" | 호버 시 elevation 변화 |
| 스크롤 영역 | "스크롤할 수 있다" | 콘텐츠 잘림, 스크롤바 |

### False Affordance (거짓 어포던스) 경고

* 클릭할 수 없는데 파란색 밑줄 텍스트 → 사용자 혼란
* 버튼처럼 보이지만 반응 없는 요소
* 클릭 가능한데 시각적 단서 없는 요소 (Mystery Meat Navigation)

### Signifiers

Affordance를 더 명확하게 하는 추가적 시각 단서:

* 화살표 아이콘 → "여기를 누르면 이동"
* 그랩 핸들 → "드래그 가능"
* 더보기 (...) → "추가 옵션 있음"

---

## 6. 모션 디자인 시스템

### Framer Motion / CSS Animation 토큰화

```ts
const motion = {
  duration: {
    instant: '100ms',
    fast: '150ms',
    normal: '250ms',
    slow: '350ms',
  },
  easing: {
    default: 'cubic-bezier(0.16, 1, 0.3, 1)',
    spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    linear: 'linear',
  },
  // 재사용 가능한 프리셋
  preset: {
    fadeIn: { opacity: [0, 1], duration: '250ms', easing: 'default' },
    slideUp: { transform: ['translateY(8px)', 'translateY(0)'], opacity: [0, 1] },
    scaleIn: { transform: ['scale(0.95)', 'scale(1)'], opacity: [0, 1] },
  }
};
```

### `prefers-reduced-motion` 대응

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

접근성 필수. 전정기관 장애, 편두통 등 모션에 민감한 사용자를 위해.

---

## 7. 안티패턴

* **과도한 애니메이션**: 모든 것이 움직이면 아무것도 강조되지 않음
* **느린 애니메이션**: 500ms 이상의 UI 전환은 사용자를 기다리게 함
* **불일치 모션**: 같은 유형의 전환인데 다른 duration/easing
* **차단적 애니메이션**: 애니메이션 완료까지 다음 액션 불가
* **Linear easing**: 기계적이고 부자연스러운 느낌

---

## 참고 자료

* Dan Saffer, "Microinteractions"
* Material Design — Motion
* Apple HIG — Motion
* Framer Motion 문서
* NNGroup — "Animation for Attention and Comprehension"
