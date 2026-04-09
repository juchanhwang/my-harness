# Test Planning

## 테스트 계획이란

테스트 계획은 **무엇을, 어떻게, 언제, 누가** 테스트할지를 정의하는 문서다. 즉흥적 테스트가 아닌 전략적 테스트를 가능하게 한다.

## 테스트 계획의 핵심 요소

### 1. 범위 정의 (Scope)

가장 먼저 "무엇을 테스트하고 무엇을 테스트하지 않을지" 명확히 한다.

```markdown
## In Scope
- 회원가입 플로우 (이메일, 소셜 로그인)
- 결제 프로세스 (카드, 무통장)
- 사용자 프로필 CRUD

## Out of Scope
- 어드민 대시보드 (별도 테스트 계획)
- 레거시 API v1 (deprecation 예정)
- 서드파티 결제 게이트웨이 내부 로직
```

### 2. 테스트 케이스 설계

#### 해피 패스 (Happy Path)

정상적인 사용자 플로우. 가장 먼저 검증한다.

```typescript
test('사용자가 이메일로 회원가입할 수 있다', async () => {
  await page.goto('/signup');
  await page.getByLabel('이메일').fill('test@example.com');
  await page.getByLabel('비밀번호').fill('SecurePass123!');
  await page.getByRole('button', { name: '가입하기' }).click();
  await expect(page.getByText('가입 완료')).toBeVisible();
});
```

#### 엣지 케이스 (Edge Cases)

경계값과 예외 상황. 여기서 버그가 나온다.

```typescript
// 경계값 테스트
const edgeCases = [
  { input: '', expected: '이메일을 입력해주세요' },           // 빈 값
  { input: 'a'.repeat(255) + '@test.com', expected: '...' },  // 최대 길이
  { input: 'test@', expected: '올바른 이메일 형식이 아닙니다' }, // 불완전
  { input: '  test@test.com  ', expected: '가입 완료' },       // 공백 포함
  { input: 'TEST@TEST.COM', expected: '가입 완료' },            // 대문자
];
```

#### 에러 케이스 (Error Cases)

시스템이 우아하게 실패하는지 검증.

```typescript
test('중복 이메일로 가입 시 적절한 에러 표시', async () => {
  // 이미 존재하는 이메일로 가입 시도
  await signupWith('existing@test.com');
  await expect(page.getByRole('alert')).toHaveText('이미 사용 중인 이메일입니다');
});

test('서버 에러 시 사용자 친화적 메시지 표시', async () => {
  // API 500 에러 시뮬레이션
  await page.route('/api/signup', route => route.fulfill({ status: 500 }));
  await signupWith('test@test.com');
  await expect(page.getByRole('alert')).toHaveText('잠시 후 다시 시도해주세요');
});
```

### 3. 우선순위 결정

#### MoSCoW 방법

| 우선순위       | 설명                     | 예시              |
| ---------- | ---------------------- | --------------- |
| **Must**   | 반드시 테스트. 실패 시 릴리스 불가   | 결제, 인증, 데이터 무결성 |
| **Should** | 해야 하지만 시간 부족 시 다음 스프린트 | 검색 필터, 정렬, 알림   |
| **Could**  | 있으면 좋지만 필수 아님          | UI 애니메이션, 툴팁    |
| **Won't**  | 이번에는 안 함 (명시적 제외)      | 어드민 기능, 레거시     |

#### 리스크 × 영향 매트릭스로 우선순위

```typescript
interface TestPriority {
  feature: string;
  risk: 'high' | 'medium' | 'low';
  businessImpact: 'high' | 'medium' | 'low';
  priority: number; // 1이 가장 높음
  testLevel: ('unit' | 'integration' | 'e2e')[];
}

const priorities: TestPriority[] = [
  {
    feature: '결제 프로세스',
    risk: 'high',
    businessImpact: 'high',
    priority: 1,
    testLevel: ['unit', 'integration', 'e2e'],
  },
  {
    feature: '사용자 인증',
    risk: 'high',
    businessImpact: 'high',
    priority: 1,
    testLevel: ['unit', 'integration', 'e2e'],
  },
  {
    feature: '프로필 편집',
    risk: 'low',
    businessImpact: 'low',
    priority: 3,
    testLevel: ['integration'],
  },
];
```

## 시간 제약 하의 테스트 (Time-Boxed Testing)

현실에서는 항상 시간이 부족하다. 제한된 시간 안에 최대 가치를 뽑아내는 전략.

### 타임박싱 원칙

