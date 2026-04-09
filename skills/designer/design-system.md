# Design System

## 1. 디자인 시스템이란?

재사용 가능한 컴포넌트와 명확한 표준(standards)의 집합으로, 규모 있는 제품을 일관성 있게 관리하기 위한 **단일 진실 공급원(Single Source of Truth)**.

디자인 시스템 ≠ 컴포넌트 라이브러리. 컴포넌트 라이브러리는 디자인 시스템의 일부일 뿐.

### 디자인 시스템의 구성

```
Design System
├── Foundation (기초)
│   ├── Design Tokens (색상, 타이포, 간격, 그림자...)
│   ├── Grid & Layout
│   ├── Iconography
│   └── Motion
├── Components (컴포넌트)
│   ├── Primitives (Button, Input, Badge...)
│   ├── Compounds (SearchBar, FormField...)
│   └── Patterns (LoginForm, DataTable...)
├── Documentation (문서)
│   ├── Usage Guidelines
│   ├── Do/Don't
│   ├── Accessibility Notes
│   └── Code Examples
└── Governance (거버넌스)
    ├── Contribution Process
    ├── Versioning
    └── Decision Log
```

---

## 2. 디자인 시스템 구축 원칙

### 1. Start with Audit

기존 UI를 감사(audit)하여 패턴 파악:

* 모든 버튼, 입력, 색상, 폰트 크기 스크린샷 수집
* 중복/불일치 식별
* 통합 가능한 패턴 그룹핑

### 2. Design Tokens First

시각적 속성을 **토큰**으로 추상화한 뒤 컴포넌트에 적용:

* Primitive tokens → Semantic tokens → Component tokens
* 토큰이 없으면 컴포넌트를 만들지 않는다

### 3. API-driven Component Design

컴포넌트는 **API(Props)**로 사용한다:

* 일관된 Props 네이밍 (`size`, `variant`, `disabled`)
* 예측 가능한 행동
* TypeScript로 타입 안전성

### 4. Accessible by Default

접근성은 사후 추가가 아닌 기본:

* 키보드 네비게이션 내장
* ARIA 속성 자동 적용
* Focus management
* Color contrast 준수

### 5. Documentation is the System

문서화되지 않은 컴포넌트는 존재하지 않는 것과 같다:

* 모든 컴포넌트에 사용법, 예시, Do/Don't
* 복사-붙여넣기 가능한 코드
* 변경 이력 (Changelog)

---

## 3. 컴포넌트 라이브러리

### 계층 구조

**Primitives (기본 요소)** 가장 작은 재사용 단위. 더 이상 쪼갤 수 없음.

* Button, Input, Select, Checkbox, Radio
* Badge, Avatar, Icon, Tooltip
* Separator, Skeleton, Spinner

**Compound Components (복합 컴포넌트)** Primitive의 의미 있는 조합.

* FormField (Label + Input + HelperText + ErrorMessage)
* SearchBar (Input + Icon + Button)
* Pagination (Button + Text + Select)
* Breadcrumb (Link + Separator + Text)

**Patterns (패턴)** 특정 사용 맥락의 검증된 솔루션.

* DataTable (SortableHeader + Row + Pagination + Filters)
* Modal Dialog (Overlay + Content + Close + Actions)
* Navigation (Sidebar + NavItem + SubMenu)

### 컴포넌트 Status

| Status | 의미 | Badge |
|--------|------|-------|
| Draft | 설계 중, 미완성 | 🔴 |
| Beta | 사용 가능하나 API 변경 가능 | 🟡 |
| Stable | 프로덕션 준비 완료 | 🟢 |
| Deprecated | 사용 중단 예정 | ⚫ |

---

## 4. 디자인-코드 동기화

### Figma ↔ Code 일관성 유지

**Figma 측**

* 컴포넌트에 Auto Layout + Constraints
* Variant로 모든 상태 표현
* Design Token을 Figma Styles/Variables로 관리
* 네이밍 = 코드 네이밍 (`Button/Primary/Large/Default`)

