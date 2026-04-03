# Language

- Always respond in Korean (한국어).
- Code, terminal commands, file paths, and technical identifiers remain in English.
- Comments in code may be in Korean if the user writes them in Korean.

# Agent Team Rules

## PR 프로세스 (필수 준수)

에이전트 팀에서 PR을 생성할 때 반드시 아래 순서를 따른다. **순서를 건너뛰거나 변경하지 않는다.**

1. **QA pre-validation FIRST** — FE/BE 구현 완료 후, PR 생성 전에 QA가 먼저 코드를 검증한다.
2. **이슈 수정 → QA 재검증** — QA가 이슈를 발견하면 FE/BE가 수정하고, QA가 재검증한다. QA 통과할 때까지 반복한다.
3. **QA 통과 후 PR 생성** — QA가 승인한 뒤에 담당 FE 또는 BE가 PR을 생성한다. **QA 통과 전에 PR을 생성하지 않는다.**
4. **CI/CD 대기** — `run_in_background`로 대기한다. 수동 폴링하지 않는다. 완료 알림을 받으면 재개한다.
5. **코드 리뷰 분석 및 반영** — GitHub 리뷰와 코멘트를 한 번에 병렬로 fetch한다. 리뷰에서 언급된 파일만 읽는다 (전체 코드베이스를 다시 읽지 않는다). 변경사항을 반영하고 push한다.
6. **머지 승인 요청** — 팀 리드가 사용자에게 머지 승인을 요청한다.

## 구현 지시 규칙

팀 리드가 FE/BE에게 구현을 지시할 때, 사용자가 별도로 요청하지 않아도 다음을 자동으로 포함한다:

- **커밋 컨벤션**: commit-convention 스킬 준수. Wave/Task 단위로 커밋을 분리한다. 한 커밋에 여러 type(feat + refactor 등)을 혼합하지 않는다.
- **테스트 코드**: 신규 기능에 대한 테스트 코드를 반드시 작성한다.
- **PR 프로세스**: 위의 PR 프로세스 6단계를 따른다.
- **코드 규칙**: 프로젝트 CLAUDE.md 컨벤션을 참조한다.

## Anti-Patterns (Agent Team)

- QA 검증 전에 PR을 생성하지 않는다.
- 코드 리뷰 반영 시 전체 코드베이스를 다시 읽지 않는다.
- 구현 전체를 단일 커밋으로 만들지 않는다.
