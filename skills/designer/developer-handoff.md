# Developer Handoff

## 1. 핸드오프의 본질

핸드오프는 "디자인 파일을 던지는 것"이 아니라 **디자인 의도를 정확히 전달하는 것**. 디자이너와 개발자 사이의 정보 비대칭을 최소화.

### 핸드오프 =/= 핸드오버

* **Handover**: "여기 파일이야, 만들어줘" (일방적)
* **Handoff + Handshake**: 함께 논의하고, 질문하고, 조정하는 **지속적 협업**

---

## 2. Figma Dev Mode

### Dev Mode 핵심 기능

**Inspect 패널**

* CSS 속성 자동 추출 (크기, 간격, 색상, 타이포)
* 요소 간 간격 측정 (Shift+호버)
* 코드 스니펫 (CSS, iOS, Android)

**Variables → Code**

* Figma Variables가 CSS Custom Properties로 매핑
* `--color-primary`, `--space-4` 등 토큰으로 전달
* 하드코딩된 값이 아닌 토큰 기반 소통

**Component Properties**

* Props 표시: variant, size, state
* 코드 컴포넌트와 1:1 매핑 확인
* Boolean props (showIcon, disabled 등)

**Ready for Dev 표시**

* 프레임에 "Ready for Dev" 상태 마킹
* 개발자는 준비된 디자인만 확인
* 변경 이력 추적 (Compare Changes)

---

## 3. 핸드오프 문서 구조

### 화면별 스펙

```markdown
## [화면 이름] - [상태]

### 개요
- 목적: [이 화면이 해결하는 문제]
- 진입 경로: [어떻게 이 화면에 도달하는지]
- 유저 플로우: [Figma 링크]

### 상태별 디자인
- Default: [Figma 프레임 링크]
- Loading: [Figma 프레임 링크]
- Empty: [Figma 프레임 링크]
- Error: [Figma 프레임 링크]
- Success: [Figma 프레임 링크]

### 반응형
- Desktop (1280px+): [링크]
- Tablet (768px): [링크]
- Mobile (375px): [링크]

### 인터랙션 스펙
- [요소 A] 클릭 → [화면 B]로 이동 (transition: slide-left, 300ms)
- [리스트 아이템] 호버 → 배경색 변경 (--color-bg-muted, 150ms)
- [삭제 버튼] 클릭 → 확인 다이얼로그 표시

### 데이터/API 참고
- 리스트: GET /api/items (pagination: offset 기반)
- 최대 표시 개수: 20
- 정렬: 최신순 기본

### 접근성 주의사항
- [모달]: Focus trap 필요, Escape로 닫기
- [에러 메시지]: role="alert", 자동 포커스
- [검색 결과]: aria-live="polite"
```

---

## 4. 인터랙션 스펙

### 애니메이션 스펙 문서화

```markdown
### 모달 열기
- Trigger: 버튼 클릭
- Overlay: opacity 0→1, 200ms, ease
- Content: translateY(16px)→0, opacity 0→1, 200ms, ease-out
- Focus: 첫 번째 포커스 가능한 요소로 이동

### 모달 닫기
- Trigger: Escape / 외부 클릭 / 닫기 버튼
- Content: opacity 1→0, 150ms, ease-in
- Overlay: opacity 1→0, 150ms, ease
- Focus: 트리거 요소로 복귀
```

### 상태 전이 다이어그램

```
Button States:
Default ──(hover)──→ Hover
Hover ──(mouseout)──→ Default
Default ──(focus)──→ Focus
Focus ──(blur)──→ Default
Default/Hover ──(mousedown)──→ Active
Active ──(mouseup)──→ Hover
Any ──(disabled=true)──→ Disabled
```

---

## 5. 디자인-코드 일관성

### 네이밍 매핑

| Figma | Code | 설명 |
|-------|------|------|
| Button/Primary/Large/Default | `<Button variant="default" size="lg">` | 컴포넌트 |
| color/primary | `var(--color-primary)` | 토큰 |
| space/4 | `var(--space-4)` 또는 `p-4` | 스페이싱 |
| text/heading/h2 | `text-2xl font-semibold` | 타이포 |
| radius/lg | `rounded-lg` | 모서리 |

### 토큰 매핑 테이블 유지

디자인 시스템 문서에 Figma <-> Tailwind/CSS 매핑 테이블 유지:

```markdown
| Figma Variable | CSS Variable | Tailwind |
|---------------|-------------|----------|
| color/bg/default | --background | bg-background |
| color/text/primary | --foreground | text-foreground |
| color/primary | --primary | text-primary / bg-primary |
| space/1 | --space-1 (4px) | p-1 / m-1 |
| space/2 | --space-2 (8px) | p-2 / m-2 |
| radius/md | --radius | rounded-md |
```