**Code 측**

* Figma 컴포넌트와 1:1 대응
* Design Token을 CSS Variables로
* Storybook으로 시각적 문서화
* Visual Regression Test (Chromatic)

### 동기화 전략

1. **Token 기반**: Figma Variables → 빌드 시스템 → CSS/JS 토큰
2. **단방향 동기화**: Design (Figma) → Code. Code에서 디자인 변경 ❌
3. **정기 감사**: 월 1회 Figma vs 코드 불일치 점검

---

## 5. 디자인 시스템 문서화

### Storybook

```
stories/
├── foundations/
│   ├── Colors.stories.tsx
│   ├── Typography.stories.tsx
│   └── Spacing.stories.tsx
├── components/
│   ├── Button.stories.tsx
│   ├── Input.stories.tsx
│   └── Modal.stories.tsx
└── patterns/
    ├── LoginForm.stories.tsx
    └── DataTable.stories.tsx
```

### 컴포넌트 문서 구조

1. **Overview**: 컴포넌트 설명, 언제 사용하는지
2. **Playground**: Interactive controls로 실시간 테스트
3. **Variants**: 모든 변형 시각적 나열
4. **States**: Default, Hover, Focus, Disabled, Error, Loading
5. **Sizes**: sm, md, lg
6. **Do/Don't**: 올바른/잘못된 사용 예시
7. **Accessibility**: 키보드 동작, ARIA, 스크린 리더
8. **API Reference**: Props 테이블
9. **Changelog**: 버전별 변경사항

---

## 6. 거버넌스 (Governance)

### Contribution 프로세스

```
1. Request → 2. Review → 3. Design → 4. Build → 5. Document → 6. Release
```

1. **Request**: Issue 생성 (새 컴포넌트 / 기존 컴포넌트 수정)
2. **Review**: 디자인 시스템 팀이 필요성 평가 (기존으로 해결 가능한지)
3. **Design**: Figma에서 설계 + 디자인 리뷰
4. **Build**: 코드 구현 + 코드 리뷰
5. **Document**: Storybook + 사용 가이드라인
6. **Release**: 버전 업, Changelog

### Versioning

* **Semantic Versioning**: MAJOR.MINOR.PATCH
* MAJOR: Breaking change (API 변경)
* MINOR: 새 컴포넌트/기능 추가 (호환)
* PATCH: 버그 수정

### Adoption 측정

* 디자인 시스템 컴포넌트 사용률
* 커스텀 컴포넌트 vs 시스템 컴포넌트 비율
* 개발자/디자이너 만족도 서베이

---

## 7. 유명 디자인 시스템 참조

| 시스템 | 조직 | 특징 |
|--------|------|------|
| Material Design | Google | 가장 포괄적, 모션 원칙 |
| Human Interface Guidelines | Apple | 플랫폼 네이티브, 디테일 |
| Carbon | IBM | 접근성 강조, 데이터 |
| Polaris | Shopify | 이커머스 패턴 |
| Primer | GitHub | 개발자 친화적 |
| Radix | Workos | Headless, 접근성 |
| shadcn/ui | shadcn | Copy-paste, Tailwind |

---

## 8. 안티패턴

* **빅뱅 접근**: 6개월간 완벽한 시스템 만들기 → 아무도 안 씀. 점진적으로!
* **디자이너만의 시스템**: 개발자 참여 없이 만든 시스템은 구현 불일치
* **과도한 추상화**: 모든 것을 토큰화하려다 복잡성 폭발
* **문서 없는 컴포넌트**: "코드 보면 알잖아" → 아무도 안 봄
* **거버넌스 부재**: 누구나 마음대로 수정 → 일관성 붕괴

---

## 참고 자료

* Brad Frost, "Atomic Design"
* Nathan Curtis, "Modular Web Design"
* designsystems.com
* Figma — Design Systems (figma.com/design-systems)
* Storybook (storybook.js.org)
