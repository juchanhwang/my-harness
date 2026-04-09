# Color Theory

## 1. 색상의 기초

### 색상 모델

* **RGB**: 스크린 디스플레이 (가산혼합). Red, Green, Blue
* **HSL**: 디자인 작업에 직관적. Hue(색조 0-360°), Saturation(채도 0-100%), Lightness(명도 0-100%)
* **OKLCH**: 지각적으로 균일한 색상 공간. CSS Color Level 4 지원. 다크모드 팔레트에 특히 유용
* **HEX**: RGB의 16진수 표현. 코드에서 가장 흔히 사용

### 색상 관계 (Color Harmony)

| 관계 | 설명 | 사용 |
|------|------|------|
| Monochromatic | 하나의 색조, 다양한 채도/명도 | 세련되고 통일된 느낌 |
| Complementary | 색상환 반대편 | 강한 대비, CTA 강조 |
| Analogous | 색상환 인접 | 자연스럽고 조화로운 |
| Triadic | 120° 간격 3색 | 생동감, 균형 |
| Split-complementary | 보색의 양옆 2색 | 보색보다 부드러운 대비 |

---

## 2. UI 컬러 팔레트 설계

### 구조

```
Brand Colors
├── Primary     — 브랜드 정체성, CTA, 주요 액션
├── Secondary   — 보조 액션, 강조
└── Accent      — 특별한 강조 (선택적)

Neutral Colors
├── Gray Scale  — 텍스트, 배경, 보더
└── White/Black — 기본 배경/텍스트

Semantic Colors
├── Success     — 긍정적 피드백 (green 계열)
├── Warning     — 주의 (amber/yellow 계열)
├── Error       — 오류 (red 계열)
└── Info        — 정보 (blue 계열)
```

### 스케일 생성 (9-step 또는 11-step)

각 색상에 대해 밝은 것부터 어두운 것까지 스케일 생성:

```
primary-50:  #eff6ff  (가장 밝음 — 배경)
primary-100: #dbeafe
primary-200: #bfdbfe
primary-300: #93c5fd
primary-400: #60a5fa
primary-500: #3b82f6  (기본값)
primary-600: #2563eb
primary-700: #1d4ed8
primary-800: #1e40af
primary-900: #1e3a8a
primary-950: #172554  (가장 어두움)
```

### 스케일 생성 원칙

* **50-100**: 배경, 호버 상태에 사용
* **200-300**: 보더, 비활성 요소
* **400-500**: 아이콘, 보조 텍스트
* **500-600**: 주요 UI 요소 (버튼, 링크)
* **700-900**: 텍스트, 강한 강조
* HSL에서 Lightness만 바꾸지 않기 — Saturation도 함께 조절 (어두울수록 약간 더 saturated)

---

## 3. WCAG 대비 비율 (Contrast Ratio)

접근성의 핵심. 색각 이상, 저시력 사용자를 위해 반드시 준수.

### 기준

| 레벨 | 일반 텍스트 | 대형 텍스트 (18px+ bold, 24px+) | UI 컴포넌트 |
|------|-----------|-------------------------------|-----------|
| AA | 4.5:1 | 3:1 | 3:1 |
| AAA | 7:1 | 4.5:1 | — |

### 실무 가이드라인

* **본문 텍스트**: 최소 4.5:1 (AA). 목표 7:1 이상
* **플레이스홀더**: 4.5:1 미달 시 접근성 위반 — 연한 회색 주의
* **비활성 요소**: 대비 요구사항 면제, 그러나 3:1 이상 권장
* **포커스 인디케이터**: 배경 대비 3:1 이상

### 대비 검사 도구

* Figma: Stark 플러그인, A11y 플러그인
* 웹: WebAIM Contrast Checker
* 개발: Chrome DevTools → Elements → Accessibility

---

## 4. 다크 모드 (Dark Mode)

### 원칙

