# Responsive Design

## 1. 모바일 퍼스트 (Mobile First)

Luke Wroblewski가 제안한 접근법으로, 가장 제약이 많은 환경(모바일)에서 시작해 점진적으로 확장합니다.

### 왜 모바일 퍼스트인가?

1. **집중**: 작은 화면은 핵심 콘텐츠/기능에 집중하게 강제
2. **성능**: 모바일 네트워크/하드웨어 기준으로 최적화하면 데스크톱에서도 빠름
3. **트래픽**: 글로벌 웹 트래픽의 60%+ 가 모바일
4. **Progressive Enhancement**: 기본 경험 위에 기능 추가 (Graceful Degradation의 반대)

### CSS 구현

```css
/* Mobile First: min-width 사용 */
.card { padding: 16px; }
@media (min-width: 768px) { .card { padding: 24px; } }
@media (min-width: 1024px) { .card { padding: 32px; } }

/* Desktop First: max-width 사용 (비권장) */
.card { padding: 32px; }
@media (max-width: 1023px) { .card { padding: 24px; } }
@media (max-width: 767px) { .card { padding: 16px; } }
```

---

## 2. Adaptive vs Responsive

### Responsive Design

유동적(fluid)으로 모든 뷰포트에 적응합니다. 비율 기반 레이아웃 + 미디어 쿼리를 사용합니다.

* `width: 100%`, `max-width`, `fr`, `%` 사용
* 하나의 코드베이스로 모든 화면 대응

### Adaptive Design

특정 브레이크포인트별로 고정된 레이아웃을 제공합니다.

* 각 브레이크포인트에서 다른 레이아웃
* 더 정밀한 제어 가능하지만 유지보수 비용 높음

### 실무: 하이브리드

대부분의 모던 프로덕트는 둘을 혼합합니다:

* **Responsive**: 그리드, 이미지, 타이포그래피 (유동적)
* **Adaptive**: 레이아웃 구조, 네비게이션 패턴 (브레이크포인트별)

---

## 3. Touch Target

### 가이드라인

| 플랫폼 | 최소 크기 | 권장 크기 |
|--------|----------|----------|
| Apple HIG | 44x44pt | 44x44pt |
| Material Design | 48x48dp | 48x48dp |
| WCAG 2.2 | 24x24px (최소) | 44x44px |

### 실무 규칙

* **최소 44x44px**: 모든 인터랙티브 요소 (버튼, 링크, 체크박스)
* **간격**: 인접한 터치 타겟 간 최소 8px 간격
* **시각적 크기 =/= 터치 영역**: 아이콘이 24px이어도 터치 영역은 44px

  ```css
  .icon-button {
    width: 24px;
    height: 24px;
    padding: 10px; /* 총 44px */
  }
  ```
* **엄지존 고려**: 하단 영역에 주요 액션 배치 (Thumb Zone)

### Thumb Zone

스마트폰에서 한 손 사용 시 접근 가능 영역:

```
[  Hard   |  OK   |  Hard  ]  ← 상단 (도달 어려움)
[   OK    | Easy  |   OK   ]  ← 중단
[  Easy   | Easy  |  Easy  ]  ← 하단 (가장 쉬움)
```

→ 주요 네비게이션/CTA는 하단에 배치 (Bottom Navigation, FAB)

---

## 4. 모바일 패턴

### 네비게이션

**Bottom Navigation (하단 탭)**

* 3-5개 최상위 목적지
* 아이콘 + 라벨 (아이콘만은 인지 부하)
* iOS Tab Bar, Android Bottom Navigation

**Hamburger Menu**

* 공간 절약하지만 발견성 낮음
* "보이지 않으면 사용되지 않는다" — NNGroup 연구
* 가능하면 Bottom Nav로 대체

**Tab Bar (상단)**

* 카테고리 전환 (같은 레벨의 콘텐츠)
* 스와이프로 전환 가능하면 더 좋음

### 콘텐츠 패턴

**Card Layout**

* 모바일에서 가장 자연스러운 패턴
* 수직 스크롤로 무한 콘텐츠 탐색
* 카드 간 간격: 8-16px

