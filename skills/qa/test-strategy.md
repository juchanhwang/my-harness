# Test Strategy

> 참조: [Martin Fowler — The Practical Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html) (Mike Cohn 피라미드 해설) · [Kent C. Dodds — The Testing Trophy and Testing Classifications](https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications) · [Martin Fowler — Test Coverage](https://martinfowler.com/bliki/TestCoverage.html) · [Google Testing Blog — Just Say No to More End-to-End Tests](https://testing.googleblog.com/2015/04/just-say-no-to-more-end-to-end-tests.html) · ISTQB Foundation Level Syllabus (Risk-Based Testing §5.2)
> 핵심 메시지: **"모든 것을 테스트할 수 없다면 리스크가 큰 것부터. 피드백 루프 속도가 커버리지보다 중요하다."**

## 테스트 모델

FE는 `~/.claude/skills/fe/testing.md` §2(Testing Trophy), BE는 `~/.claude/skills/be/testing.md` §1(테스트 피라미드)을 따른다. 두 모델은 휴리스틱이지 절대 규칙이 아니다. 모델을 정하거나 바꿀 때는 아래를 적용한다.

- 지난 6개월 안에 "단위 테스트는 통과했는데 운영에서 터진" 사고가 있었다면 통합 테스트 비중을 올린다. 모델을 고르는 가장 강한 신호다.
- CI가 이미 느리면(예: 15분) 통합 비중을 늘리기 전에 병렬화·shard·느린 테스트 프로파일링부터 한다.
- 공용 UI 라이브러리·SDK는 props 조합이 많아 통합보다 Unit이 효율적이다. Unit 중심 + Storybook(`visual-testing.md`)으로 간다.
- 기존 테스트를 일괄 삭제하고 새 모델로 재작성하지 않는다. 커버리지 공백이 회귀 사고로 이어지면 전환 자체가 실패로 낙인찍힌다.
- 새 기능부터 새 모델로 쓰고, 기존 테스트는 변경할 때 옮긴다. 중복은 3~6개월 뒤 갱신 빈도가 낮은 쪽부터 지운다.
- 매 릴리스 DER을 추적하고(`qa-metrics.md` 「핵심 QA 메트릭」 1번), 6개월 뒤 DER·CI 시간·리뷰 시간을 전환 전과 비교한다. DER 증가, CI 시간 2배 이상 증가, "테스트가 귀찮다"는 불평 증가 중 하나가 보이면 원래 모델로 되돌린다.

## 리스크 기반 우선순위

우선순위는 비즈니스 임팩트 > 변경 빈도 > 복잡도 순이다. 영향과 발생 확률(변경 빈도·복잡도 등)을 교차해 테스트 비중을 정한다.

| 영향 \ 발생 확률 | 낮음 | 중간 | 높음 |
| --- | --- | --- | --- |
| 높음 | Medium | High | Critical |
| 중간 | Low | Medium | High |
| 낮음 | Very Low | Low | Medium |

| 축 | 평가 기준 |
| --- | --- |
| 비즈니스 임팩트 | 매출 직접 영향(결제·구독), 사용자 데이터 손실·유출, 법적·규제 위반, 브랜드 이미지 훼손 |
| 발생 확률 | 변경 빈도가 높은 코드, 복잡도가 높은 로직, 외부 시스템 의존성, 새롭거나 검증되지 않은 기술 |

분류 예: 결제·인증(impact critical, likelihood medium)과 데이터 마이그레이션(high, high)은 1순위, 검색(medium, medium)은 2순위, 어드민 대시보드·마케팅 랜딩(low, low)은 3순위.

## 커버리지

- 기준값은 프로젝트 threshold가 원본이다 — FE는 `~/.claude/skills/fe/testing-vitest-setup.md`, BE는 `~/.claude/skills/be/testing.md`. QA 문서에 별도 수치를 두면 기준이 하나 더 생겨 리뷰 판정이 갈리므로 두지 않는다. FE의 코드 유형별 판단은 `~/.claude/skills/fe/testing.md` §3.4를 따른다.
- 전체 숫자보다 핵심 로직의 branch가 덮였는지를 본다. Branch Coverage가 가장 중요하다 — else·catch·early return을 테스트하지 않으면 운영에서 터진다.
- 100%를 강박적으로 추구하지 않는다. 커버리지는 목표가 아니라 가이드라인이고, 모든 라인을 실행해도 assert가 틀리면 아무것도 보장하지 않는다.
- 커버리지가 낮은 곳이 위험한 곳이다. 0%인 모듈부터 본다.
- 함정: Vitest v4는 `coverage.all`이 제거돼 테스트 중 import된 파일만 리포트한다. `coverage.include`를 명시하지 않으면 0% 파일이 리포트에서 빠져 커버리지가 실제보다 높게 나온다 ([Vitest 4 마이그레이션](https://v4.vitest.dev/guide/migration.html)).

## 테스트 전략 문서 구조

전략을 문서로 남길 때 쓰는 목차다. 8절(역할 & 책임)에는 이 하네스의 분담을 적는다 — 기능 테스트 코드는 fe-dev·be-dev가 쓰고, QA는 review·style·acceptance로 검증하고 gate로 PR 가능 여부를 정한다.

```markdown
# 테스트 전략 문서

## 1. 개요
- 프로젝트 설명
- 품질 목표
- 범위

## 2. 테스트 수준
- 단위 테스트: 도구, 목표 커버리지, 책임
- 통합 테스트: 범위, 도구, 실행 빈도
- E2E 테스트: 핵심 시나리오, 도구, 브라우저
- 탐색적 테스트: 세션 주기, 집중 영역

## 3. 자동화 전략
- 자동화 범위
- 도구 스택
- 유지보수 전략

## 4. 환경
- 로컬, CI, Staging, Production
- 데이터 관리

## 5. 리스크 기반 테스트
- 리스크 매트릭스
- 테스트 우선순위

## 6. CI/CD 통합
- 파이프라인 구조
- 게이트 기준
- 알림 설정

## 7. 메트릭 & 리포팅
- 추적 메트릭
- 대시보드
- 리포팅 주기

## 8. 역할 & 책임
- 누가 무엇을 테스트하는가
- 리뷰 프로세스
```
