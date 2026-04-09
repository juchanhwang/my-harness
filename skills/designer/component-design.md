# Component Design

## 1. Atomic Design

Brad Frost의 Atomic Design 방법론. UI를 화학적 구조처럼 분해.

### 5 레벨

**Atoms (원자)** 더 이상 분해할 수 없는 가장 작은 UI 단위.

* Button, Input, Label, Icon, Badge, Avatar, Checkbox, Radio
* 단독으로는 큰 의미 없으나, 조합하면 의미가 생긴다

**Molecules (분자)** Atom의 의미 있는 조합. 하나의 기능 수행.

* Search Bar (Input + Button + Icon)
* Form Field (Label + Input + Helper Text)
* Nav Item (Icon + Text + Badge)
* Stat Card (Icon + Number + Label)

**Organisms (유기체)** Molecule과 Atom의 복잡한 조합. 페이지의 독립적 섹션.

* Header (Logo + Nav Items + Search Bar + User Menu)
* Card List (여러 카드 조합)
* Data Table (Header Row + Body Rows + Pagination)
* Comment Section (Comment + Reply + Input)

**Templates (템플릿)** Organism을 배치한 페이지 레벨 구조. 실제 콘텐츠 없이 와이어프레임 수준.

**Pages (페이지)** Template에 실제 콘텐츠가 채워진 완성된 화면.

### Atomic Design 실무 주의점

* 모든 것을 5단계로 분류할 필요 없다. 팀에 맞게 유연하게.
* 핵심은 **재사용 가능한 작은 단위로 구성**한다는 사고방식
* "이 컴포넌트를 더 작게 쪼갤 수 있는가?" 항상 자문

---

## 2. 컴포넌트 설계 원칙

### Single Responsibility

하나의 컴포넌트는 하나의 역할만. `<UserCard>`가 사용자 정보 표시 + 편집 + 삭제까지 하면 안 됨.

### Composition over Configuration

Props가 10개 넘어가면 분리 신호. 작은 컴포넌트를 조합하라.

```tsx
// ❌ 거대한 props
<Card title="..." subtitle="..." icon="..." badge="..." actions={[...]} footer="..." />

// ✅ Composition
<Card>
  <Card.Header>
    <Card.Title>...</Card.Title>
    <Card.Badge>...</Card.Badge>
  </Card.Header>
  <Card.Content>...</Card.Content>
  <Card.Footer>...</Card.Footer>
</Card>
```

### Controlled vs Uncontrolled

* **Controlled**: 상태를 부모가 관리 (value + onChange)
* **Uncontrolled**: 컴포넌트 내부에서 상태 관리 (defaultValue)
* 폼 라이브러리와 통합할 때는 Controlled 방식 필수

### API 일관성

비슷한 컴포넌트는 비슷한 API를 가져야 한다:

* 크기: `size="sm" | "md" | "lg"` (모든 컴포넌트에서 동일)
* 변형: `variant="default" | "outline" | "ghost"` (일관된 네이밍)
* 비활성: `disabled` (boolean, 모든 interactive 컴포넌트)

---

## 3. 상태(States) 관리

모든 인터랙티브 컴포넌트는 최소 6가지 상태를 가진다:

### 필수 상태

| 상태 | 설명 | 시각적 변화 |
|------|------|-----------|
| Default | 기본 상태 | 기본 스타일 |
| Hover | 마우스 올림 | 배경색 변화, cursor: pointer |
| Focus | 키보드 포커스 | Focus ring (outline) |
| Active/Pressed | 클릭/탭 중 | 약간 어두운 배경, scale(0.98) |
| Disabled | 비활성 | opacity: 0.5, cursor: not-allowed |
| Loading | 로딩 중 | Spinner 또는 skeleton |

### 추가 상태 (컴포넌트별)

| 상태 | 적용 컴포넌트 | 시각적 변화 |
|------|-------------|-----------|
| Selected | Checkbox, Radio, Tab | 체크마크, 배경색 변화 |
| Error | Input, Form Field | 빨간 보더, 에러 메시지 |
| Success | Input (검증 완료) | 초록 체크, 성공 메시지 |
| Empty | List, Table | 빈 상태 일러스트 + 안내 |
| Dragging | Drag & Drop | Elevation, 반투명 |
| Read-only | Input, Textarea | 보더 제거, 배경색 변화 |

