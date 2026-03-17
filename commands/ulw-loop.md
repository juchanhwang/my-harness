# /ulw-loop

ULTRAWORK Loop — 작업이 완전히 완료되고 Oracle 검증을 통과할 때까지 자기 참조적으로 반복하는 개발 루프.

oh-my-opencode의 ulw-loop를 Claude Code 슬래시 커맨드로 구현한 것이다.

## Usage

```
/ulw-loop "failing 테스트 전부 수정"
/ulw-loop "JWT 인증 구현" --completion-promise="AUTH_DONE"
/ulw-loop "API 엔드포인트 리팩토링" --strategy=reset
```

## Arguments

- `"task description"` — 수행할 작업 설명 (필수)
- `--completion-promise=TEXT` — 완료 시 출력할 프로미스 텍스트 (기본값: `DONE`)
- `--strategy=reset|continue` — `reset`: 매 반복마다 처음부터, `continue`: 이전 맥락 이어서 (기본값: `continue`)

---

## How It Works

ULTRAWORK Loop는 3단계로 동작한다:

1. **WORK** — 작업을 수행한다. 탐색, 구현, 테스트를 자율적으로 진행한다.
2. **DECLARE** — 작업이 완료되었다고 판단하면 `<promise>{{COMPLETION_PROMISE}}</promise>`를 출력한다.
3. **VERIFY** — Oracle 에이전트가 결과를 검증한다. 통과하면 종료, 실패하면 1단계로 돌아간다.

일반 Ralph Loop와 달리, ULTRAWORK Loop는 **반복 횟수 제한이 없고** Oracle 검증이 필수다.

---

## Protocol

<critical>
이 프로토콜을 반드시 따른다. 어떤 단계도 건너뛰지 않는다.
</critical>

### Phase 1: 초기화

1. 사용자의 태스크 설명을 파싱한다
2. TodoWrite로 작업 항목을 생성한다
3. 현재 반복 횟수를 0으로 초기화한다

### Phase 2: 작업 루프

```
LOOP:
  1. 반복 횟수를 1 증가시킨다
  2. 현재 상태를 분석한다:
     - 이전 반복에서 무엇을 했는가?
     - 무엇이 남았는가?
     - 어떤 접근이 실패했는가?
  3. 작업을 수행한다:
     - 코드 탐색 (Grep, Glob, Read)
     - 구현 (Write, Edit)
     - 검증 (Bash — build, test, lint)
     - lsp_diagnostics로 변경 파일 확인
  4. 모든 todo 항목이 완료되었는지 확인한다
  5. 완료되지 않았으면 → LOOP로 돌아간다
  6. 완료되었으면 → Phase 3으로 진행한다
```

### Phase 3: 완료 선언

모든 작업이 완료되었다고 판단하면:

```
<promise>{{COMPLETION_PROMISE}}</promise>
```

을 출력한다.

### Phase 4: Oracle 검증

Oracle 에이전트를 호출하여 결과를 검증한다:

```
Oracle에게 전달할 내용:
- 원래 태스크 설명
- 수행한 변경 사항 요약
- 테스트/빌드 결과
- 변경된 파일 목록

Oracle의 판정:
- PASS → 루프 종료. 최종 결과를 사용자에게 보고한다.
- FAIL → Oracle이 지적한 문제를 기반으로 Phase 2로 돌아간다.
```

---

## Rules

### MUST DO

- 매 반복마다 **측정 가능한 진전**을 만든다 (같은 실수 반복 금지)
- 막히면 **다른 접근법**을 시도한다
- TodoWrite로 진행 상황을 **실시간 추적**한다
- 변경 후 반드시 **빌드/테스트/lint**를 실행한다
- Oracle 검증이 실패하면 지적 사항을 **정확히** 해결한다

### MUST NOT DO

- 완료되지 않은 상태에서 completion promise를 출력하지 않는다
- Oracle 검증을 건너뛰지 않는다
- 3회 연속 같은 접근이 실패하면 Oracle에게 조언을 구한다
- 테스트를 삭제해서 "통과"시키지 않는다
- `as any`, `@ts-ignore`로 타입 에러를 억제하지 않는다

---

## Exit Conditions

1. **Verified Completion** — Oracle이 결과를 검증하고 PASS 판정
2. **User Cancel** — 사용자가 중단 요청

## Completion Report

루프 종료 시 다음을 보고한다:

```
=== ULTRAWORK Loop Complete ===

Task: {원래 태스크 설명}
Iterations: {반복 횟수}
Strategy: {reset|continue}

Changes:
  - {변경 파일 1}: {변경 내용 요약}
  - {변경 파일 2}: {변경 내용 요약}

Verification:
  - Build: PASS/FAIL
  - Tests: PASS/FAIL ({통과}/{전체})
  - Lint: PASS/FAIL
  - Oracle: VERIFIED
```
