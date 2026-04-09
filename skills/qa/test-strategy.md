# Test Strategy

> 참조: [Martin Fowler — The Practical Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html) (Mike Cohn 피라미드 해설) · [Kent C. Dodds — The Testing Trophy and Testing Classifications](https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications) · [Martin Fowler — Test Coverage](https://martinfowler.com/bliki/TestCoverage.html) · [Google Testing Blog — Just Say No to More End-to-End Tests](https://testing.googleblog.com/2015/04/just-say-no-to-more-end-to-end-tests.html) · ISTQB Foundation Level Syllabus (Risk-Based Testing §5.2)
> 핵심 메시지: **"모든 것을 테스트할 수 없다면 리스크가 큰 것부터. 피드백 루프 속도가 커버리지보다 중요하다."**

## 테스트 피라미드 (Test Pyramid)

Mike Cohn이 2009년에 제안한 테스트 피라미드는 테스트 자동화의 가장 기본적인 프레임워크다.

```
        /\
       /  \        E2E Tests (소수, 느림, 비쌈)
      /    \
     /------\
    /        \     Integration Tests (중간)
   /          \
  /------------\
 /              \   Unit Tests (다수, 빠름, 저렴)
/________________\
```

### 각 레이어의 특성

| 레이어         | 속도   | 비용 | 신뢰도        | 비율  |
| ----------- | ---- | -- | ---------- | --- |
| Unit        | \~ms | 최저 | 낮음 (격리됨)   | 70% |
| Integration | \~초  | 중간 | 중간         | 20% |
| E2E         | \~분  | 최고 | 높음 (실제 환경) | 10% |

### 피라미드의 핵심 교훈

* **아래로 갈수록 많이**: 단위 테스트가 기반. 빠르고 저렴하니 많이 작성
* **위로 갈수록 적게**: E2E는 느리고 플레이키하니 핵심 플로우만
* **피드백 루프**: 단위 테스트로 빠른 피드백, E2E로 전체 검증

## 테스트 트로피 (Testing Trophy)

Kent C. Dodds가 2018년에 제안한 대안 모델. "Write tests. Not too many. Mostly integration."

```
        🏆
       /  \        E2E (소수)
      /----\
     /      \      Integration (다수) ← 여기에 집중
    /--------\
   /          \    Unit (필요한 만큼)
  /   Static   \   Static Analysis (기반)
 /______________\
```

### 피라미드와의 차이점

* **Integration에 가장 많은 투자**: 실제 사용자 행동에 가장 가까운 테스트
* **Static Analysis를 별도 레이어로**: TypeScript, ESLint가 잡는 버그는 테스트 불필요
* **Unit은 복잡한 로직에만**: 모든 함수에 단위 테스트를 달 필요 없음
* **ROI 중심**: 속도/비용이 아니라 테스트가 주는 신뢰도(confidence)에 집중

### 언제 어떤 모델을 쓸까 — 판단 프레임워크

기계적 매핑("웹앱이면 트로피")은 **이미 피라미드로 1,000개 테스트를 짜놓은 팀**에게는 유해하다. 모델 선택은 **팀의 현재 상태**와 **전환 비용**을 고려해야 한다. 다음 3단계 프레임워크로 판단한다.

#### Step 1 — 팀 현재 상태 진단

다음 질문에 솔직히 답한다:

| 질문 | Yes | No |
|---|---|---|
| **Q1**. 팀이 RTL + MSW로 통합 테스트를 써본 경험이 있는가? | → 트로피 가능 | → 피라미드부터 시작 |
| **Q2**. CI에서 전체 테스트 실행 시간이 10분 이하인가? | → 어느 모델이든 OK | → Integration 비중을 줄여야 함 (트로피는 더 느림) |
| **Q3**. 지난 6개월간 "단위 테스트는 통과했는데 실제 환경에서 터진" 사고가 있었는가? | → **트로피로 전환 필수** | → 피라미드 유지 OK |
| **Q4**. 팀 규모 > 10명인가? | → 테스트 표준화가 더 중요 (모델보다 일관성) | → 팀이 선호하는 모델 |
| **Q5**. 리팩토링 빈도가 높은가? | → 트로피 (Integration이 리팩토링 내성 높음) | → 피라미드 OK |
| **Q6**. 공용 라이브러리/SDK를 만드는가? | → 피라미드 (Unit 중심) — 조합이 무한해서 Integration이 비효율 | → 트로피 OK |

Q3가 **가장 강력한 신호**다. Yes면 다른 질문에 상관없이 트로피로 전환해야 한다.

#### Step 2 — 상황별 권장 조합

**케이스 A: "우리 팀은 Unit 테스트만 있고 flaky E2E도 몇 개 있다"** (가장 흔한 상황)
→ **현재는 Ice Cream Cone에 가까운 안티패턴.** Integration 레이어를 새로 도입한다.
- 단계:
  1. 기존 Unit 테스트 유지
  2. RTL + MSW로 Integration 테스트 도입
  3. 가장 자주 깨지는 E2E를 Integration으로 "내린다"
- **절대 금지**: 기존 Unit을 먼저 지우지 마라. Integration과 공존시킨 뒤 중복을 1~2개 릴리스 후 천천히 정리한다.

**케이스 B: "이미 Jest로 Unit 1,000개, CI 15분이다"** (레거시 성장통)
→ **트로피 도입 보류.** 피라미드 최적화가 먼저.
- 우선순위:
  1. CI 병렬화 / shard 분할
  2. 느린 테스트 프로파일링 (`vitest --reporter=verbose`)
  3. 불필요한 Unit 제거 (변경 빈도 0, 결함 발견 0)
  4. 그다음 트로피 검토
- **이유**: 1,000개 테스트를 재작성하는 비용 > 모델 전환의 이득.

**케이스 C: "새 프로젝트, 팀은 React 초심자 2명"** (greenfield)
→ **트로피 권장.** Unit보다 Integration이 초심자에게 ROI 높음 (실제 사용자 관점 = 학습 곡선 낮음).
- 단, 순수 유틸 함수(날짜 포맷팅, 계산 로직, 파서)는 Unit으로 작성.
- Static Analysis 레이어(TypeScript strict, ESLint)를 가장 먼저 활성화.

**케이스 D: "공용 UI 라이브러리 개발 중"**
→ **피라미드 + Storybook + visual-testing.**
- 각 컴포넌트의 props 조합을 Unit으로 검증하는 게 Integration보다 효율적.
- Storybook stories가 사실상 visual regression test + 문서 역할을 동시에.

**케이스 E: "마이크로서비스 10개 + 팀 3개 + Contract이 자주 깨짐"**
→ **피라미드 + Contract Test (Pact, Spring Cloud Contract).**
- Integration은 **서비스 간 계약 검증**에 집중.
- 각 서비스 내부는 Unit.
- E2E는 **크리티컬 플로우 3~5개**만 (결제, 인증, 핵심 기능).

#### Step 3 — 전환 전략 (모델 변경 시)

**🚫 Don't**: 기존 테스트 코드를 일괄 삭제하고 새 모델로 재작성.
- 커버리지 구멍 발생 → 회귀 사고 → 팀 신뢰 상실 → 모델 전환 자체가 실패로 낙인찍힘.

**✅ Do — Strangler Fig 패턴**:
1. **새 기능부터** 새 모델로 작성 (기존 테스트는 건드리지 않는다)
2. 기존 테스트는 **"변경이 필요할 때"** 새 모델로 전환 (수정 시점에 재작성 / 방치)
3. 3~6개월 후, **중복되는 테스트 중 업데이트 빈도가 낮은 쪽**을 제거
4. 각 릴리스마다 DER(Defect Escape Rate) 추적 — 품질이 떨어지지 않는지 확인 (qa-metrics.md §1 참조)
5. **6개월 후 회고**: 모델 전환이 실제로 가치를 주었는가? 전환 전후 DER, CI 시간, 리뷰 시간을 비교한다.

**전환 실패 신호 — 원래 모델로 되돌려야 할 때**:
- DER이 전환 전보다 **증가**
- CI 시간이 **2배 이상** 증가
- 팀이 "테스트가 귀찮다"고 불평하는 빈도 증가

**두 모델 모두 휴리스틱이지 절대 규칙이 아니다.** 팀의 기술 스택, 프로젝트 특성, 비즈니스 요구사항, **현재 테스트 자산**에 맞게 조정한다.

## 리스크 기반 테스트 (Risk-Based Testing)

모든 것을 테스트할 수 없다면 **리스크가 가장 높은 곳**부터 테스트한다.

### 리스크 매트릭스

```
높음 │ Medium   │ High     │ Critical
     │          │          │
영향 │ Low      │ Medium   │ High
     │          │          │
낮음 │ Very Low │ Low      │ Medium
     └──────────┴──────────┴──────────
       낮음       중간        높음
                발생 확률
```

### 리스크 평가 기준

**비즈니스 임팩트 (Impact)**:

* 매출 직접 영향 (결제, 구독)
* 사용자 데이터 손실/유출
* 법적/규제 위반
* 브랜드 이미지 훼손

**발생 확률 (Likelihood)**:

* 변경 빈도가 높은 코드
* 복잡도가 높은 로직
* 외부 시스템 의존성
* 새로운/검증되지 않은 기술

### 실전 적용 예시

```typescript
// 리스크 분류 예시
const riskAssessment = {
  결제_프로세스: { impact: 'critical', likelihood: 'medium', priority: 1 },
  사용자_인증: { impact: 'critical', likelihood: 'medium', priority: 1 },
  데이터_마이그레이션: { impact: 'high', likelihood: 'high', priority: 1 },
  검색_기능: { impact: 'medium', likelihood: 'medium', priority: 2 },
  어드민_대시보드: { impact: 'low', likelihood: 'low', priority: 3 },
  마케팅_랜딩_페이지: { impact: 'low', likelihood: 'low', priority: 3 },
};
```

## 테스트 커버리지 전략

### 커버리지의 함정

* **100% 커버리지 ≠ 버그 없음**: 모든 라인을 실행해도 잘못된 assert면 의미 없음
* **커버리지는 가이드라인이지 목표가 아니다**: 80%가 합리적 기준
* **커버리지가 낮은 곳이 위험한 곳**: 0%인 모듈이 리스크 높음

### 의미 있는 커버리지 측정

```bash
# Vitest 커버리지 설정 (v4+ 기준)
# vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8', // v4에서도 기본값. istanbul 대안 있음
      reporter: ['text', 'json', 'html'],
      // ⚠️ Vitest v4에서 coverage.all 옵션이 제거됨.
      // 기본 동작이 "테스트 실행 중 import된 파일만 리포트"로 변경되었으므로,
      // 전체 소스를 리포트하려면 include를 명시해야 한다 (0% 파일도 표시).
      include: ['src/**/*.{ts,tsx}'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
      exclude: [
        'node_modules/',
        'test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/types/**',
      ],
    },
  },
});
```

### 커버리지 유형별 의미

| 유형        | 의미               | 중요도    |
| --------- | ---------------- | ------ |
| Statement | 각 구문 실행 여부       | 기본     |
| Branch    | if/else 분기 모두 실행 | **높음** |
| Function  | 함수 호출 여부         | 중간     |
| Line      | 각 라인 실행 여부       | 기본     |

**Branch Coverage가 가장 중요하다.** else 절, catch 블록, early return — 이런 분기를 테스트하지 않으면 프로덕션에서 터진다.

## 테스트 전략 수립 프로세스

### 1단계: 컨텍스트 분석

* 프로젝트 규모와 복잡도
* 팀 역량과 경험
* 릴리스 주기와 시간 제약
* 기존 테스트 자산

### 2단계: 리스크 식별

* 비즈니스 크리티컬 기능 목록 작성
* 변경 빈도 높은 모듈 식별
* 외부 의존성 매핑

### 3단계: 테스트 레벨 배분

* 각 리스크 영역에 적합한 테스트 레벨 결정
* 자동화 가능 여부 평가
* 수동 테스트가 필요한 영역 식별

### 4단계: 도구 선택

* 기술 스택과 호환되는 도구
* 팀 학습 비용
* CI/CD 통합 용이성

### 5단계: 메트릭 정의

* 성공 기준 (커버리지, 통과율, 실행 시간)
* 모니터링 방법
* 피드백 루프 구축

## 테스트 전략 안티패턴

### 🚫 아이스크림 콘 (Ice Cream Cone)

피라미드를 뒤집은 형태. E2E가 가장 많고 Unit이 가장 적음. 느리고, 플레이키하고, 유지보수 비용 폭발.

### 🚫 모래시계 (Hourglass)

Unit과 E2E만 있고 Integration이 없음. 단위 테스트는 통과하지만 모듈 간 연결에서 터짐.

### 🚫 커버리지 숭배 (Coverage Worship)

커버리지 100%를 추구하며 의미 없는 테스트 양산. `expect(1 + 1).toBe(2)` 같은 테스트.

### 🚫 테스트 없는 자신감 (No-Test Confidence)

"나는 꼼꼼하니까 테스트 없어도 돼." 사람은 실수한다. 기계는 잊지 않는다.