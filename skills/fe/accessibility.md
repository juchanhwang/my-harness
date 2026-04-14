# Accessibility

> 핵심 메시지: **"접근성은 선택이 아니라 기본이다. 모든 사용자가 서비스를 이용할 수 있어야 한다."**
>
> 기준: WCAG 2.2 Level AA (GitHub, GOV.UK, Shopify 등 업계 표준)

***

## Frequent Violations

코드 리뷰에서 반복 발견되는 위반. 코드 생성 시 가장 먼저 확인한다.

1. `<div onClick>` / `<span onClick>` — `<button>` 또는 `<a href>` 사용
2. 아이콘 버튼에 접근 이름 누락 — `<span className="sr-only">` 또는 `aria-label`
3. 폼 입력에 `<label>` 미연결 — shadcn Form 밖에서 직접 폼 만들 때 특히 주의
4. `role="alert"` 남용 — 개별 필드 에러에 사용하면 인지 과부하

***

## Layer 1: Verification Checklist

코드 생성 후 반드시 확인한다. 아는 것과 매번 적용하는 것은 다르다.

### Component-level

- [ ] **클릭 가능 → `<button>` 또는 `<a href>`** — `<div onClick>` 금지
- [ ] **이미지 → `alt`** — 의미 있는 설명, 장식용이면 `alt=""`
- [ ] **폼 입력 → `<label>` 연결** — `htmlFor` 또는 감싸기
- [ ] **아이콘 버튼 → 접근 이름** — `<span className="sr-only">삭제</span>`
- [ ] **색상만으로 정보 전달 금지** — 아이콘·텍스트로 보조
- [ ] **키보드로 조작 가능** — Tab, Enter, Escape, 화살표
- [ ] **포커스 인디케이터 유지** — Tailwind `ring` 커스터마이즈 시 제거하지 않기
- [ ] **애니메이션 → `prefers-reduced-motion` 존중** — `motion-safe:` 또는 미디어 쿼리
- [ ] **터치 타겟 최소 44×44px** — `min-h-11 min-w-11`
- [ ] **색상 대비 확인 필요 시 주석** — Claude는 명암비를 계산할 수 없으므로 `/* TODO: 명암비 확인 필요 */`

```tsx
// ❌ Claude가 자주 생성하는 패턴
<div onClick={handleClick} className="cursor-pointer">클릭</div>

// ✅
<button onClick={handleClick} type="button">클릭</button>
```

```tsx
// ❌ 아이콘 버튼 접근 이름 누락
<Button variant="ghost" size="icon" onClick={onDelete}>
  <TrashIcon />
</Button>

// ✅
<Button variant="ghost" size="icon" onClick={onDelete}>
  <TrashIcon aria-hidden="true" />
  <span className="sr-only">삭제</span>
</Button>
```

### Page-level

- [ ] **랜드마크 영역** — `<main>`, `<nav>`, `<header>`, `<footer>`
- [ ] **Skip navigation link** — root layout에 포함
- [ ] **페이지 제목** — `generateMetadata`로 고유한 `title` 설정
- [ ] **단일 `<h1>`** — 페이지당 하나
- [ ] **제목 계층 건너뛰지 않음** — `<h1>` → `<h3>` (X), `<h1>` → `<h2>` (O)
- [ ] **문서 언어 설정** — `<html lang="ko">`

***

## Layer 2: Decision Tables

### Semantic HTML vs ARIA

| 상황 | 결정 |
|---|---|
| 시맨틱 HTML로 표현 가능 | ARIA 쓰지 않는다 (`<button>`, `<nav>`, `<dialog>`) |
| shadcn/Radix 컴포넌트 사용 중 | ARIA 직접 추가하지 않는다 (이미 내장) |
| 커스텀 위젯 | WAI-ARIA Authoring Practices 참조 후 추가 |
| 의미적 라벨만 필요 | `aria-label`, `aria-describedby`만 추가 |

> "No ARIA is better than bad ARIA" — W3C WAI

### aria-live 선택

남용하면 스크린리더 사용자에게 인지 과부하를 일으킨다.

| 값 | 언제 | 예시 |
|---|---|---|
| `polite` | 현재 작업 방해 불필요 | 검색 결과 수, 저장 완료, 인라인 에러 |
| `assertive` | 즉각적이고 중요한 정보 | 세션 만료, 네트워크 끊김 |
| 사용하지 않음 | 이미 다른 메커니즘 존재 | Toast (Radix/Sonner 자체 처리), Radix 컴포넌트 상태 변경 |