1. **단순 반전이 아니다**: 라이트 모드의 색상을 반전하면 안 됨
2. **Elevation = Lightness**: 다크 모드에서 높은 레이어는 더 밝은 배경 사용
3. **채도 낮추기**: 밝은 배경에서 잘 보이던 색상은 어두운 배경에서 눈부를 수 있음. 채도를 10-20% 낮춤
4. **순수 검정(#000000) 피하기**: #121212 ~ #1a1a1a 사용. 순수 검정은 눈의 피로 유발 (OLED 제외)

### 다크 모드 팔레트 구조

```
Light Mode                    Dark Mode
──────────                    ─────────
background: #ffffff           background: #0a0a0a
surface:    #f8f9fa           surface:    #171717
border:     #e5e7eb           border:     #262626
text:       #111827           text:       #ededed
text-muted: #6b7280           text-muted: #a1a1aa
primary:    #2563eb           primary:    #60a5fa (더 밝은 shade)
```

### 구현 전략

* **CSS Custom Properties + `prefers-color-scheme`**: 가장 깔끔
* **class 전환** (`.dark`): 사용자 선호 저장 가능 (Tailwind 방식)
* **시스템 설정 존중**: 기본은 시스템 설정, 수동 전환 옵션 제공

```css
:root {
  --bg: #ffffff;
  --text: #111827;
}
.dark {
  --bg: #0a0a0a;
  --text: #ededed;
}
```

---

## 5. 시맨틱 컬러 (Semantic Colors)

색상에 **의미**를 부여하여 일관된 커뮤니케이션. 하드코딩된 hex 값 대신 시맨틱 토큰 사용.

### 구조

```
Primitive Token          Semantic Token           Usage
───────────────          ──────────────           ─────
blue-500                 → color-primary          CTA, 링크
blue-50                  → color-primary-bg       선택된 항목 배경
green-600                → color-success          성공 메시지
green-50                 → color-success-bg       성공 배너 배경
red-600                  → color-error            에러 텍스트
red-50                   → color-error-bg         에러 배너 배경
amber-600                → color-warning          경고
gray-900                 → color-text-primary     주요 텍스트
gray-500                 → color-text-secondary   보조 텍스트
gray-400                 → color-text-tertiary    비활성 텍스트
```

### 규칙

* **색상만으로 의미를 전달하지 않는다**: 색각 이상 사용자를 위해 아이콘, 텍스트 라벨 병행
* **에러 = 빨강만이 아니다**: 아이콘 + 텍스트 설명 + 색상을 함께 사용
* **문화적 차이 고려**: 빨강이 모든 문화에서 "위험"을 의미하진 않음

---

## 6. 색상 사용 비율

### 60-30-10 법칙

* **60%**: 주요 색상 (배경, 넓은 영역) — Neutral
* **30%**: 보조 색상 (카드, 섹션) — Secondary/Surface
* **10%**: 강조 색상 (CTA, 하이라이트) — Primary/Accent

### 실무 팁

* 색상 수를 제한한다. 3-5개 핵심 색상 + 그레이스케일
* 새 색상 추가 전 기존 색상으로 해결할 수 있는지 먼저 검토
* 데이터 시각화용 색상은 별도 팔레트로 관리

---

## 7. 데이터 시각화 색상

### 원칙

* **구별 가능**: 인접 색상이 충분히 구별되어야 함
* **순서 표현**: Sequential 데이터는 같은 색조의 명도 변화
* **발산 표현**: Diverging 데이터는 중간점(중립)에서 양극으로
* **카테고리 표현**: 최대 8-10개 (그 이상은 구별 어려움)
* **색각 이상 안전**: 빨강-초록 조합 피하기. 파랑-주황 조합 권장

---

## 참고 자료

* Material Design Color System
* Apple Human Interface Guidelines — Color
* Tailwind CSS Color Palette
* OKLCH Color Picker: oklch.com
* Contrast Checker: webaim.org/resources/contrastchecker
* Color Blindness Simulator: coblis.com
