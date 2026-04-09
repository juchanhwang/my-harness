# Accessibility

## 1. WCAG 2.1 개요

Web Content Accessibility Guidelines. W3C에서 제정한 웹 접근성 국제 표준.

### 준수 레벨

* **A**: 최소 (필수)
* **AA**: 권장 (대부분의 법적 요구사항) — **우리의 기본 목표**
* **AAA**: 최고 (특수한 상황)

---

## 2. POUR 원칙

### Perceivable (인지 가능)

정보와 UI를 사용자가 인지할 수 있어야 한다.

**텍스트 대안 (1.1)**

* 모든 비텍스트 콘텐츠에 텍스트 대안 제공
* 이미지: `alt` 속성. 장식: `alt=""`
* 아이콘 버튼: `aria-label`
* 복잡한 이미지 (차트): 데이터 테이블 대안

**시간 기반 미디어 (1.2)**

* 비디오: 자막, 오디오 설명
* 오디오: 텍스트 전사

**적응 가능 (1.3)**

* 의미 있는 HTML 구조 (heading 순서, landmark, list)
* `<h1>` → `<h2>` → `<h3>` (건너뛰지 않기)
* `<nav>`, `<main>`, `<aside>`, `<footer>` landmark
* 의미 있는 읽기 순서 = DOM 순서

**구별 가능 (1.4)**

* 색상만으로 정보 전달 (X) (아이콘, 텍스트 병행)
* 텍스트 대비: AA 4.5:1 / AAA 7:1
* 대형 텍스트 (18px+ bold, 24px+): AA 3:1
* UI 컴포넌트/그래픽: 3:1
* 텍스트 200% 확대 시 콘텐츠 손실 없음
* 텍스트 간격 조정 가능 (line-height 1.5+, letter-spacing 0.12em+)

### Operable (조작 가능)

UI와 네비게이션이 조작 가능해야 한다.

**키보드 (2.1)**

* 모든 기능이 키보드로 사용 가능
* 키보드 트랩 없음 (포커스가 갇히지 않음, 모달 제외)
* 단축키 제공 시 비활성화/재매핑 가능

**충분한 시간 (2.2)**

* 시간 제한: 연장/해제/조정 가능
* 자동 움직이는 콘텐츠: 일시정지/정지/숨기기 가능
* 자동 갱신: 일시정지/정지 가능

**발작/물리적 반응 (2.3)**

* 초당 3회 이상 번쩍이는 콘텐츠 금지
* `prefers-reduced-motion` 존중

**네비게이션 (2.4)**

* 반복 콘텐츠 건너뛰기 (Skip to main content)
* 페이지 제목이 주제/목적을 설명
* 포커스 순서가 논리적
* 링크 텍스트의 목적이 명확 ("여기 클릭" (X))
* 다양한 네비게이션 방법 (검색, 사이트맵, 메뉴)
* 포커스 표시가 보임 (focus ring 제거 금지)

**입력 방식 (2.5)**

* 터치 제스처 대안 제공 (스와이프 외 버튼)
* 터치 타겟 최소 24x24px (AA), 권장 44x44px
* 드래그 앤 드롭 대안 제공

### Understandable (이해 가능)

정보와 UI 조작이 이해 가능해야 한다.

**가독성 (3.1)**

* 페이지 언어 명시 (`<html lang="ko">`)
* 부분적 다른 언어도 명시 (`<span lang="en">Design</span>`)

**예측 가능 (3.2)**

* 포커스만으로 맥락 변경 (X) (포커스 시 새 창 열기 등)
* 입력만으로 맥락 변경 (X) (선택 시 즉시 페이지 이동)
* 일관된 네비게이션, 일관된 식별

**입력 지원 (3.3)**

* 에러 식별: 에러가 자동 감지되면 텍스트로 설명
* 라벨/지시: 입력에 라벨 또는 지시사항
* 에러 제안: 수정 방법 제안
* 에러 예방: 법적/재정적 데이터 → 되돌리기/확인/검토 가능

### Robust (견고)

다양한 사용자 에이전트(보조 기술 포함)와 호환.

**호환성 (4.1)**

* 유효한 HTML 마크업
* 모든 UI 컴포넌트에 name, role, value 제공
* 상태 변경 시 보조 기술에 알림

---

## 3. 키보드 네비게이션

### 기본 키보드 패턴

| 키 | 동작 |
|---|------|
| Tab | 다음 포커스 가능한 요소로 이동 |
| Shift+Tab | 이전 요소로 이동 |
| Enter | 링크 활성화, 버튼 클릭 |
| Space | 체크박스 토글, 버튼 클릭, 셀렉트 열기 |
| Arrow Keys | 라디오 그룹, 탭, 메뉴, 셀렉트 내 이동 |
| Escape | 모달/팝업 닫기, 취소 |
| Home/End | 리스트 처음/끝으로 |

### Focus Management

**Focus Ring (포커스 링)**