**Toast에 `role="alert"` 추가하지 마라.** Radix Toast는 의도적으로 `role="status"`를 사용한다 — `role="alert"`는 스크린리더에서 더듬거림(stuttering) 문제를 일으키기 때문이다.

> 📎 출처: Radix Toast 소스 코드 주석

### Focus management

| 상황 | 포커스 처리 | 비고 |
|---|---|---|
| 모달 열기/닫기 | Radix 자동 처리 | 직접 구현 금지 |
| 라우트 전환 | Next.js 자동 처리 | `title` metadata 설정 필수 |
| 아이템 삭제 | **수동 — 인접 아이템으로 이동** | 안 하면 포커스가 `<body>`로 떨어짐 |
| 동적 콘텐츠 추가 | **수동 — 새 콘텐츠에 포커스** | `ref.current?.focus()` |
| Accordion/Collapsible | Radix 자동 처리 | 토글 버튼에 유지 |

```tsx
// ✅ 삭제 후 포커스 관리
const handleDelete = (id: string, index: number) => {
  setItems(prev => prev.filter(item => item.id !== id));
  requestAnimationFrame(() => {
    const next = listRef.current?.children[Math.min(index, items.length - 2)];
    (next as HTMLElement)?.focus();
  });
};
```

### Form error strategy

| 시점 | 에러 표시 | 스크린리더 공지 |
|---|---|---|
| 실시간/블러 검증 | 필드 아래 인라인 | `aria-live="polite"` |
| 제출 실패 | 인라인 + 폼 상단 요약 | 요약만 `role="alert"`, 개별 필드는 `aria-describedby` |
| 서버 에러 | Toast 또는 배너 | Toast 자체가 `aria-live="polite"` |

shadcn `FormControl`은 `aria-invalid`와 `aria-describedby`를 자동 관리하지만, `aria-required`와 `aria-live`(FormMessage)는 수동 추가가 필요하다.

***

## Layer 3: Stack Facts

### Radix 자동 처리 — 직접 구현 금지

Radix는 **구조적 ARIA**(role, aria-expanded 등), **포커스 관리**(트랩, 복원, 키보드 탐색), **키보드 내비게이션**을 자동 처리한다. Dialog, Select, Menu, Tabs, Tooltip, Checkbox, Switch, Slider, Toast 모두 해당. 이것을 직접 구현하면 오히려 접근성이 나빠진다.

**개발자 책임은 의미적 라벨뿐이다:** `aria-label` (Slider, 아이콘 버튼), `DialogDescription` (시각적으로 불필요하면 `VisuallyHidden`), Close 버튼 `sr-only` 텍스트 유지.

### shadcn 알려진 갭

| 갭 | 대응 |
|---|---|
| FormMessage에 `aria-live` 없음 | `aria-live="polite"` 추가 |
| Form에 `aria-required` 없음 | Input에 수동 추가 |
| DialogDescription 누락 시 production에서 경고 없음 | 항상 포함하거나 `aria-describedby={undefined}`로 opt-out |

> 📎 출처: shadcn form.tsx 소스, shadcn-ui/ui #8431, #9249

### Next.js App Router

**라우트 변경 공지는 자동이지만 조건이 있다.** `AppRouterAnnouncer`가 `document.title`을 읽어 스크린리더에 공지한다. title이 없으면 `<h1>` fallback. 이전 페이지와 title이 같으면 공지하지 않는다.

```tsx
// layout.tsx — 모든 페이지에 고유 title 필수
export const metadata = {
  title: { template: '%s | 내 앱', default: '내 앱' },
};
```

**loading.tsx에 스크린리더 공지:**
```tsx
export default function Loading() {
  return (
    <div role="status" aria-label="페이지 로딩 중">
      <Spinner aria-hidden="true" />
      <span className="sr-only">로딩 중...</span>
    </div>
  );
}
```

### Testing

자동화 도구는 WCAG 이슈의 30~57%만 탐지한다 (Deque 공식). 나머지는 수동 테스트가 필수다.

**자동화:** vitest-axe (컴포넌트 단위, **jsdom 필수** — Happy DOM 미지원), @axe-core/playwright (E2E 페이지 레벨, `withTags(['wcag2a', 'wcag2aa'])`)

**수동:** 키보드만으로 전체 흐름 탐색, macOS VoiceOver로 주요 흐름 검증

**린팅:** `eslint-plugin-jsx-a11y` — Next.js에는 접근성 린트 규칙이 없으므로 별도 설치 필요

> 📎 출처: WebAIM Million 2026, Deque 자동화 연구, A11Y Project Checklist

***

> 📎 관련: [design-system.md](design-system.md) · [forms.md](forms.md) · [component-patterns.md](component-patterns.md)
