#!/usr/bin/env bash
# QA 라인 게이트 훅 — fe-dev/be-dev 서브에이전트가 보고 첫 줄에 QA 라인 없이 끝나면 한 번 막는다.
#   첫 줄 형식: "QA: <PASS|PASS WITH MINOR|FAIL|BLOCKED> <report-path>" 또는 "QA: N/A — <이유>"
# 한 스크립트가 hook_event_name 으로 두 이벤트를 처리한다(파일명은 SubagentStop 만 처리하던 때 그대로다).
#
# 1. PreToolUse (tool_name == SubagentHandback) — 주 경로. 에이전트 frontmatter 의 hooks.PreToolUse(matcher: SubagentHandback)로 등록한다.
#    서브에이전트는 보고 도구 SubagentHandback 으로 끝난다. 그래서 SubagentStop payload 에는 last_assistant_message 가 없고,
#    SubagentStop 이 실행될 때 트랜스크립트에도 핸드백 줄이 아직 없다(실측 2026-10-24, Claude Code 2.1.309).
#    도구를 호출하는 순간의 tool_input.message(보고 본문)를 검사한다.
#    - 본문의 첫 번째 비어 있지 않은 줄이 QA 라인이면 통과한다(stdout 없음, exit 0).
#    - 아니면 에이전트(agent_id)당 한 번만 거부한다: stdout 에 hookSpecificOutput(permissionDecision=deny + reason)을 쓰고
#      $LOG_DIR/state/handback-denied-<agent_id> 에 기록한다(agent_id 는 [A-Za-z0-9_-] 만 남긴다).
#      기록이 이미 있거나 기록을 만들 수 없으면 거부하지 않는다(루프 방지 fail-open).
#    - 다른 도구면 아무것도 하지 않는다.
#    형식: https://code.claude.com/docs/en/hooks (PreToolUse decision control)
# 2. SubagentStop (frontmatter Stop) — 보조 경로. 검사하는 메시지:
#    1) last_assistant_message 가 비어 있지 않은 문자열이면 그것(로그 source=lam)
#    2) 아니면 agent_transcript_path(JSONL) 끝 400줄에서 마지막 SubagentHandback 보고 본문(source=handback).
#       핸드백 줄이 아직 기록되기 전이면 찾지 못한다 — 그래서 1번 PreToolUse 가 주 경로다.
#    3) 둘 다 없으면 검사하지 않고 통과한다(source=none).
#    QA 라인이 없으면 {"decision":"block"} 으로 막는다. 같은 agent_id 가 PreToolUse 에서 이미 거부됐으면 통과한다(에이전트당 차단 최대 1회).
#
# 공통
#   agent_type 가드: agent_type 이 fe-dev·be-dev 가 아니면 검사하지 않고 통과한다(source=skip-type).
#     in-process 팀원은 메타의 agentType 에 팀원 이름이 들어가므로(실측 smoke-fe) 팀원 턴 종료가 막히지 않는다. 서브에이전트 payload 는 agent_type=fe-dev 다.
#   fail-open: 입력이 깨졌거나 필드가 없거나 jq 가 실패하면 항상 통과한다(exit 0, stdout 없음).
#     훅 오류가 사용자 세션을 가두면 안 된다. stop_hook_active 이면 SubagentStop 에서 다시 막지 않는다.
#   7일 넘은 거부 기록은 호출할 때마다 지운다.
# env: QA_GATE_LOG_DIR(기본 $HOME/.claude/logs/qa-gate).
#   payload 전체 저장: QA_GATE_DEBUG=1 이거나 $LOG_DIR/.debug 파일이 있을 때(배포 후 팀원 스모크에서 payload 를 모을 때 쓴다).
set -u

LOG_DIR=${QA_GATE_LOG_DIR:-$HOME/.claude/logs/qa-gate}
mkdir -p "$LOG_DIR" 2> /dev/null || true

input=$(cat 2> /dev/null || true)

if [ "${QA_GATE_DEBUG:-}" = "1" ] || [ -e "$LOG_DIR/.debug" ]; then
  printf '%s' "$input" > "$LOG_DIR/payload-$(date +%Y%m%dT%H%M%S)-$$.json" 2> /dev/null || true
fi

# log <event> <agent_type> <agent_id> <decision: pass|block|deny> [source: lam|handback|skip-type|none] — 로그 실패는 무시한다.
log() {
  jq -cn --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg event "$1" --arg agent_type "$2" --arg agent_id "$3" --arg decision "$4" --arg source "${5:-none}" \
    '{ts: $ts, event: $event, agent_type: $agent_type, agent_id: $agent_id, decision: $decision, source: $source}' \
    >> "$LOG_DIR/qa-gate.log" 2> /dev/null || true
}

if ! printf '%s' "$input" | jq -e 'type == "object"' > /dev/null 2>&1; then
  log parse-error "" "" pass
  exit 0
fi

field() { printf '%s' "$input" | jq -r "$1" 2> /dev/null; }

event=$(field '.hook_event_name // ""')
case "$event" in
  SubagentStop) ;;
  PreToolUse) [ "$(field '.tool_name // ""')" = "SubagentHandback" ] || exit 0 ;;
  *) exit 0 ;;
esac

agent_type=$(field '.agent_type // ""')
agent_id=$(field '.agent_id // ""')