### 상태 전이 (State Transitions)

상태 변화는 **즉각적이되 부드러워야** 한다:

* `transition: all 150ms ease` (호버, 포커스)
* `transition: all 200ms ease-out` (확장, 축소)
* 색상 변화: 150ms
* 크기 변화: 200ms
* 위치 변화: 300ms

---

## 4. Variants (변형)

### Button Variants 예시

| Variant | 용도 | 시각적 |
|---------|------|--------|
| Primary/Solid | 주요 액션 (1개/화면) | 채워진 배경, 흰색 텍스트 |
| Secondary/Outline | 보조 액션 | 보더만, 투명 배경 |
| Ghost | 3차 액션, 네비게이션 | 보더 없음, 텍스트만 |
| Destructive | 삭제, 위험한 액션 | 빨간 계열 |
| Link | 인라인 액션 | 밑줄, 텍스트 색상만 |

### Size Variants

```
xs:  h-7  px-2  text-xs   — 테이블 내부, 밀집된 UI
sm:  h-8  px-3  text-sm   — 보조 액션, 콤팩트 UI
md:  h-9  px-4  text-sm   — 기본 (default)
lg:  h-10 px-6  text-base — 강조, 모바일 primary
xl:  h-12 px-8  text-lg   — 히어로 CTA
```

### Variant 설계 원칙

1. 시각적 무게(visual weight) = 중요도. Primary > Secondary > Ghost
2. 한 화면에 Primary 버튼은 1-2개 이하
3. Variant 수를 최소화. 5개 이내 권장
4. 새 variant 추가 전 기존 variant로 해결 가능한지 검토

---

## 5. 재사용성 (Reusability)

### 재사용 가능한 컴포넌트 체크리스트

* [ ] 특정 도메인 로직에 의존하지 않는가?
* [ ] Props로 충분히 커스터마이징 가능한가?
* [ ] 다른 컨텍스트에서도 의미가 통하는 네이밍인가?
* [ ] 접근성이 내장되어 있는가? (aria 속성, 키보드)
* [ ] 스타일이 토큰 기반인가? (하드코딩된 색상 없음)

### 추상화 레벨

```
너무 구체적 ←──────────────────→ 너무 추상적
<UserProfileCard>              <Box>
  (한 곳에서만 사용)             (너무 범용적, 의미 없음)

          <Card>
          (적절한 추상화)
```

**Rule of Three**: 같은 패턴이 3번 반복되면 컴포넌트로 추출.

---

## 6. 컴포넌트 문서화

### 최소 문서화 항목

1. **설명**: 이 컴포넌트가 무엇이고 언제 사용하는지
2. **Props/API**: 모든 props, 타입, 기본값, 설명
3. **상태별 예시**: Default, Hover, Focus, Disabled, Error...
4. **Variant 예시**: 모든 variant의 시각적 예시
5. **Do/Don't**: 올바른 사용법과 안티패턴
6. **접근성**: 키보드 동작, 스크린 리더 행동

### Storybook 활용

* 모든 컴포넌트에 Story 작성
* Controls 패널로 실시간 Props 변경 테스트
* Interaction Tests로 사용자 시나리오 검증
* Visual Regression Test (Chromatic) 연동

---

## 7. 안티패턴

* **God Component**: 하나의 컴포넌트가 모든 걸 함. 500줄+ 컴포넌트
* **Prop Drilling Hell**: 10단계 깊이로 props 전달
* **CSS 하드코딩**: `color: #3b82f6` 대신 `color: var(--color-primary)`
* **상태 누락**: Hover만 있고 Focus 없음 (접근성 위반)
* **불일치 네이밍**: `<Btn>`, `<Button>`, `<PrimaryButton>` 혼재

---

## 참고 자료

* Brad Frost, "Atomic Design" (atomicdesign.bradfrost.com)
* Storybook Best Practices
* React Component Patterns (compound, render props, hooks)
* shadcn/ui 컴포넌트 구조 참조