---

## 6. 디자인 QA (Quality Assurance)

개발 결과물이 디자인과 일치하는지 검증.

### 디자인 QA 체크리스트

**레이아웃**

* [ ] 간격이 디자인과 일치 (8pt grid)
* [ ] 정렬이 올바른가
* [ ] 반응형 브레이크포인트에서 레이아웃 정상
* [ ] 최소/최대 너비 처리

**타이포그래피**

* [ ] 폰트, 크기, 무게 일치
* [ ] 행간, 자간 일치
* [ ] 긴 텍스트 truncation/wrap 처리
* [ ] 다국어 텍스트 확장 대응

**색상**

* [ ] 토큰 기반 색상 사용 (하드코딩 (X))
* [ ] 다크 모드 정상
* [ ] 호버/포커스/활성 상태 색상

**인터랙션**

* [ ] 호버, 포커스, 활성, 비활성 상태
* [ ] 애니메이션 duration/easing
* [ ] 로딩 상태
* [ ] 에러 상태

**접근성**

* [ ] 키보드 네비게이션
* [ ] 포커스 링 visible
* [ ] 스크린 리더 테스트
* [ ] 색상 대비

### 디자인 QA 프로세스

1. **스테이징 환경에서 검수**: 개발 완료 → 스테이징 배포 → 디자이너 검수
2. **Issue 생성**: 불일치 발견 시 스크린샷 + Figma 링크 + 구체적 차이점
3. **심각도 분류**:
   * P0: 기능적 문제 (클릭 불가, 레이아웃 깨짐)
   * P1: 명백한 시각적 차이 (잘못된 색상, 크기)
   * P2: 미세한 차이 (1-2px 오차, 미묘한 색상)
   * P3: 나중에 개선 (Nice to have)

### Pixel Perfect에 대하여

* **1:1 완벽 매칭은 비현실적이고 불필요**
* 디자인 시스템 토큰과 컴포넌트를 올바르게 사용했는지가 중요
* 시각적으로 "같아 보이면" OK
* 허용 오차: 간격 +-2px, 색상은 정확히 일치

---

## 7. 협업 프로세스

### 이상적 협업 타임라인

```
Week 1-2: Discovery & Define
├── 디자이너 + 개발자 함께 기술 탐색
├── 기술적 제약 파악
└── API 구조 논의

Week 2-3: Design
├── 와이어프레임 → 개발자 리뷰 (실현 가능성)
├── UI 디자인 → 개발자 리뷰 (컴포넌트 매핑)
└── 프로토타입 → 팀 리뷰

Week 3-4: Build
├── 핸드오프 세션 (30-60분 워크스루)
├── 개발 중 지속적 질의응답
├── 중간 체크 (50% 완료 시)
└── 디자인 QA

Week 4+: Polish & Ship
├── 디자인 QA 이슈 수정
├── 엣지 케이스 디자인 보완
└── 출시 후 모니터링
```

### 핸드오프 킥오프 미팅

30-60분 세션:

1. **디자인 워크스루**: 유저 플로우 따라 설명 (5-10분)
2. **컴포넌트 매핑**: 어떤 기존 컴포넌트 사용, 새로 만들 것 (10분)
3. **인터랙션 설명**: 애니메이션, 상태 전이 (5-10분)
4. **엣지 케이스**: Empty, Error, Loading 상태 (5분)
5. **질의응답**: 개발자 질문 (10-15분)
6. **합의**: 구현 범위, 일정, 우선순위 (5분)

---

## 8. 도구

### 핸드오프 도구

| 도구 | 용도 |
|------|------|
| Figma Dev Mode | 스펙 추출, 코드 스니펫, 변수 확인 |
| Storybook | 컴포넌트 문서, 시각적 테스트 |
| Zeplin | 전통적 핸드오프 도구 (대안) |
| Notion/Linear | 스펙 문서, 이슈 트래킹 |
| Loom | 비동기 디자인 설명 영상 |

---

## 9. 안티패턴

* **"Figma 링크 던지기"**: 설명 없이 링크만 공유
* **디자인 완료 후 개발 시작**: 개발자 초기 참여 없음 → 구현 시 문제 발견
* **"다 들어있으니까 알아서 봐"**: 어떤 프레임이 최종인지 불명확
* **반응형 미설계**: "모바일은 알아서" → 개발자가 임의로 결정
* **상태 디자인 누락**: Default만 있고 Empty/Error/Loading 없음
* **Pixel-perfect 강요**: 2px 차이에 집착 → 생산성 저하

---

## 참고 자료

* Figma Dev Mode 문서
* NNGroup — "Designer-Developer Collaboration"
* Smashing Magazine — "Design Handoff" 시리즈
* Zeroheight (디자인 시스템 문서화)
