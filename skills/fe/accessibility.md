# Accessibility

> 핵심 메시지: **"접근성은 선택이 아니라 기본이다. 모든 사용자가 서비스를 이용할 수 있어야 한다."**

***

## 1. WCAG 기본 원칙 (POUR)

| 원칙                 | 설명                  | 예시                      |
| ------------------ | ------------------- | ----------------------- |
| **Perceivable**    | 정보를 인지할 수 있어야 함     | 이미지에 alt 텍스트, 충분한 색상 대비 |
| **Operable**       | UI를 조작할 수 있어야 함     | 키보드로 모든 기능 접근 가능        |
| **Understandable** | 정보와 UI가 이해 가능해야 함   | 명확한 에러 메시지, 일관된 네비게이션   |
| **Robust**         | 다양한 기술(보조 기기 등)과 호환 | 시맨틱 HTML, ARIA 올바른 사용   |

***

## 2. 시맨틱 HTML

올바른 HTML 요소를 사용하면 별도의 ARIA 없이도 접근성이 확보된다.

```tsx
// ❌ div로 모든 것을 만듦
<div onClick={handleClick}>버튼</div>
<div className="header">제목</div>
<div className="nav">네비게이션</div>

// ✅ 시맨틱 HTML
<button onClick={handleClick}>버튼</button>
<h1>제목</h1>
<nav aria-label="메인 네비게이션">네비게이션</nav>
```

### 주요 시맨틱 요소

| 요소             | 용도              |
| -------------- | --------------- |
| `<button>`     | 클릭 가능한 액션       |
| `<a href>`     | 페이지 이동          |
| `<h1>`~`<h6>` | 제목 계층 (건너뛰지 않기) |
| `<nav>`        | 네비게이션 영역        |
| `<main>`       | 페이지 주요 콘텐츠      |
| `<form>`       | 폼 영역            |
| `<label>`      | 입력 필드 레이블       |
| `<ul>`, `<ol>` | 리스트             |

***

## 3. 키보드 네비게이션

모든 인터랙티브 요소는 키보드로 접근/조작 가능해야 한다.

```tsx
// 키보드 접근성 체크리스트:
// - Tab: 포커스 이동
// - Enter/Space: 버튼 활성화
// - Escape: 모달/드롭다운 닫기
// - Arrow keys: 메뉴/리스트 탐색

// 커스텀 드롭다운의 키보드 지원
function Dropdown({ items, onSelect }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const handleKeyDown = (e: KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex(prev => Math.min(prev + 1, items.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        if (activeIndex >= 0) onSelect(items[activeIndex]);
        setIsOpen(false);
        break;
      case 'Escape':
        setIsOpen(false);
        break;
    }
  };

  return (
    <div role="combobox" aria-expanded={isOpen} onKeyDown={handleKeyDown}>
      {/* ... */}
    </div>
  );
}
```

### Focus 관리

```tsx
// 모달 열릴 때 포커스 트랩
function Modal({ isOpen, onClose, children }: ModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      closeButtonRef.current?.focus(); // 모달 열리면 닫기 버튼에 포커스
    }
  }, [isOpen]);

  return (
    <dialog open={isOpen} aria-modal="true" role="dialog">
      <button ref={closeButtonRef} onClick={onClose} aria-label="닫기">
        ✕
      </button>
      {children}
    </dialog>
  );
}
```

***

## 4. 스크린리더 대응

### ARIA 속성 가이드

```tsx
// 아이콘 버튼 — 시각적 텍스트가 없으면 aria-label 필수
<button aria-label="삭제" onClick={onDelete}>
  <TrashIcon />
</button>

// 로딩 상태 알림
<div aria-live="polite" aria-busy={isLoading}>
  {isLoading ? '로딩 중...' : `${count}건의 결과`}
</div>

// 에러 메시지 연결
<input
  id="email"
  aria-invalid={!!error}
  aria-describedby={error ? 'email-error' : undefined}
/>
{error && <p id="email-error" role="alert">{error}</p>}

// 시각적으로 숨기되 스크린리더에는 노출
<span className="sr-only">새 알림 3건</span>
```

### sr-only 클래스

```css
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
```

***

## 5. 체크리스트

모든 컴포넌트 작성 시 확인:

* [ ] 인터랙티브 요소에 올바른 시맨틱 태그 사용 (`button`, `a`, `input`)
* [ ] 이미지에 의미 있는 `alt` 텍스트 (장식용이면 `alt=""`)
* [ ] 폼 입력에 `<label>` 연결
* [ ] 색상만으로 정보를 전달하지 않음 (아이콘/텍스트 보조)
* [ ] 키보드만으로 모든 기능 사용 가능
* [ ] 포커스 순서가 논리적
* [ ] 색상 대비 4.5:1 이상 (일반 텍스트), 3:1 이상 (큰 텍스트)
* [ ] 동적 콘텐츠 변경 시 `aria-live` 사용

***

> 📎 관련: [design-system.md](design-system.md) · [code-quality.md](code-quality.md)
