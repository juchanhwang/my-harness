---
name: planning-workflow
description: 도메인 스페셜리스트 에이전트(po/fe-dev/be-dev/designer/qa/ops-lead/data-analyst)가 "플랜 모드", "plan mode", "planner", "planner mode", "플래너 모드" 트리거 키워드를 감지했을 때 실행하는 표준 계획 수립 워크플로우. 사용자 인터뷰 → pre-planner 갭 분석 → planner 플랜 생성 → 선택지 제시 → plan-reviewer 검증 루프의 5단계를 정의한다. 트리거 키워드가 포함된 요청을 받으면 구현 작업을 즉시 중단하고 반드시 이 스킬을 로드하여 절차를 따르라.
---

# Planning Workflow — 스페셜리스트 표준 계획 수립 절차

## 왜 이 워크플로우인가 (설계 근거)

현행 Claude Code에서 서브에이전트도 중첩 스폰이 가능하다(Agent 도구 상속, depth 제한).
그러나 **서브에이전트로 실행된 planner는 사용자와 직접 인터뷰할 수 없다** — 사용자 대화는
메인 스레드(또는 팀 리드/스페셜리스트 본인)만 가능하다. 따라서:

- **인터뷰와 Clearance Check(Step 0)는 호출자인 네가 직접 수행**하고,
- planner에게는 **확정된 컨텍스트를 넘겨** 인터뷰 없이 플랜 생성만 시킨다.
- pre-planner / plan-reviewer 를 네가 명시적으로 호출하는 이유는 제어와 가시성이다:
  각 단계의 산출물을 네가 검토하고 사용자에게 중간 보고할 수 있다.

또 하나의 제약: **판단형 서브에이전트(pre-planner, planner, oracle)는
너의 도메인 skill 컨텍스트를 갖고 시작하지 않는다.** 따라서 프롬프트에 도메인 원칙을
**인라인으로 주입**해야 한다. 인라인 컨텍스트 블록과 도메인별 체크 항목은 각 에이전트
정의 파일에 있다 — 이 스킬은 공통 절차만 정의한다.

**예외 — plan-reviewer**: 플랜 문서 자체를 평가하는 에이전트이므로 인라인 컨텍스트를
주입하지 않는다. plan-reviewer 의 입력 계약은 **플랜 파일 경로 문자열 하나뿐**이며,
다른 텍스트를 섞으면 입력 검증에서 거부될 수 있다 (plan-reviewer.md 계약 참조).

---

## 호출 순서 (5단계 — 순서 변경 금지)

### Step 0. 선행: 사용자 인터뷰 + Clearance Check

pre-planner 호출 전에 아래 항목을 모두 YES 로 만든다. 하나라도 NO 면 사용자에게
구체적 질문을 던진다 (열린 질문 금지 — "스코프가 뭔가요?" 대신 "X도 포함인가요, Y까지인가요?").

**공통 Clearance Check**:
- [ ] Core objective 명확?
- [ ] Scope boundaries (IN/OUT) 설정?
- [ ] Critical ambiguity 없음?
- [ ] Blocking question 없음?

**+ 도메인 Clearance Check**: 자신의 에이전트 정의 파일 "플랜 모드 워크플로우" 섹션에
정의된 도메인 항목을 함께 검증한다.

> 탐색이 필요하면 `analyzer` / `librarian` 을 background 로 병렬 발사하여
> 기존 패턴·유사 구현·외부 레퍼런스를 수집한다 (수집 대상은 도메인별로 에이전트
> 정의 파일에 명시). Planner Phase 1 의 탐색을 호출자가 대신 수행하는 것이다.

### Step 1. pre-planner 호출 — Intent 명시 필수

```
Agent(subagent_type="pre-planner", prompt="
  [인라인 컨텍스트 — 도메인 원칙 블록]
  Intent: [Refactoring / Build from Scratch / Mid-sized Task / Collaborative / Architecture / Research]
  사용자 목표: ...
  논의 내용(Clearance Check 결과): ...
  도메인 판단: ...
  → [도메인별 분석 요청 포인트 — 에이전트 정의 파일 참조]
")
```

pre-planner 출력의 `DELEGATE:` 지시가 있으면 해당 탐색을 네가 background 로 실행하고,
결과를 Step 2 프롬프트에 포함한다.

### Step 2. planner 호출 — pre-planner 결과 + draft/plan 경로 명시

플랜 경로는 네가 정해서 넘긴다. 우선순위: 사용자 지시의 명시 경로 > 프로젝트·워크스페이스
CLAUDE.md의 문서 규칙 > 기본값 `.orchestrator/plans/{slug}.md`. 아래 `{plan-path}`를 그 경로로
치환한다. 역할별 문서(fe-plan/be-plan)로 나누는 프로젝트면 역할에 맞는 파일 경로를 준다.

```
Agent(subagent_type="planner", prompt="
  [인라인 컨텍스트 — 도메인 원칙 블록]
  [Read 지시 — 태스크 유형에 해당하는 skill 파일 경로]
  Intent(확정): ...
  [pre-planner 갭 분석 결과]
  [Step 0/1 에서 수집한 탐색 결과 요약]

  인터뷰는 이미 완료됨 — 추가 질문 없이 플랜 생성만 수행하라.
  Draft: .orchestrator/drafts/{slug}.md 에 기록 후 플랜 완성 시 삭제
  Plan:  {plan-path} 에 작성
  → Phase 2 Self-review 수행, Phase 3(High Accuracy)는 Step 3 에서 결정되므로 진입 금지
")
```

### Step 3. 사용자에게 선택지 제시 (MANDATORY — 생략 금지)

plan 초안이 완성되면 반드시 아래 두 선택지를 사용자에게 제시한다. 네가 임의 판단하지 않는다.

```
플랜이 생성되었습니다: {plan-path}

다음 중 선택해주세요:
  A) Start Work — 이대로 실행
  B) High Accuracy Review — plan-reviewer 엄격 검증 후 실행
```

### Step 4. (B 선택 시) plan-reviewer 루프 — 서킷브레이커 포함

```
attempts = 0
while (verdict !== "OKAY") {
  attempts++
  Agent(subagent_type="plan-reviewer", prompt="{plan-path}")  // 파일 경로만 전달
  // REJECT 시: 지적된 Blocking Issues (최대 3개) 를 모두 수정 후 재제출

  if (attempts >= 3 && verdict !== "OKAY") {
    STOP.  // 무한 루프 금지
    // 남은 Blocking Issues 를 요약하여 사용자에게 보고하고 판단을 요청한다:
    //   1) 이슈를 직접 해소할 정보 제공  2) 이슈 수용하고 진행  3) 플랜 재작성
  }
}
// OKAY 후 draft 파일 삭제: .orchestrator/drafts/{slug}.md
```

**서킷브레이커 규칙**: 3회 연속 REJECT 는 플랜 자체가 아니라 요구사항에 구멍이 있다는
신호다. 같은 수정을 반복하지 말고 사용자에게 돌아가라.

---

## 정보 수집형 sub-agent (analyzer, search, librarian)

인라인 컨텍스트 주입 불필요. 사실 수집만 하고 결과를 반환하면 네가 도메인 knowledge
기반으로 해석한다.

## 완료 후

- 플랜 실행은 별도 단계다. 사용자가 A(Start Work)를 선택하면 플랜 기반으로 구현을
  시작하거나, 팀 구성에 따라 담당 에이전트에게 핸드오프한다.
- draft 파일이 남아 있으면 삭제한다.
