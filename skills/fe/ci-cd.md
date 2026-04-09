# CI/CD

> 핵심 메시지: **"CI가 통과하면 자신 있게 배포할 수 있어야 한다."**

***

## 1. CI 파이프라인 구성

```yaml
# .github/workflows/ci.yml
name: CI
on:
  push:
    branches: [main, dev]
  pull_request:
    branches: [main]

# Turborepo Remote Cache (5장 참조)
env:
  TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
  TURBO_TEAM: ${{ vars.TURBO_TEAM }}

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2  # turbo --filter=...[HEAD^1] 비교용

      - uses: pnpm/action-setup@v5
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo run lint typecheck test build
```

### 실행 순서 (빠른 것 먼저)

1. **Lint** (~10초) — 문법 에러, 스타일
2. **TypeCheck** (~30초) — 타입 에러
3. **Test** (~1분) — 단위/통합 테스트
4. **Build** (~2분) — 빌드 성공 확인

***

## 2. Pre-commit / Pre-push

```bash
# Husky + lint-staged (커밋 시 변경 파일만 린트)
npx husky add .husky/pre-commit "npx lint-staged"
```

```js
// lint-staged.config.js
module.exports = {
  '*.{ts,tsx}': ['eslint --fix', 'prettier --write'],
  '*.css': ['prettier --write'],
};
```

```json
// package.json — pre-push 훅용 스크립트
{
  "scripts": {
    "pre-push": "pnpm lint && pnpm typecheck && pnpm test"
  }
}
```

***

## 3. 배포 전략

| 전략 | 플랫폼 | 방법 |
|---|---|---|
| Preview Deploy | Vercel | PR마다 자동 프리뷰 URL 생성 |
| Staging | Vercel/Railway | dev 브랜치 → staging 환경 |
| Production | Vercel | main 머지 → 자동 배포 |

```
feat/* → PR → CI ✅ → Preview Deploy → 리뷰 → main 머지 → Production
```

***

## 4. 환경별 설정

```
.env.local          # 로컬 개발 (Git 미추적)
.env.development    # 개발 환경 기본값
.env.production     # 프로덕션 기본값
.env.test           # 테스트 환경
```

**규칙:**
- `.env.local`은 `.gitignore`에 포함
- 시크릿은 CI/CD 플랫폼의 환경 변수에 설정 (GitHub Secrets, Vercel Project Env)
- `NEXT_PUBLIC_` 접두사는 공개 가능한 값만

***

## 5. Turborepo 모노레포 CI

### 5.1 필터링 + 병렬 실행

```bash
# 변경된 패키지만 빌드 (이전 커밋 대비 영향받은 패키지 그래프)
turbo run build --filter=...[HEAD^1]

# 여러 태스크 동시 실행
turbo run lint test typecheck
```

> ⚠️ **`--remote-cache` 같은 CLI 플래그는 존재하지 않는다.** Remote Cache는 플래그가 아니라 **인증 상태**(login/link 또는 환경변수)로 활성화된다.
>
> — 출처: [Turborepo Docs · login](https://turborepo.com/docs/reference/login), [link](https://turborepo.com/docs/reference/link)

### 5.2 Remote Cache — 로컬 개발자

`turbo login`은 Remote Cache 제공자에 인증하고, `turbo link`는 현재 리포지토리를 그 캐시에 연결한다.

```bash
turbo login    # "Log in to your Remote Cache provider."
turbo link     # "Link the repository to a Remote Cache provider."

# SSO 팀의 경우
turbo login --sso-team=team-name
```

**검증** (로컬 캐시 삭제 후 빌드해 Remote Cache hit 확인):

```bash
rm -rf ./.turbo/cache
turbo run build  # "FULL TURBO" + cache HIT 표시 확인
```

출처: [Turborepo Docs · Remote Caching](https://turborepo.com/docs/core-concepts/remote-caching)

### 5.3 Remote Cache — Vercel은 자동 활성화

Vercel 플랫폼에서 빌드/배포할 때는 **별도 설정 없이** Remote Cache가 활성화된다.

> "Vercel's zero-config integration with Turborepo automatically understands your monorepo."
>
> "Your projects will be pre-configured with the correct settings to use the Vercel Remote Cache."
>
> — [Turborepo Docs · Vercel CI Vendor Guide](https://turborepo.com/docs/guides/ci-vendors/vercel)

→ Vercel에서 빌드하는 경우 `turbo login`/`turbo link` 또는 환경변수 주입이 **불필요**하다.

### 5.4 Remote Cache — 외부 CI (GitHub Actions 등)

Vercel이 아닌 CI에서 Vercel Remote Cache를 사용하려면 **두 환경변수**를 주입한다 (`turbo login`/`turbo link`는 사용하지 않는다).

| Env Var | 공식 설명 |
|---|---|
| `TURBO_TOKEN` | "The Bearer token for authentication to access Remote Cache." |
| `TURBO_TEAM` | "The account name associated with your repository. When using Vercel Remote Cache, this is your team's slug." |

→ 위 1장의 `ci.yml` 예제 상단 `env:` 블록 참조.

**선택적 추가 환경변수:**

| Env Var | 용도 |
|---|---|
| `TURBO_REMOTE_CACHE_READ_ONLY` | PR 빌드에서 캐시 오염 방지 (읽기만) |
| `TURBO_REMOTE_ONLY` | 로컬 캐시 무시, Remote Cache만 사용 |
| `TURBO_REMOTE_CACHE_SIGNATURE_KEY` | HMAC-SHA256 아티팩트 서명 |

→ PR 빌드에 `TURBO_REMOTE_CACHE_READ_ONLY=1`을 두면 main 브랜치 빌드만 쓰기 권한을 가진다.

출처: [Turborepo Docs · System Environment Variables](https://turborepo.com/docs/reference/system-environment-variables)

***

## ❌ 안티패턴

- **CI 없이 배포** — "로컬에서 됐으니 배포해도 되겠지" → 환경 차이로 실패한다.
- **테스트 건너뛰기** — `--no-verify` 습관은 CI에서 결국 실패한다.
- **빌드 시간 5분 초과** — 캐싱/병렬화 최적화 필요 (Turborepo Remote Cache 도입).
- **main에 직접 push** — 반드시 PR + CI → 리뷰 → 머지.
- **`TURBO_TOKEN`을 코드/`.env`에 커밋** — 반드시 CI 시크릿에 보관.
- **`turbo run build --remote-cache` 같은 가공 플래그 사용** — 존재하지 않는다. 인증 상태로 활성화한다.

***

> 📎 관련: [testing.md](testing.md) · [build-optimization.md](build-optimization.md) · [git-workflow.md](git-workflow.md)
