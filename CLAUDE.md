# Language

- Always respond in Korean (한국어).
- Code, terminal commands, file paths, and technical identifiers remain in English.
- Comments in code may be in Korean if the user writes them in Korean.

# Response Policy

- 정보가 부족하면 모른다고 답한다. 추측으로 사실처럼 답하지 않는다.
- 근거를 필요로 하는 주장에는 반드시 출처(공식 문서 URL, RFC, 소스 코드 위치 등)를 함께 제시한다.

# Agent Team Rules

## PR 분리 원칙 (필수 준수)

에이전트 팀이 PR을 만들 때 반드시 아래 두 축으로 분리한다.

- **역할 축 — FE / BE는 항상 분리한다.** 하나의 PR에 FE 코드와 BE 코드를 섞지 않는다. docs/ 산출물도 `prd.md`, `fe-plan.md`, `be-plan.md`로 분리해서 작성한다.
- **Wave 축 — FE/BE 각각을 Wave 단위로 분리한다.** 한 역할 내부에서도 Wave마다 독립 PR을 연다. 여러 Wave를 한 PR에 합치지 않는다.
- **순서**: PRD 확정 → fe-plan / be-plan 분리 작성 → Wave별로 각 역할이 독립 PR 생성.

## PR 프로세스 (필수 준수)

에이전트 팀에서 PR을 생성할 때 반드시 아래 순서를 따른다. **순서를 건너뛰거나 변경하지 않는다.**

- [ ] **1. QA pre-validation** — FE/BE 구현 완료 후, PR 생성 전에 QA가 먼저 코드를 검증한다.
- [ ] **2. 이슈 수정 → QA 재검증** — QA가 이슈를 발견하면 FE/BE가 수정하고, QA가 재검증한다. QA 통과할 때까지 반복한다.
- [ ] **3. QA 통과 후 PR 생성** — QA가 승인한 뒤에 담당 FE 또는 BE가 PR을 생성한다. **QA 통과 전에 PR을 생성하지 않는다.**
- [ ] **4. CI/CD 대기** — `run_in_background`로 대기한다. 수동 폴링하지 않는다. 완료 알림을 받으면 재개한다.
- [ ] **5. 코드 리뷰 분석 및 반영** — GitHub 리뷰와 코멘트를 한 번에 병렬로 fetch한다. 리뷰에서 언급된 파일만 읽는다 (전체 코드베이스를 다시 읽지 않는다). 변경사항을 반영하고 push한다.
- [ ] **6. 머지 승인 요청** — 팀 리드가 사용자에게 머지 승인을 요청한다.

## 구현 지시 규칙

팀 리드가 FE/BE에게 구현을 지시할 때, 사용자가 별도로 요청하지 않아도 다음을 자동으로 포함한다:

- **커밋 컨벤션**: commit-convention 스킬 준수. Wave/Task 단위로 커밋을 분리한다. 한 커밋에 여러 type(feat + refactor 등)을 혼합하지 않는다.
- **PR 프로세스**: 위의 PR 프로세스 6단계를 따른다.
- **코드 규칙**: 프로젝트 CLAUDE.md 컨벤션을 참조한다.

## Anti-Patterns (Agent Team)

- QA 검증 전에 PR을 생성한다.
- 구현 전체를 단일 커밋으로 만든다.
- PR 생성 후 PR의 리뷰를 확인하지 않고 머지한다.
- FE 코드와 BE 코드를 하나의 PR에 섞는다.
- 여러 Wave를 하나의 PR에 합친다.
