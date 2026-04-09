# Layout & Grid

## 1. 8pt Grid System

모든 spacing, sizing을 8의 배수로 통일하는 시스템. 일관성과 리듬을 만들고, 개발자-디자이너 간 커뮤니케이션을 단순화한다.

### 왜 8인가?

* 대부분의 화면 해상도가 8로 나누어 떨어짐
* 충분히 작아서 유연하고, 충분히 커서 차이가 인지됨
* 4pt half-grid로 미세 조정 가능 (아이콘 내부 등)

### Spacing Scale

```
space-0.5:  4px   — 아이콘 내부 간격, 미세 조정
space-1:    8px   — 인라인 요소 간격, 아이콘-텍스트 gap
space-2:    16px  — 관련 요소 간 간격, 카드 내부 padding
space-3:    24px  — 섹션 내 그룹 간 간격
space-4:    32px  — 섹션 간 간격
space-5:    40px  — 큰 섹션 간 간격
space-6:    48px  — 페이지 섹션 간
space-8:    64px  — 대형 여백
space-10:   80px  — 히어로 섹션 등
space-12:   96px  — 페이지 최상단/하단
space-16:   128px — 풀페이지 섹션 간
```

### 적용 규칙

* **Component 내부**: space-1 ~ space-3 (8-24px)
* **Component 간**: space-3 ~ space-4 (24-32px)
* **Section 간**: space-6 ~ space-10 (48-80px)
* **Page padding**: space-2 ~ space-4 (16-32px, 디바이스별)

---

## 2. Grid System

### Column Grid

| Breakpoint | Columns | Gutter | Margin | 용도 |
|------------|---------|--------|--------|------|
| xs (0-479) | 4 | 16px | 16px | 소형 모바일 |
| sm (480-767) | 4-6 | 16px | 16px | 모바일 |
| md (768-1023) | 8 | 24px | 24px | 태블릿 |
| lg (1024-1279) | 12 | 24px | 32px | 소형 데스크톱 |
| xl (1280+) | 12 | 32px | auto | 데스크톱 |

### Grid 용어

* **Column**: 콘텐츠가 배치되는 수직 영역
* **Gutter**: 컬럼 간 간격 (gap)
* **Margin**: 그리드 양쪽 외부 여백
* **Container**: 그리드를 감싸는 최대 너비 (max-width: 1200-1440px)

### CSS Grid 구현

```css
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding-inline: 16px;
}

.grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(4, 1fr);
}

@media (min-width: 768px) {
  .container { padding-inline: 24px; }
  .grid {
    gap: 24px;
    grid-template-columns: repeat(8, 1fr);
  }
}

@media (min-width: 1024px) {
  .container { padding-inline: 32px; }
  .grid {
    gap: 32px;
    grid-template-columns: repeat(12, 1fr);
  }
}
```

---

## 3. Responsive Breakpoints

### 모바일 퍼스트 접근

작은 화면에서 시작해 점진적으로 레이아웃 확장. `min-width` 미디어 쿼리 사용.

```css
/* 기본: 모바일 (0px~) */
/* sm: 480px~ */
/* md: 768px~ */
/* lg: 1024px~ */
/* xl: 1280px~ */
/* 2xl: 1536px~ */
```

### 콘텐츠 기반 브레이크포인트

디바이스가 아닌 **콘텐츠가 깨지는 지점**에서 브레이크포인트를 설정하라 (NNGroup 권장). 표준 브레이크포인트는 출발점일 뿐, 실제 콘텐츠로 테스트.

### 레이아웃 변화 패턴

**Reflow**: 컬럼 수 변경 (3열 → 2열 → 1열)

```
Desktop:  [card][card][card]
Tablet:   [card][card]
          [card]
Mobile:   [card]
          [card]
          [card]
```

**Stack**: 수평 → 수직 전환

```
Desktop:  [sidebar | main content]
Mobile:   [main content]
          [sidebar]
```

**Reveal/Hide**: 화면 크기에 따라 요소 표시/숨김

```
Desktop:  [nav items visible]
Mobile:   [hamburger menu]
```

---

## 4. Spacing System

### Spacing의 3가지 레벨

**1. Micro spacing (4-16px)**

* 인라인 요소 간 (아이콘-텍스트, 라벨-인풋)
* 리스트 아이템 내부
* 버튼 내부 padding

**2. Macro spacing (16-48px)**

* 컴포넌트 간 간격
* 카드 패딩
* 폼 필드 그룹 간

**3. Section spacing (48-128px)**

* 페이지 섹션 간
* 히어로와 콘텐츠 사이
* 풋터 상단 여백

### Spacing 원칙

1. **관련성 = 근접성**: 관련 있는 요소는 가깝게, 무관한 요소는 멀리 (Gestalt)
2. **일관성**: 같은 관계의 요소에는 같은 간격
3. **비대칭 허용**: 상하 간격이 같을 필요 없음. 시각적 균형이 수학적 균형보다 중요
4. **여백은 디자인이다**: 빈 공간은 "낭비"가 아니라 "호흡"

---

## 5. Common Layout Patterns

### Holy Grail Layout

```
[          Header           ]
[Nav | Main Content | Aside ]
[          Footer           ]
```

### Sidebar Layout (앱)

```
[Sidebar | Main Content Area ]
```

### Dashboard Layout

```
[Top Bar                    ]
[Side | Cards/Widgets Grid  ]
```

### Full-width Sections (마케팅)

```
[Hero - full width          ]
[Content - constrained      ]
[CTA - full width           ]
[Content - constrained      ]
```

---

## 6. Container 전략

### Fixed Container

```css
.container {
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
}
```

### Breakpoint-based Container (Tailwind 방식)

```
sm:  max-width: 640px
md:  max-width: 768px
lg:  max-width: 1024px
xl:  max-width: 1280px
2xl: max-width: 1536px
```

### 권장: Fluid + Max-width

```css
.container {
  width: min(100% - 2rem, 1200px);
  margin-inline: auto;
}
```

---

## 7. z-index 전략

레이어 관리를 위한 z-index 스케일:

```
z-base:      0      — 기본
z-dropdown:  1000   — 드롭다운 메뉴
z-sticky:    1100   — 고정 헤더
z-overlay:   1200   — 오버레이/딤
z-modal:     1300   — 모달
z-popover:   1400   — 팝오버, 툴팁
z-toast:     1500   — 토스트 알림
z-max:       9999   — 최상위 (극히 드물게)
```

---

## 8. 안티패턴

* **매직 넘버**: 13px, 27px 같은 임의 값. 반드시 spacing scale에서 선택
* **일관성 없는 패딩**: 카드 A는 16px, 카드 B는 20px, 카드 C는 24px
* **과도한 브레이크포인트**: 5개 이상이면 유지보수 악몽
* **스크롤 방향 혼합**: 한 페이지 내 수직+수평 스크롤 (모바일에서 특히)
* **max-width 없는 텍스트**: 1920px 너비로 늘어나는 본문

---

## 참고 자료

* Spec.fm, "8-Point Grid" 시리즈
* Every Layout (every-layout.dev) — 내재적 레이아웃
* CSS Grid Garden (cssgridgarden.com)
* NNGroup, "Breakpoints in Responsive Design"
* Material Design — Layout Grid
