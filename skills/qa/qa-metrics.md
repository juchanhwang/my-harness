# QA Metrics

> 참조: Capers Jones, *Applied Software Measurement* (McGraw-Hill, 3rd ed., 2008) — DRE 원전 · [ISTQB Foundation Level Syllabus §5.4](https://www.istqb.org/) (테스트 모니터링 & 제어 메트릭) · [Martin Fowler — Goodhart's Law in software metrics](https://martinfowler.com/bliki/CannotMeasureProductivity.html) · [DORA — Four Key Metrics](https://dora.dev/guides/dora-metrics-four-keys/) (Deployment Frequency, Lead Time, MTTR, Change Failure Rate) · [Google SRE Book — SLIs/SLOs/SLAs](https://sre.google/sre-book/service-level-objectives/)

## 왜 메트릭이 필요한가

"측정하지 않으면 개선할 수 없다." 메트릭은 품질의 현재 상태를 숫자로 보여주고, 개선의 방향을 제시한다. 단, **메트릭 자체가 목표가 되면 안 된다** (Goodhart's Law).

## 핵심 QA 메트릭

### 1. 결함 탈출률 (Defect Escape Rate, DER)

프로덕션까지 도달한 버그의 비율. QA의 가장 중요한 성과 지표.

```
DER = 프로덕션 버그 수 / (QA에서 발견된 버그 + 프로덕션 버그) × 100

예시:
- QA에서 발견: 40개
- 프로덕션에서 발견: 5개
- DER = 5 / (40 + 5) × 100 = 11.1%
```

| DER    | 평가    |
| ------ | ----- |
| < 5%   | 우수    |
| 5-15%  | 양호    |
| 15-30% | 개선 필요 |
| > 30%  | 심각    |

### 2. 테스트 커버리지 (Test Coverage)

```
코드 커버리지 = 테스트로 실행된 코드 / 전체 코드 × 100
요구사항 커버리지 = 테스트로 검증된 요구사항 / 전체 요구사항 × 100
```

**코드 커버리지 목표**:

* 새 코드: 90%+
* 전체: 80%+
* Branch Coverage 우선

**요구사항 커버리지**가 코드 커버리지보다 비즈니스적으로 더 의미 있다.

### 3. 테스트 실패율 (Test Failure Rate)

```
실패율 = 실패한 테스트 / 전체 테스트 × 100
플레이키 비율 = 불안정 테스트 / 전체 테스트 × 100
```

| 구분          | 목표    |
| ----------- | ----- |
| CI 테스트 통과율  | > 98% |
| 플레이키 테스트 비율 | < 2%  |

### 4. MTTR (Mean Time To Repair) — 버그 수정 관점

버그 신고부터 수정 완료까지의 평균 시간. **이슈 트래커 기준**의 MTTR.

```
MTTR = Σ(수정 완료 시간 - 신고 시간) / 총 버그 수

Severity별 MTTR 목표:
- S1 (Critical): < 4시간
- S2 (Major): < 2일
- S3 (Minor): < 1주
- S4 (Trivial): < 2주
```

> 🔀 **프로덕션 장애 복구 관점의 MTTR(Mean Time to Restore)은 §6-4 참조.** 두 지표는 개념이 다르다 — 여기는 "버그 티켓 수정 시간", §6-4는 "장애 발생 → 복구 완료 시간" (DORA Four Keys 기준).

### 5. 테스트 실행 시간 (Test Execution Time)

```
단위 테스트: < 2분
통합 테스트: < 5분
E2E 테스트: < 15분
전체 파이프라인: < 20분
```

느린 테스트 스위트 = 느린 피드백 루프 = 느린 개발 속도.

### 6. DORA Four Keys (배포/운영 메트릭)

> 출처: Forsgren, Humble, Kim, *Accelerate: The Science of Lean Software and DevOps* (IT Revolution, 2018) · [dora.dev/research/](https://dora.dev/research/) — 2023 State of DevOps Report 기준

Google Cloud DORA(DevOps Research and Assessment)가 10,000+ 조직을 연구해 도출한 **소프트웨어 전달 성능의 4가지 핵심 지표**. QA의 "결함 관점"과 달리 **"배포 신뢰성 관점"**을 보여준다. QA 팀은 §1~5(내부 품질)와 §6(외부 전달 성능)을 함께 모니터링해야 한다.

#### 6-1. Deployment Frequency (배포 빈도)

```
Deployment Frequency = 단위 기간 내 프로덕션 배포 횟수
```

| 수준 | 빈도 |
|---|---|
| Elite | 하루 여러 번 (on-demand) |
| High | 주 1회 ~ 월 1회 |
| Medium | 월 1회 ~ 6개월 1회 |
| Low | 6개월 1회 미만 |

**QA 관점**: 배포 빈도가 낮으면 한 번에 많은 변경이 몰려 **QA 부담이 급증**한다. 역설적으로 **자주 배포할수록 결함이 줄어든다** — 변경 범위가 작아 원인 추적이 쉽다.

#### 6-2. Lead Time for Changes (변경 리드타임)

```
Lead Time = 커밋 → 프로덕션 도달까지 걸린 시간
```

| 수준 | 리드타임 |
|---|---|
| Elite | < 1시간 |
| High | 1일 ~ 1주 |
| Medium | 1주 ~ 1개월 |
| Low | 1개월 ~ 6개월 |

**QA 관점**: 리드타임이 길면 **테스트 병목**이 원인일 가능성이 높다. §5의 CI 파이프라인 시간과 함께 보면 원인이 명확해진다.

#### 6-3. Change Failure Rate (CFR, 변경 실패율)

```
CFR = (장애/롤백/핫픽스로 이어진 배포 수 / 전체 배포 수) × 100
```

| 수준 | CFR |
|---|---|
| Elite / High | 0~15% |
| Medium | 16~30% |
| Low | 31~45%+ |

**계산 예시**:
- 이번 스프린트 배포: 20회
- 롤백/핫픽스로 이어진 배포: 3회
- CFR = 3 / 20 × 100 = **15%** → Elite/High 경계

**QA 관점**: CFR은 DER(§1)의 **배포 단위 버전**이다. DER은 개별 결함 비율, CFR은 배포 단위 실패율. 함께 보면 "결함 밀도"와 "배포 안정성"을 모두 파악할 수 있다.

#### 6-4. Mean Time to Restore (MTTR, 복구 시간) — 장애 관점

§4의 "버그 수정 MTTR"과 구별되는 **장애 복구 MTTR**. 프로덕션 장애 발생 → 서비스 정상화까지의 시간.

| 수준 | MTTR |
|---|---|
| Elite | < 1시간 |
| High | < 1일 |
| Medium | 1일 ~ 1주 |
| Low | 1주 ~ 1개월 |

**세분화 — 장애 대응 시간 분해**:

```
총 다운타임 = MTTD + MTTA + MTTR(resolve)
```

| 지표 | 풀네임 | 의미 | 개선 방법 |
|---|---|---|---|
| **MTTD** | Mean Time to **Detect** | 장애 발생 → 감지까지 | 모니터링/알람 품질 (Sentry, Datadog) |
| **MTTA** | Mean Time to **Acknowledge** | 감지 → 담당자 인지까지 | on-call 체계 (PagerDuty, Opsgenie) |
| **MTTR** | Mean Time to **Restore** | 인지 → 복구 완료까지 | 롤백 자동화, runbook, 카나리 배포 |

**세 지표를 모두 측정해야 병목이 드러난다.** MTTR만 보면 "알람이 안 와서 6시간 뒤 발견한" 경우도 복구 시간이 짧게 기록된다.

## 보조 메트릭

### 버그 밀도 (Bug Density)

```
버그 밀도 = 발견된 버그 수 / 코드 라인 수 (KLOC)

좋음: < 2/KLOC
보통: 2-5/KLOC
나쁨: > 5/KLOC
```

### 버그 재오픈율 (Reopen Rate)

```
재오픈율 = 재오픈된 버그 / 수정된 버그 × 100

목표: < 10%
높으면: 수정 품질 문제 또는 불명확한 버그 리포트
```

### 자동화율 (Automation Rate)

```
자동화율 = 자동화된 테스트 케이스 / 전체 테스트 케이스 × 100

목표: > 70% (회귀 테스트 기준)
```

### 결함 제거 효율 (Defect Removal Efficiency, DRE)

```
DRE = 릴리스 전 발견 결함 / 전체 결함 × 100

목표: > 95% (Capers Jones, *Software Engineering Best Practices*, 2010 — 엘리트 팀 기준)
```

### SLI / SLO / SLA

> 출처: Google SRE Book — [*Service Level Objectives*](https://sre.google/sre-book/service-level-objectives/) (Betsy Beyer et al., O'Reilly, 2016)

QA 메트릭이 **"팀 내부 품질"**을 측정한다면, SLO는 **"사용자에게 한 약속"**이다. 둘은 보완 관계 — QA는 SLI 정의에 참여해야 한다.

**정의**:

| 용어 | 풀네임 | 의미 |
|---|---|---|
| **SLI** | Service Level **Indicator** | 측정 가능한 서비스 품질 지표 (가용성, p99 레이턴시, 에러율 등) |
| **SLO** | Service Level **Objective** | 내부 목표치 (예: "99.9% 가용성", "p99 < 500ms") |
| **SLA** | Service Level **Agreement** | 외부 계약 (SLO보다 느슨. 위반 시 환불/페널티) |

**관계**: `SLI로 측정 → SLO로 목표 설정 → SLA는 SLO보다 여유 있게 외부 약속`

**SLO 예시 — 웹 서비스**:

| SLI | SLO | 측정 방법 |
|---|---|---|
| 가용성 (Availability) | 99.9% (월 43분 다운 허용) | Uptime monitoring (Pingdom, Better Stack) |
| 레이턴시 (Latency) | p99 < 500ms | APM (Datadog, New Relic, Vercel Analytics) |
| 에러율 (Error Rate) | < 0.1% | 5xx 응답 수 / 전체 요청 수 |
| 처리량 (Throughput) | > 1000 req/s | Load balancer logs |

**Error Budget** — SLO가 QA 게이트가 되는 이유:

```
Error Budget = 100% - SLO

예: SLO 99.9% → Error Budget 0.1%
             → 월 43분 다운타임 허용
             → 또는 1,000 요청당 1개 에러 허용
```

**Error Budget 운영 룰**:
- **Budget 여유 있음** → 과감한 실험/릴리스 허용
- **Budget 절반 소진** → 릴리스 속도 감속, 회귀 테스트 강화
- **Budget 소진 임박** → 새 기능 릴리스 중단, 안정성 개선에만 집중
- **Budget 초과** → 롤백 + 포스트모템 + 근본 원인 제거

**QA 관점**: "에러 버짓을 QA 게이트로 사용하면 무분별한 릴리스를 차단할 수 있다." 단순히 테스트 통과 여부만 보는 게 아니라, **"지난 30일간 에러 버짓이 얼마나 남았는가"**를 배포 승인 기준에 넣는다.

## 품질 대시보드

### 대시보드에 포함할 항목

```
┌─────────────────────────────────────────────┐
│ 🏠 Quality Dashboard — Sprint 23           │
├──────────┬──────────┬──────────┬────────────┤
│ DER      │ Coverage │ Pass Rate│ MTTR       │
│ 8.3% ✅  │ 83% ✅   │ 97.5% ⚠️ │ 1.2d ✅    │
├──────────┴──────────┴──────────┴────────────┤
│                                             │
│ 📊 Bugs by Severity                        │
│ S1: 0  S2: 2  S3: 8  S4: 5                │
│                                             │
│ 📈 Trend (last 5 sprints)                  │
│ DER:     12% → 10% → 9% → 8.5% → 8.3%    │
│ Coverage: 75% → 78% → 80% → 82% → 83%    │
│                                             │
│ 🐛 Open Bugs: 15 (S1:0, S2:2, S3:8, S4:5) │
│ 🔄 Flaky Tests: 3 (1.2%)                  │
│ ⏱️ CI Pipeline: 18m 32s                    │
│                                             │
│ 🚨 Action Items                            │
│ - Flaky: checkout.spec.ts (3rd week)       │
│ - S2 #1234: 결제 timeout (assigned: Alice) │
└─────────────────────────────────────────────┘
```

### 자동 수집

```typescript
// 메트릭 자동 수집 스크립트
interface QualityMetrics {
  sprint: string;
  date: string;
  der: number;
  codeCoverage: number;
  testPassRate: number;
  mttr: {
    s1: number; // hours
    s2: number; // hours
    s3: number; // hours
  };
  openBugs: { s1: number; s2: number; s3: number; s4: number };
  flakyTests: number;
  totalTests: number;
  ciPipelineTime: number; // seconds
  automationRate: number;
}

async function collectMetrics(): Promise<QualityMetrics> {
  const coverage = await getCoverageFromCI();
  const testResults = await getTestResultsFromCI();
  const bugs = await getBugsFromLinear();
  const ciTimes = await getCIPipelineTimes();

  return {
    sprint: getCurrentSprint(),
    date: new Date().toISOString(),
    der: calculateDER(bugs),
    codeCoverage: coverage.branches,
    testPassRate: testResults.passed / testResults.total * 100,
    mttr: calculateMTTR(bugs),
    openBugs: countBugsBySeverity(bugs),
    flakyTests: testResults.flaky,
    totalTests: testResults.total,
    ciPipelineTime: ciTimes.average,
    automationRate: testResults.automated / testResults.total * 100,
  };
}
```

## 메트릭 활용 가이드

### 트렌드가 숫자보다 중요하다

* DER이 8%인 것보다 "5개 스프린트 연속 감소 중"이 더 의미 있음
* 커버리지가 80%인 것보다 "매 스프린트 2-3% 증가 중"이 더 좋음

### 메트릭으로 대화하기

```markdown
"이번 스프린트 DER이 15%에서 8%로 개선되었습니다.
주요 원인:
1. 결제 모듈에 Integration Test 추가 (이전 프로덕션 버그 3건 영역)
2. PR 리뷰 체크리스트 도입 후 코드 리뷰에서 잡히는 이슈 40% 증가

다음 스프린트 목표:
- E2E 테스트를 인증 플로우에 추가하여 DER 5% 이하 달성
- 플레이키 테스트 3건 수정 (CI 안정성 향상)"
```

### 메트릭 안티패턴

| 안티패턴         | 문제                 | 대안                 |
| ------------ | ------------------ | ------------------ |
| 커버리지 100% 강제 | 의미 없는 테스트 양산       | 80% 기준 + branch 중심 |
| 버그 수로 QA 평가  | 많이 찾을수록 좋다? 예방이 중요 | DER로 평가            |
| 메트릭 조작       | 테스트 건너뛰기, 분류 조작    | 자동 수집, 투명성         |
| 개인 메트릭       | 누가 버그를 많이 만드는가     | 팀 메트릭, 시스템 개선      |

## 스프린트 QA 리포트 템플릿

```markdown
# Sprint XX QA Report

## 요약
- 테스트 케이스: N개 실행, N개 통과 (X%)
- 발견 버그: N개 (S1: N, S2: N, S3: N, S4: N)
- 수정된 버그: N개
- DER: X%

## 핵심 지표
| 메트릭 | 이번 | 지난 | 변화 |
|--------|------|------|------|
| DER | X% | X% | ↓ |
| Coverage | X% | X% | ↑ |
| Pass Rate | X% | X% | → |
| MTTR (S1) | Xh | Xh | ↓ |

## 주요 이슈
1. [S2] 이슈 설명 — 상태, 담당자

## 개선 제안
1. 제안 내용

## 다음 스프린트 QA 계획
1. 계획 내용
```

## 메트릭 체크리스트

* [ ] 핵심 메트릭 4가지(DER, Coverage, Pass Rate, MTTR)를 추적하는가
* [ ] 메트릭이 자동으로 수집되는가
* [ ] 대시보드가 팀에 공유되는가
* [ ] 스프린트마다 QA 리포트가 작성되는가
* [ ] 트렌드(추세)를 분석하고 있는가
* [ ] 메트릭을 기반으로 개선 액션이 도출되는가
* [ ] 개인이 아닌 팀/시스템 수준의 메트릭인가