---
name: data-analyst
description: >
  데이터 분석 도메인 knowledge. SQL(PostgreSQL, BigQuery), Python(pandas, numpy, scipy),
  지표 정의(AARRR, North Star Metric), 퍼널/코호트/리텐션 분석, A/B 테스트 설계/분석,
  대시보드 구축(Metabase, Redash), ETL(dbt, Airflow), 데이터 모델링, 시각화,
  데이터 품질 관리, 쿼리 최적화, 회귀/시계열/인과추론 분석 시 활성화.
  .sql/.py/.ipynb 파일 작성/수정/리뷰 시, 데이터 분석 판단이 필요할 때 사용한다.
  사용자가 SQL 쿼리, 지표 정의, 퍼널/코호트 분석, A/B 테스트 결과 해석,
  대시보드 설계, ETL 파이프라인, dbt 모델을 언급하면 반드시 이 스킬을 활성화하라.
  명시적으로 '데이터 분석'이라고 말하지 않더라도 "이 숫자가 맞나?",
  "왜 지표가 떨어졌지?" 같은 데이터 기반 판단이 필요하면 활성화한다.
---

# Data Analyst Domain Knowledge

매핑 테이블의 참조 파일에는 검증된 분석 방법론, 쿼리 패턴, 시각화 기준이 담겨 있다.
이를 읽지 않으면 재현 불가능하거나 오류 있는 분석을 하게 되고, 잘못된 의사결정을 유도한다.
분석하거나 쿼리를 작성하기 전에 아래 매핑 테이블에서 태스크에 해당하는 파일을 반드시 Read하라.

**기본 경로**: `~/.claude/skills/data-analyst/` — 아래 테이블의 파일명 앞에 이 경로를 붙여서 Read한다.

## 핵심 원칙

- 철학: "데이터는 거울이다. 현실을 비추되, 해석은 사람이 한다"
- Data Analytics 4대 원칙: 목적 지향, 정확성, 해석 가능성, 재현 가능성
- 기술 스택: SQL (PostgreSQL, BigQuery), Python (pandas, numpy, scipy), dbt, Airflow, Metabase
- 지표: AARRR, North Star Metric, 퍼널/코호트/리텐션 분석
- 안티패턴: 목적 없는 분석, 재현 불가능한 쿼리, 맥락 없는 숫자, 잘못된 데이터 기반 결론

## 태스크-지식 매핑

| 태스크 | 판단 기준 | Read할 파일 |
|--------|---|---|
| 지표 정의/추적 | KPI·NSM·AARRR 지표 설계 | `product-metrics.md` + `funnel-analysis.md` |
| 데이터 모델링 | 테이블 설계·스타/스노우플레이크 스키마 | `data-modeling.md` + `data-warehousing.md` |
| A/B 테스트 분석 | 실험 결과 해석·통계적 유의성 | `ab-testing-stats.md` + `hypothesis-testing.md` |
| 퍼널 분석 | 전환율·이탈 지점·단계별 분석 | `funnel-analysis.md` + `cohort-analysis.md` |
| 대시보드 구축 | 차트·필터·데이터 시각화 설계 | `dashboard-design.md` + `data-visualization.md` |
| ETL 파이프라인 | 데이터 추출·변환·적재 자동화 | `etl-pipelines.md` + `data-validation.md` |
| 데이터 품질 관리 | 무결성·이상치·검증 규칙 | `data-validation.md` + `data-quality.md` |
| SQL 쿼리 최적화 | 실행 계획·인덱스·느린 쿼리 개선 | `query-optimization.md` + `advanced-sql.md` + `window-functions.md` |
| 코호트/리텐션 분석 | 사용자 그룹별 잔존율·생애가치 | `cohort-analysis.md` + `funnel-analysis.md` |
| 사용자 세그멘테이션 | 행동 기반 사용자 그룹 분류 | `cohort-analysis.md` + `product-metrics.md` |
| 예측 모델링 | 회귀·분류·예측 모델 구축 | `machine-learning-basics.md` + `regression.md` |
| 리포트/스토리텔링 | 분석 결과 전달·인사이트 요약 | `storytelling-with-data.md` + `data-visualization.md` |
| 데이터 전처리/클리닝 | 결측치·이상치·포맷 정리 | `data-cleaning.md` + `pandas-numpy.md` |
| 통계 분석 (기술통계) | 분포·중심값·분산·상관 분석 | `descriptive-stats.md` + `hypothesis-testing.md` |
| dbt 모델링/변환 | dbt 모델·테스트·문서화 | `dbt-patterns.md` + `data-modeling.md` |
| 시계열 분석 | 트렌드·계절성·이상 탐지 | `time-series.md` + `regression.md` |
| 인과 추론 | 원인-결과·DID·PSM·IV | `causal-inference.md` + `ab-testing-stats.md` |
| 고급 SQL (윈도우 함수) | ROW_NUMBER·PARTITION·누적 계산 | `window-functions.md` + `advanced-sql.md` |

**복합 태스크**: 여러 유형에 해당하면 관련 행의 파일을 합집합으로 읽는다.
- A/B 테스트 설계+분석+리포트 → ab-testing-stats.md + hypothesis-testing.md + storytelling-with-data.md + data-visualization.md
- 신규 지표 파이프라인 → product-metrics.md + data-modeling.md + etl-pipelines.md + dashboard-design.md
