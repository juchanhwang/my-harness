# CI/CD Testing

## GitHub Actions 테스트 파이프라인

### 기본 테스트 워크플로우

```yaml
# .github/workflows/test.yml
name: Test
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: test-${{ github.ref }}
  cancel-in-progress: true  # 같은 브랜치의 이전 실행 취소

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck

  unit-test:
    runs-on: ubuntu-latest
    needs: lint  # lint 통과 후 실행
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npm run test:unit -- --coverage
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: coverage-report
          path: coverage/

  integration-test:
    runs-on: ubuntu-latest
    needs: lint
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: testdb
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7
        ports:
          - 6379:6379
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npm run test:integration
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/testdb
          REDIS_URL: redis://localhost:6379

  e2e-test:
    runs-on: ubuntu-latest
    needs: [unit-test, integration-test]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

## 테스트 병렬화

### Vitest 병렬 실행

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    pool: 'forks',          // 프로세스 격리
    poolOptions: {
      forks: {
        minForks: 2,
        maxForks: 4,
      },
    },
    fileParallelism: true,   // 파일 간 병렬
    sequence: {
      concurrent: true,      // 같은 파일 내 테스트도 병렬
    },
  },
});
```

### Playwright 샤딩 (대규모 E2E)

```yaml
e2e-test:
  strategy:
    matrix:
      shard: [1/4, 2/4, 3/4, 4/4]
  steps:
    - run: npx playwright test --shard=${{ matrix.shard }}
    - uses: actions/upload-artifact@v4
      with:
        name: blob-report-${{ strategy.job-index }}
        path: blob-report

  merge-reports:
    needs: e2e-test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          pattern: blob-report-*
          merge-multiple: true
          path: all-blob-reports
      - run: npx playwright merge-reports --reporter html all-blob-reports
```

## 캐싱 전략

### npm 캐시

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 20
    cache: 'npm'  # package-lock.json 기반 캐시
```

### Playwright 브라우저 캐시

```yaml
- name: Cache Playwright browsers
  uses: actions/cache@v4
  with:
    path: ~/.cache/ms-playwright
    key: playwright-${{ hashFiles('package-lock.json') }}

- name: Install Playwright (캐시 미스 시만)
  run: npx playwright install --with-deps
  if: steps.cache.outputs.cache-hit != 'true'
```

### 빌드 캐시 (Turborepo)

```yaml
- uses: actions/cache@v4
  with:
    path: .turbo
    key: turbo-${{ runner.os }}-${{ hashFiles('**/turbo.json') }}-${{ github.sha }}
    restore-keys: |
      turbo-${{ runner.os }}-${{ hashFiles('**/turbo.json') }}-
```

## 실패 시 알림

### Slack 알림

```yaml
- name: Notify on failure
  if: failure()
  uses: slackapi/slack-github-action@v1
  with:
    payload: |
      {
        "text": "❌ 테스트 실패",
        "blocks": [
          {
            "type": "section",
            "text": {
              "type": "mrkdwn",
              "text": "*❌ 테스트 실패*\n*Repo:* ${{ github.repository }}\n*Branch:* ${{ github.ref_name }}\n*Author:* ${{ github.actor }}\n*Commit:* ${{ github.event.head_commit.message }}\n<${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}|View Run>"
            }
          }
        ]
      }
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

## PR 체크 설정

### Branch Protection Rules

```
Required status checks:
  ✅ lint
  ✅ unit-test
  ✅ integration-test
  ✅ e2e-test

Required reviews: 1
Dismiss stale reviews: true
Require up-to-date branches: true
```

### PR 코멘트로 커버리지 리포트

```yaml
- name: Coverage Report
  uses: davelosert/vitest-coverage-report-action@v2
  if: github.event_name == 'pull_request'
  with:
    json-summary-path: coverage/coverage-summary.json
```

## 파이프라인 최적화

### 실행 시간 단축 전략

| 전략                     | 효과        | 구현 난이도 |
| ---------------------- | --------- | ------ |
| 캐싱 (npm, Playwright)   | 30-50% 단축 | 낮음     |
| 병렬 실행 (matrix)         | 50-75% 단축 | 중간     |
| 변경 감지 (affected)       | 70-90% 단축 | 높음     |
| 이전 실행 취소 (concurrency) | 비용 절감     | 낮음     |
| 테스트 분류 (fast/slow)     | 빠른 피드백    | 중간     |

### 변경 감지 (Affected Tests Only)

```yaml
- name: Get changed files
  id: changed
  uses: tj-actions/changed-files@v44
  with:
    files: |
      src/**
      test/**

- name: Run affected tests
  if: steps.changed.outputs.any_changed == 'true'
  run: |
    npx vitest run --changed HEAD~1
```

## 테스트 리포트

### JUnit XML (대부분의 CI 도구와 호환)

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    reporters: ['default', 'junit'],
    outputFile: {
      junit: './test-results/junit.xml',
    },
  },
});
```

## CI/CD 테스트 체크리스트

* [ ] PR마다 lint + typecheck + 테스트가 자동 실행되는가
* [ ] 테스트 실패 시 PR 머지가 차단되는가
* [ ] 테스트 리포트/커버리지가 PR에 코멘트로 표시되는가
* [ ] 실패 시 Slack/이메일 알림이 오는가
* [ ] 캐싱으로 실행 시간이 최적화되어 있는가
* [ ] E2E 테스트가 병렬/샤딩으로 실행되는가
* [ ] 보안 스캔(npm audit, Snyk)이 포함되어 있는가
* [ ] 실패한 테스트의 아티팩트(스크린샷, trace)가 수집되는가