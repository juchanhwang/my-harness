# Git Workflow

> 핵심 메시지: **"커밋은 코드 히스토리가 아니라 의사결정 히스토리다."**

***

## 1. 브랜치 전략 — Trunk-Based Development

> 참조: [trunkbaseddevelopment.com](https://trunkbaseddevelopment.com/)

**원칙**: `main`은 항상 배포 가능한 상태를 유지한다. 장수 브랜치(`dev`, `develop`, `release`)는 만들지 않는다.

```
main (프로덕션 + 개발)
 ├── feat/user-profile       # 1-2일 이내 머지
 ├── fix/header-layout       # 1-2일 이내 머지
 └── hotfix/critical-bug     # 긴급 수정
```

**규칙**:

* **단수 브랜치** — `dev`·`develop`·`release` 같은 장수 스테이징 브랜치는 만들지 않는다. 스테이징 환경은 필요하면 preview 배포로 대체한다
* **1-2일 머지** — 피처 브랜치의 수명은 길어야 2일. 길어지면 분할을 고려한다
* **PR 300-400줄** — 리뷰어가 집중할 수 있는 범위 ([code-review.md](code-review.md) 참조)
* **Feature Flag** — 미완성 기능은 flag 뒤에 숨긴 채 머지한다. 브랜치에 숨기지 않는다
* **수직 슬라이싱** — 큰 기능은 4단계로 쪼갠다 — (1) 데이터 레이어 (2) UI 컴포넌트 (3) 페이지 통합 (4) 테스트·접근성

### 브랜치 네이밍

```
feat/기능명       # 새 기능
fix/버그명        # 버그 수정
refactor/대상     # 리팩토링
perf/대상         # 성능 개선
chore/작업명      # 의존성, 설정 등
docs/문서명       # 문서만 수정
hotfix/대상       # 긴급 프로덕션 수정
```

***

## 2. 커밋 메시지 (Conventional Commits)

```
<타입>: <제목> (50자 이내)

<본문> (선택, 72자 줄바꿈)

<푸터> (선택, 이슈 번호 등)
```

### 예시

```
feat: 사용자 프로필 페이지 추가

- 프로필 정보 조회 API 연동
- 프로필 수정 폼 구현
- 아바타 업로드 기능

Closes #123
```

### 타입

| 타입       | 의미    | 예시                    |
| -------- | ----- | --------------------- |
| feat     | 새 기능  | feat: 결제 플로우 추가       |
| fix      | 버그 수정 | fix: 헤더 레이아웃 깨짐 수정    |
| refactor | 리팩토링  | refactor: 폼 컴포넌트 분리   |
| perf     | 성능 개선 | perf: 이미지 레이지 로딩      |
| test     | 테스트   | test: 사용자 훅 테스트 추가    |
| chore    | 기타    | chore: ESLint 규칙 업데이트 |

***

## 3. PR 작성

```markdown
## 변경 사항
- 사용자 프로필 페이지 추가
- 프로필 수정 API 연동

## 스크린샷 (UI 변경 시 필수)
![프로필 페이지](./screenshot.png)

## 테스트
- [ ] 로컬에서 빌드 확인
- [ ] 타입 체크 통과
- [ ] 기존 테스트 통과

## 관련 이슈
Closes #123
```

***

## 4. 코드 리뷰

> 전체 체크리스트·코멘트 컨벤션·리뷰 흐름은 [code-review.md](code-review.md) 참조.

**빠른 요약**:

* **작성자**: self-review → CI 통과 → PR 생성 → 리뷰어 지정
* **리뷰어**: 24시간 이내 1차 리뷰
* **코멘트 prefix**: `[blocker]` · `[suggestion]` · `[question]` · `[nit]` · `[praise]`
* **PR 크기**: 300-400줄 이내 (초과 시 분할)

***

## 5. Rebase vs Merge

| 상황          | 방법           | 이유                    |
| ----------- | ------------ | --------------------- |
| feat → main | Squash Merge | 히스토리 깔끔 (1 PR = 1 커밋) |
| main → feat | Rebase       | 선형 히스토리 유지            |
| Hotfix      | Merge Commit | 긴급 수정 추적              |

```bash
# main 최신 변경사항 가져오기
git checkout feat/my-feature
git fetch origin main
git rebase origin/main

# 충돌 해결 후
git add .
git rebase --continue
git push --force-with-lease  # force-with-lease 사용
```

***

## ❌ 안티패턴

* **"WIP" 커밋 그대로 PR**: rebase로 정리 후 올리기
* **main에 직접 push**: 반드시 PR 거치기
* **PR 1000줄+**: 리뷰 불가능. 작게 나누기
* **커밋 메시지 "fix"**: 무엇을 고쳤는지 명확히
* **force push (--force)**: `--force-with-lease` 사용 (안전)

***

> 📎 관련: [ci-cd.md](ci-cd.md) · [code-quality.md](code-quality.md)
