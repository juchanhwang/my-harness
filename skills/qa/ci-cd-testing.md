# CI/CD Testing

> 참조: [GitHub Docs — Troubleshooting required status checks](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/troubleshooting-required-status-checks) · [GitHub Docs — Using secrets in GitHub Actions](https://docs.github.com/en/actions/how-tos/security-for-github-actions/security-guides/using-secrets-in-github-actions) · [GitHub Docs — Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use) · [Playwright — Continuous Integration](https://playwright.dev/docs/ci) · [Playwright — Sharding](https://playwright.dev/docs/test-sharding) · [Playwright — Retries](https://playwright.dev/docs/test-retries)

CI 설정 변경을 리뷰할 때(gate `type=config`) 읽는다. 파이프라인 구성 기준(단계 순서, pnpm·Turborepo 캐시, 환경별 설정, 배포)은 `~/.claude/skills/fe/ci-cd.md`를 따르고, 서비스 컨테이너를 쓰는 통합 테스트 워크플로우 예시는 `~/.claude/skills/be/testing.md` §5에 있다. 여기에는 변경 diff에서 확인할 항목만 둔다.

## CI 변경 리뷰 체크리스트

### 필수 체크·머지 차단
- [ ] PR마다 lint + typecheck + 테스트가 자동 실행되고, 실패하면 머지가 막힌다. 기준 설정은 required status checks(lint · unit-test · integration-test · e2e-test), 승인 1건, stale review dismiss, up-to-date 브랜치 필수다.
- [ ] job 이름을 바꾸거나 matrix·샤딩을 도입하면 required check 이름과 어긋나지 않는다 — 조합마다 별도 job(별도 체크 이름)이 생기므로 집계 job 하나를 required로 둔다.
- [ ] 필터로 스킵될 수 있는 workflow를 required check로 지정하지 않는다 — `paths`·브랜치 필터나 커밋 메시지로 workflow가 스킵되면 체크가 Pending으로 남아 PR이 막힌다. 반대로 job-level `if`로 스킵된 job은 Success로 보고돼 테스트 없이 통과한다.
- [ ] 변경 감지(affected)로 테스트를 건너뛰는 경우 감지 대상에 lockfile·설정 파일·workflow 파일이 들어 있다 — `src/**`·`test/**`만 보면 의존성·설정 변경 PR이 테스트 없이 통과한다.

### 캐시·설치
- [ ] 설치가 lockfile 고정 모드다 (`npm ci`, `pnpm install --frozen-lockfile`).
- [ ] 캐시 키에 lockfile 해시(`hashFiles`)가 들어 있다. 키가 고정이면 낡은 의존성이 계속 복원되고, `github.sha`처럼 매번 바뀌는 값이 들어가면 `restore-keys` 폴백이 있어야 복원된다.
- [ ] 캐시 히트 여부로 설치 step을 건너뛴다면 조건이 참조하는 step에 `id`가 있다 — 없으면 조건이 항상 참이라 캐시가 무의미해진다.
- [ ] Playwright 브라우저 바이너리 캐시를 새로 넣는 변경이면 근거를 요구한다 — 공식 문서는 복원 시간이 다운로드와 비슷하고 Linux의 OS 의존성은 캐시되지 않아 권장하지 않는다.
- [ ] Turborepo 캐시·Remote Cache는 `~/.claude/skills/fe/ci-cd.md` §5를 따른다 (PR 빌드는 `TURBO_REMOTE_CACHE_READ_ONLY`로 캐시 오염을 막는다).

### 병렬화·샤딩
- [ ] 샤딩 시 shard별 blob report를 합치는 merge job이 있고, 일부 shard가 실패해도 돈다 (`if: ${{ !cancelled() }}`) — 기본 조건이면 실패 shard가 있을 때 merge가 건너뛰어져 정작 필요한 리포트가 없다.
- [ ] upload step의 `if`가 실패한 실행에서도 돈다 (`!cancelled()`, `always()`, `failure()`) — 기본 조건이면 앞 step이 실패할 때 스크린샷·trace·blob report 업로드가 건너뛰어진다. 보존 기간(`retention-days`)도 정한다.
- [ ] 테스트 파일 내부 병렬(`sequence.concurrent: true`)을 켜는 변경이 없다 — FE 기준은 `false`이고 RTL cleanup과 충돌한다. 파일 단위 병렬(`fileParallelism`)은 기본 활성이다 (`~/.claude/skills/fe/testing-vitest-setup.md` 「성능 최적화」 4. 병렬 실행).

### 플레이키·재시도
- [ ] `retries`·rerun 액션이 새로 생기거나 늘어나지 않는다. 재시도 후 통과한 테스트는 Playwright가 "flaky"로 분류하므로 리포트에서 집계·추적한다 — 안 하면 플레이키가 초록불 뒤에 숨는다. 격리·수정 절차는 `e2e-testing.md` 「대기와 플레이키 방지」.
- [ ] `continue-on-error`, `|| true`, 테스트 `skip`으로 실패를 삼키지 않는다.
- [ ] 통합 테스트용 서비스 컨테이너(postgres 등)에 health check 옵션이 있다 — 없으면 DB가 준비되기 전에 테스트가 시작돼 간헐 실패가 난다 (`~/.claude/skills/be/testing.md` §5).

### 실패 알림·리포트
- [ ] 실패 알림 경로(Slack·이메일)가 있고, 메시지에 repo·브랜치·작성자·커밋·실행 링크가 들어 있다.
- [ ] 테스트 리포트(JUnit XML 등)와 커버리지가 PR 코멘트나 아티팩트로 남는다.
- [ ] 커버리지 threshold가 CI에서 실제로 강제된다 (실행 명령에 `--coverage`, `coverage.include` 누락 함정은 `test-strategy.md` 「커버리지」). threshold를 낮추거나 `exclude`를 늘리는 변경, Lighthouse·성능 예산 임계값을 완화하는 변경은 근거를 요구한다 (`performance-testing.md` 「성능 예산」).

### 시크릿·보안
- [ ] 시크릿은 `secrets.*`로만 주입한다. echo·디버그 로그와 업로드 아티팩트(trace·report·`.env`)에 값이 남지 않는다. 서비스 컨테이너의 `test:test` 같은 테스트 전용 자격과 실제 시크릿을 구분한다. 환경별 설정 규칙은 `~/.claude/skills/fe/ci-cd.md` §4와 안티패턴을 따른다.
- [ ] 포크 PR에는 `GITHUB_TOKEN`을 제외한 시크릿이 전달되지 않는다. 시크릿이 필요한 job이 외부 PR에서 돌 때 어떻게 되는지 확인한다.
- [ ] `pull_request_target`에서 PR 코드를 checkout해 실행하지 않는다 — 시크릿이 있는 권한 컨텍스트에서 신뢰할 수 없는 코드가 돈다.
- [ ] CI에 의존성 audit, 갱신 자동화, SAST가 있다 (`security-testing.md` 「그 밖의 확인 항목」의 의존성 취약점).

### 실행 시간
- [ ] 단계 순서는 빠른 것 먼저다 (`~/.claude/skills/fe/ci-cd.md` §1). 시간 예산은 `qa-metrics.md` 「핵심 QA 메트릭」 5번(단위 < 2분 · 통합 < 5분 · E2E < 15분 · 전체 < 20분)를 넘지 않는다.
- [ ] 같은 브랜치의 이전 실행은 `concurrency`의 `cancel-in-progress`로 취소된다.
