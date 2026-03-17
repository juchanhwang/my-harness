---
name: create-pr
description: GitHub PR을 프로젝트 컨벤션에 맞게 생성한다. PR 제목은 커밋 컨벤션을 따르고, 본문은 PR 템플릿 구조를 따른다. PR 생성, /pr 커맨드, 변경사항 제출 시 사용한다.
allowed-tools: Bash(git:*), Bash(gh:*), Read, Grep, Glob
---

# Create Pull Request

프로젝트 컨벤션에 맞는 GitHub PR을 생성한다.

## PR 제목 형식

Squash merge 전략을 사용하므로 PR 제목이 최종 커밋 메시지가 된다. 반드시 커밋 컨벤션을 따른다.

```
type(scope): 한글 제목
```

### Type (필수)

| Type | 설명 |
|------|------|
| `feat` | 새 기능 |
| `fix` | 버그 수정 |
| `refactor` | 기능 변경 없는 리팩토링 |
| `style` | 포맷, 린트 (코드 의미 변경 없음) |
| `design` | UI/UX 디자인 변경 |
| `docs` | 문서만 변경 |
| `test` | 테스트 추가/수정 |
| `chore` | 빌드, 설정, 의존성 |
| `perf` | 성능 개선 |
| `build` | 빌드 시스템 변경 |
| `ci` | CI 설정 변경 |
| `rename` | 파일/폴더명 변경 |
| `remove` | 파일/코드 삭제 |
| `comment` | 주석 추가/수정 |
| `revert` | 이전 커밋 되돌리기 |
| `hotfix` | 긴급 수정 |

### Scope (선택, 권장)

변경 범위에 해당하는 패키지명을 사용한다.

| Scope | 대상 |
|-------|------|
| `app` | `packages/client/missionary-app` |
| `admin` | `packages/client/missionary-admin` |
| `design-system` | `packages/client/design-system` |
| `server` | `packages/server/missionary-server` |

- 여러 패키지에 걸치면 쉼표로 구분: `fix(admin,server): ...`
- 프로젝트 전체에 해당하면 scope 생략: `chore: ...`

### Subject 규칙

- **반드시 한글**로 작성
- 70자 이내
- 명사형 종결: "구현", "수정", "추가", "삭제", "개선"
- 마침표 없음

### 예시

```
feat(app): 소셜 로그인 기능 구현
fix(admin,server): 선교 그룹 상세 SSR 401 오류 수정
refactor(admin): Compositor 패턴 적용 및 접근성 개선
chore: 환경변수 변수명 수정
docs: CLAUDE.md 계층 구조 재설계 및 worktree 규칙 추가
```

## 절차

### 1. 사전 확인

```bash
git rev-parse --abbrev-ref HEAD
```

- 현재 브랜치가 `main`이면 **PR을 생성하지 않고 경고**한다.

### 2. 변경 분석

```bash
git log origin/main..HEAD --oneline
git diff origin/main...HEAD --stat
git diff origin/main...HEAD
```

- 커밋 목록과 diff를 분석하여 type, scope, subject를 결정한다.
- 브랜치명에서 type 힌트를 참고한다 (예: `feat/login` → `feat`).

### 3. Push

```bash
git push -u origin HEAD
```

- remote에 push되지 않은 커밋이 있으면 먼저 push한다.

### 4. PR 생성

```bash
gh pr create --base main --head <현재브랜치> --title "<type>(scope): 한글 제목" --body "$(cat <<'EOF'
## 배경

<이 변경이 필요한 이유를 1-3문장으로 설명>

## 변경 사항

<주요 변경 내용을 bullet point로 정리>

- 변경 1
- 변경 2

## 테스트

<변경 사항을 어떻게 검증했는지>

-

## 스크린샷

<!-- UI 변경이 없으면 이 섹션을 삭제 -->

| Before | After |
|--------|-------|
|        |       |

## 리뷰 포인트

<!-- 없으면 이 섹션을 삭제 -->

<리뷰어가 중점적으로 봐야 할 부분>
EOF
)"
```

### 5. 완료

- PR URL을 출력한다.

## PR 본문 작성 가이드

`.github/pull_request_template.md` 구조를 따른다.

### 배경 (필수)

- **왜** 이 변경이 필요한지 설명한다.
- 기술적 배경 또는 비즈니스 맥락을 포함한다.
- 1-3문장으로 간결하게.

### 변경 사항 (필수)

- **무엇을** 변경했는지 bullet point로 나열한다.
- 카테고리가 있으면 bold로 구분: `- **인증**: 소셜 로그인 추가`

### 테스트 (필수)

- 어떻게 검증했는지 구체적으로 작성한다.
- CLI 명령어, 수동 테스트 시나리오, 또는 자동화 테스트 결과.

### 스크린샷 (선택)

- UI 변경이 있을 때만 포함한다.
- Before/After 테이블로 비교한다.
- 없으면 섹션 자체를 삭제한다.

### 리뷰 포인트 (선택)

- 리뷰어가 집중해야 할 부분을 안내한다.
- 트레이드오프, 대안 검토 결과, 논의 필요 사항 등.
- 없으면 섹션 자체를 삭제한다.

## 규칙

- PR 제목과 본문은 **한국어**로 작성한다.
- 현재 브랜치가 `main`이면 PR을 생성하지 않는다.
- base 브랜치 지정이 없으면 `main`을 기본으로 사용한다.
- 선택 섹션(스크린샷, 리뷰 포인트)은 내용이 없으면 삭제한다.