**Bottom Sheet**

* 하단에서 올라오는 패널
* 컨텍스트를 유지하면서 추가 정보/액션 제공
* Snappoint: 25%, 50%, 90% 높이

**Pull to Refresh**

* 리스트 최상단에서 아래로 당기기
* 명확한 시각적 피드백 (스피너, 화살표)

**Swipe Actions**

* 리스트 아이템 스와이프로 빠른 액션 (삭제, 보관)
* 시각적 힌트 필요 (삭제 = 빨간 배경)

---

## 5. 반응형 이미지

### srcset + sizes

```html
<img
  src="image-800.jpg"
  srcset="image-400.jpg 400w, image-800.jpg 800w, image-1200.jpg 1200w"
  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
  alt="설명"
  loading="lazy"
/>
```

### CSS 반응형 이미지

```css
img {
  max-width: 100%;
  height: auto;
  display: block;
}
```

### `<picture>` 요소

다른 화면 크기에 완전히 다른 이미지를 제공합니다 (Art Direction):

```html
<picture>
  <source media="(min-width: 1024px)" srcset="hero-wide.jpg" />
  <source media="(min-width: 768px)" srcset="hero-medium.jpg" />
  <img src="hero-mobile.jpg" alt="..." />
</picture>
```

---

## 6. 반응형 타이포그래피

### Fluid Typography

```css
/* clamp(최소, 선호, 최대) */
h1 { font-size: clamp(1.75rem, 1rem + 3vw, 3.5rem); }
h2 { font-size: clamp(1.5rem, 0.8rem + 2vw, 2.5rem); }
body { font-size: clamp(1rem, 0.9rem + 0.5vw, 1.125rem); }
```

### Container Queries (컨테이너 쿼리)

부모 요소의 크기에 따라 스타일을 변경합니다. 뷰포트가 아닌 컴포넌트 기준입니다.

```css
.card-container {
  container-type: inline-size;
}

@container (min-width: 400px) {
  .card { flex-direction: row; }
}
```

---

## 7. 반응형 테이블

데이터 테이블은 모바일의 난제입니다.

### 전략

**수평 스크롤**

```css
.table-wrapper {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
```

* 가장 단순합니다. 스크롤 힌트(그림자, 화살표) 제공

**카드 변환**

```
Desktop: | Name | Email | Role | Actions |
Mobile:  [Card: Name
          Email: ...
          Role: ...
          [Actions]]
```

**우선순위 열**: 중요한 열만 표시, 나머지는 "더보기"로 접기

**고정 열**: 첫 번째 열 고정, 나머지 수평 스크롤

---

## 8. 성능 고려

### 모바일 성능 체크리스트

* [ ] Critical CSS 인라인
* [ ] 이미지 lazy loading (`loading="lazy"`)
* [ ] 웹폰트 최적화 (`font-display: swap`, 서브셋)
* [ ] JavaScript 번들 코드스플리팅
* [ ] Viewport 메타 태그: `<meta name="viewport" content="width=device-width, initial-scale=1">`
* [ ] Touch 이벤트 최적화 (`passive: true`)

### Core Web Vitals

* **LCP** (Largest Contentful Paint): < 2.5s
* **INP** (Interaction to Next Paint): < 200ms
* **CLS** (Cumulative Layout Shift): < 0.1

---

## 9. 안티패턴

* **Fixed width 레이아웃**: `width: 960px` (2005년이 아니다)
* **Hover 의존**: 모바일에 호버 없음. 호버는 보너스, 필수 아님
* **작은 터치 타겟**: 32px 이하 버튼/링크
* **Pinch-to-zoom 비활성화**: `user-scalable=no` 사용 금지 (접근성 위반)
* **별도 모바일 사이트**: m.example.com (SEO 불리, 유지보수 2배)
* **팝업 남용**: 모바일에서 팝업은 화면 전체를 가림

---

## 참고 자료

* Luke Wroblewski, "Mobile First"
* Ethan Marcotte, "Responsive Web Design"
* NNGroup — Mobile UX 시리즈
* web.dev — Responsive Design
* Material Design — Responsive Layout Grid