1. **Critical Path 먼저**: 핵심 비즈니스 플로우의 해피 패스
2. **리스크 높은 변경 사항**: 새 코드, 리팩토링된 코드
3. **이전 버그 발생 영역**: 과거 버그가 많았던 모듈
4. **나머지는 탐색적 테스트**: 정해진 시간 동안 자유롭게 탐색

### 1시간 테스트 계획

```
0-15분: Critical Path E2E (가입 → 로그인 → 핵심 기능 → 결제)
15-30분: 이번 릴리스 변경 사항의 Integration 테스트 리뷰
30-45분: 엣지 케이스 탐색적 테스트 (변경된 영역)
45-60분: 크로스 브라우저/디바이스 스팟 체크
```

### 3일 테스트 계획

```
Day 1: 기능 테스트
- 모든 해피 패스 E2E 실행
- 변경된 기능의 상세 테스트 케이스 실행
- 자동화 테스트 스위트 전체 실행

Day 2: 비기능 테스트 + 엣지 케이스
- 성능 테스트 (주요 API 응답 시간)
- 보안 체크 (입력 검증, 인증)
- 엣지 케이스 집중 탐색

Day 3: 회귀 + 탐색적
- 전체 회귀 테스트 스위트
- 세션 기반 탐색적 테스트
- 버그 수정 검증 (verification)
```

## 테스트 케이스 관리

### 좋은 테스트 케이스의 조건

1. **독립적**: 다른 테스트에 의존하지 않음
2. **반복 가능**: 몇 번을 실행해도 같은 결과
3. **명확한 기대 결과**: "정상 작동"이 아닌 구체적 검증 포인트
4. **추적 가능**: 요구사항이나 사용자 스토리와 연결

### 테스트 케이스 작성 형식

```markdown
**TC-001: 유효한 이메일로 회원가입**
- 사전 조건: 미가입 이메일
- 입력: email=test@example.com, password=Secure123!
- 실행 단계:
  1. /signup 페이지 접속
  2. 이메일 입력
  3. 비밀번호 입력
  4. "가입하기" 버튼 클릭
- 기대 결과: "가입 완료" 메시지 표시, 이메일 인증 메일 발송
- 우선순위: Must
- 자동화: Yes (E2E)
```

## 테스트 추정 (Test Estimation)

### 작업 분해 기반 추정

```
기능: 사용자 프로필 편집
├── 테스트 케이스 설계: 2h
├── Unit Tests 작성: 4h
│   ├── 유효성 검사 로직: 2h
│   └── 데이터 변환 로직: 2h
├── Integration Tests 작성: 3h
│   ├── API endpoint 테스트: 2h
│   └── DB 연동 테스트: 1h
├── E2E Tests 작성: 2h
│   └── 프로필 편집 플로우: 2h
├── 탐색적 테스트: 1h
└── 버그 수정 검증: 1h (버퍼)
───────────────────────
총 예상: 13h
버퍼 (+20%): ~16h
```

### 추정 시 고려사항

* **복잡도 곱수**: 새 기술 × 1.5, 레거시 코드 × 2
* **경험 곱수**: 처음 다루는 도메인 × 1.3
* **의존성 곱수**: 외부 시스템 연동 × 1.5
* **버퍼**: 최소 20% (머피의 법칙)

## 테스트 계획 리뷰 체크리스트

* [ ] 비즈니스 요구사항이 모두 테스트 케이스로 매핑되었는가
* [ ] 리스크 높은 영역이 식별되고 적절한 테스트가 배정되었는가
* [ ] 테스트 환경과 데이터가 준비되었는가
* [ ] 일정이 현실적인가 (버퍼 포함)
* [ ] 완료 기준(Exit Criteria)이 명확한가
* [ ] 이전 릴리스의 교훈이 반영되었는가

## 테스트 계획 안티패턴

### 🚫 문서만 있는 계획

테스트 계획 문서는 100페이지인데 실제 테스트는 임기응변. 계획은 실행 가능해야 한다.

### 🚫 해피 패스만 테스트

"정상 동작합니다" — 물론 정상이지, 정상 입력을 넣었으니까. 엣지 케이스, 에러 케이스, 동시성 시나리오를 넣어라.

### 🚫 모든 것을 자동화하려는 욕심

자동화 ROI가 낮은 테스트도 있다. 한 번만 실행할 테스트, 자주 변하는 UI의 시각적 테스트는 수동이 효율적일 수 있다.

### 🚫 계획 없는 테스트

"그냥 다 눌러보면 되지" — 이것은 테스트가 아니라 산책이다. 목적, 범위, 기대 결과가 정의되어야 테스트다.