# agent_id 는 일회용이라 오래된 거부 기록은 쓸모가 없다
find "$LOG_DIR/state" -type f -mtime +7 -delete 2> /dev/null || true

if [ "$agent_type" != "fe-dev" ] && [ "$agent_type" != "be-dev" ]; then
  log "$event" "$agent_type" "$agent_id" pass skip-type
  exit 0
fi

verdict_re='^QA: (PASS WITH MINOR|PASS|FAIL|BLOCKED) [^ ]+$'
na_re='^QA: N/A (—|-) .+$'

# has_qa_line <message> — 첫 번째 비어 있지 않은 줄(CR·후행 공백 제거)이 QA 라인이면 0
has_qa_line() {
  local first
  first=$(printf '%s' "$1" | awk 'NF { sub(/\r$/, ""); sub(/[[:space:]]+$/, ""); print; exit }')
  [[ $first =~ $verdict_re ]] || [[ $first =~ $na_re ]]
}

# 거부 기록 경로. 남는 문자가 없으면 에이전트를 구분할 키가 없으므로 기록하지 않는다(marker 가 빈 값).
safe_id=$(printf '%s' "$agent_id" | LC_ALL=C tr -cd 'A-Za-z0-9_-')
marker=""
[ -z "$safe_id" ] || marker="$LOG_DIR/state/handback-denied-$safe_id"

# 이 에이전트가 PreToolUse 에서 이미 거부됐는가
denied_before() { [ -n "$marker" ] && [ -e "$marker" ]; }

# 거부 기록을 만든다. 처음 만든 쪽만 0 이다(noclobber 로 원자적 생성). 이미 있거나 만들 수 없으면 1 — 호출자는 거부하지 않는다.
record_denial() {
  [ -n "$marker" ] || return 1
  mkdir -p "$LOG_DIR/state" 2> /dev/null || return 1
  (set -o noclobber; : > "$marker") 2> /dev/null
}

reason="QA 라인 누락: 코드를 변경했다면 /qa-check review(FE는 UI 변경 시 style도)를 실행하고 마지막 메시지 첫 줄을 'QA: <verdict> <report-path>'로 시작하라. 코드 변경이 없거나 로직 변경 없이 주석·문서·설정값·문구(·CSS 값)만 바꿨으면 'QA: N/A — <이유>'로 시작하라(후자는 gate가 review를 돌린다). 같은 줄을 <report-dir>/status-<name>.txt에도 기록하라."

if [ "$event" = "PreToolUse" ]; then
  # 보고 본문이 비어 있지 않은 문자열이 아니면 검사할 게 없다
  msg=$(field '.tool_input.message | strings')
  if [ -z "$msg" ]; then
    log "$event" "$agent_type" "$agent_id" pass none
    exit 0
  fi
  if has_qa_line "$msg"; then
    log "$event" "$agent_type" "$agent_id" pass handback
    exit 0
  fi
  # 기록을 처음 만들 수 있을 때만 거부한다. 이미 거부했거나 기록할 수 없으면 통과한다(루프 방지).
  if ! record_denial; then
    log "$event" "$agent_type" "$agent_id" pass none
    exit 0
  fi
  jq -cn --arg reason "$reason 보고 본문 첫 줄을 QA 라인으로 해서 SubagentHandback을 다시 호출하라." \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason}}'
  log "$event" "$agent_type" "$agent_id" deny handback
  exit 0
fi

# ---- SubagentStop ----
if [ "$(field '.stop_hook_active // false')" = "true" ]; then
  log "$event" "$agent_type" "$agent_id" pass
  exit 0
fi

# 검사할 메시지를 정한다: last_assistant_message(lam) → 없으면 트랜스크립트의 마지막 SubagentHandback 보고 본문
msg=""
msg_source=none
if [ "$(field '(.last_assistant_message | type == "string") and (.last_assistant_message | length > 0)')" = "true" ]; then
  msg=$(field '.last_assistant_message')
  msg_source=lam
else
  transcript=$(field '.agent_transcript_path // "" | strings')
  if [ -n "$transcript" ] && [ -f "$transcript" ] && [ -r "$transcript" ]; then
    # 줄마다 fromjson? 로 읽어 깨진 줄은 건너뛴다. assistant 의 tool_use SubagentHandback 중 마지막 보고 본문(문자열)만 쓴다.
    msg=$(tail -n 400 < "$transcript" 2> /dev/null | jq -nRr '[inputs | fromjson?
      | select(.type? == "assistant") | .message.content[]?
      | select(.type? == "tool_use" and .name? == "SubagentHandback") | .input.message? | strings] | last // empty' 2> /dev/null || true)
    [ -z "$msg" ] || msg_source=handback
  fi
fi

if [ -z "$msg" ]; then
  log "$event" "$agent_type" "$agent_id" pass none
  exit 0
fi

if has_qa_line "$msg"; then
  log "$event" "$agent_type" "$agent_id" pass "$msg_source"
  exit 0
fi

# 같은 에이전트가 PreToolUse 에서 이미 한 번 거부됐으면 다시 막지 않는다(에이전트당 차단 최대 1회)
if denied_before; then
  log "$event" "$agent_type" "$agent_id" pass none
  exit 0
fi

jq -cn --arg reason "$reason" '{decision: "block", reason: $reason}'
log "$event" "$agent_type" "$agent_id" block "$msg_source"
exit 0