```css
/* 절대 이렇게 하지 마세요 */
*:focus { outline: none; } /* 접근성 파괴 */

/* 이렇게 하세요 */
:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
```

**Focus Trap (포커스 트랩)**

* 모달, 다이얼로그 열릴 때 포커스를 내부에 가둠
* Tab으로 마지막 요소 → 첫 요소로 순환
* Escape로 닫고 트리거 요소로 포커스 복귀
* Radix Dialog가 자동 처리

**Focus Order**

* DOM 순서 = 시각적 순서
* `tabindex="0"`: 자연스러운 탭 순서에 포함
* `tabindex="-1"`: 프로그래밍으로만 포커스 (Tab 순서에서 제외)
* `tabindex="1+"`: **절대 사용 금지** (순서 혼란)

---

## 4. ARIA (Accessible Rich Internet Applications)

### ARIA 규칙

1. HTML 네이티브 요소로 충분하면 ARIA 불필요
   * `<button>` 사용 → `<div role="button">` 불필요
2. HTML 의미를 변경하지 않기
   * `<h2 role="tab">` (X)
3. 모든 인터랙티브 ARIA는 키보드 지원 필수

### 자주 쓰는 ARIA

```html
<!-- 라벨 -->
<button aria-label="닫기">✕</button>
<input aria-labelledby="name-label" />

<!-- 설명 -->
<input aria-describedby="password-hint" />
<p id="password-hint">8자 이상, 영문+숫자</p>

<!-- 상태 -->
<button aria-expanded="true">메뉴</button>
<input aria-invalid="true" aria-errormessage="email-error" />
<div aria-busy="true">로딩 중...</div>

<!-- 라이브 영역 -->
<div aria-live="polite">새 메시지 3개</div>
<div role="alert">에러가 발생했습니다</div>
<div role="status">저장되었습니다</div>

<!-- 숨김 -->
<span aria-hidden="true">장식 요소</span>
```

### 주요 Roles

| Role | 용도 |
|------|------|
| `role="alert"` | 중요한 라이브 메시지 |
| `role="status"` | 덜 중요한 상태 업데이트 |
| `role="dialog"` | 모달 (aria-modal="true") |
| `role="navigation"` | 네비게이션 영역 (`<nav>` 대체) |
| `role="tablist"` + `role="tab"` + `role="tabpanel"` | 탭 UI |
| `role="menu"` + `role="menuitem"` | 메뉴 |

---

## 5. 스크린 리더 대응

### 주요 스크린 리더

* **VoiceOver**: macOS/iOS 내장. 가장 좋은 개발 테스트 환경
* **NVDA**: Windows 무료
* **JAWS**: Windows 유료 (기업 환경)
* **TalkBack**: Android 내장

### 테스트 방법

1. VoiceOver 켜기 (Cmd+F5 / Settings > Accessibility)
2. Tab으로 모든 인터랙티브 요소 순회
3. 스크린 리더가 올바른 라벨/역할/상태를 읽는지 확인
4. 에러 발생 시 에러 메시지가 자동으로 읽히는지
5. 동적 콘텐츠 변경이 알림되는지

### 테스트 도구

* Chrome DevTools → Accessibility 탭
* axe DevTools (브라우저 확장)
* Lighthouse Accessibility 점수
* WAVE (wave.webaim.org)

---

## 6. 체크리스트 (최소 AA)

### 시각

* [ ] 텍스트 대비 4.5:1+ (대형 3:1+)
* [ ] UI 컴포넌트 대비 3:1+
* [ ] 색상만으로 정보 전달하지 않음
* [ ] 텍스트 200% 확대 시 콘텐츠 접근 가능
* [ ] `prefers-reduced-motion` 지원

### 구조

* [ ] 올바른 heading 순서 (h1→h2→h3)
* [ ] Landmark 사용 (nav, main, footer)
* [ ] Skip to main content 링크
* [ ] 페이지 언어 명시 (`lang`)
* [ ] 의미 있는 페이지 제목

### 키보드

* [ ] 모든 기능 키보드 사용 가능
* [ ] 포커스 표시 visible
* [ ] 논리적 포커스 순서
* [ ] 모달 포커스 트랩 + Escape 닫기
* [ ] 키보드 트랩 없음

### 폼

* [ ] 모든 입력에 라벨
* [ ] 에러 텍스트로 식별 + 수정 제안
* [ ] 필수 필드 표시
* [ ] aria-describedby로 에러 연결

### 동적 콘텐츠

* [ ] aria-live로 상태 변경 알림
* [ ] 로딩/업데이트 상태 알림
* [ ] SPA 라우트 변경 시 포커스/제목 관리

---

## 참고 자료

* WCAG 2.1 (w3.org/WAI/WCAG21/quickref)
* WAI-ARIA Authoring Practices (w3.org/WAI/ARIA/apg)
* WebAIM (webaim.org)
* Inclusive Components (inclusive-components.design)
* axe-core (deque.com/axe)
