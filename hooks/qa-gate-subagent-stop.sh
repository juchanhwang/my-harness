#!/usr/bin/env bash
# SubagentStop 훅 — fe-dev/be-dev 가 마지막 메시지 첫 줄에 QA 라인 없이 끝나면 한 번 차단한다.
#   첫 줄 형식: "QA: <PASS|PASS WITH MINOR|FAIL|BLOCKED> <report-path>" 또는 "QA: N/A — <이유>"
# 검사하는 메시지:
#   1. last_assistant_message 가 비어 있지 않은 문자열이면 그것(로그 source=lam)
#   2. 아니면 agent_transcript_path(JSONL) 끝 400줄에서 마지막 SubagentHandback 보고 본문(source=handback).
#      대화형 세션의 서브에이전트는 보고 도구(SubagentHandback)로 끝나 마지막 assistant 메시지에 텍스트가 없다.
#   3. 둘 다 없으면 검사하지 않고 통과한다(source=none).
# fail-open: 입력이 깨졌거나 필드가 없거나 jq 가 실패하면 항상 통과한다(exit 0, stdout 없음).
#   훅 오류가 사용자 세션을 가두면 안 된다. stop_hook_active 이면 다시 막지 않는다.
# env: QA_GATE_LOG_DIR(기본 $HOME/.claude/logs/qa-gate).
#   payload 전체 저장: QA_GATE_DEBUG=1 이거나 $LOG_DIR/.debug 파일이 있을 때(배포 후 팀원 스모크에서 payload 를 모을 때 쓴다).
set -u

LOG_DIR=${QA_GATE_LOG_DIR:-$HOME/.claude/logs/qa-gate}
mkdir -p "$LOG_DIR" 2> /dev/null || true

input=$(cat 2> /dev/null || true)

if [ "${QA_GATE_DEBUG:-}" = "1" ] || [ -e "$LOG_DIR/.debug" ]; then
  printf '%s' "$input" > "$LOG_DIR/payload-$(date +%Y%m%dT%H%M%S)-$$.json" 2> /dev/null || true
fi

# log <event> <agent_type> <agent_id> <decision> [source: lam|handback|none] — 로그 실패는 무시한다.
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
[ "$event" = "SubagentStop" ] || exit 0

agent_type=$(field '.agent_type // ""')
agent_id=$(field '.agent_id // ""')

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

# 첫 번째 비어 있지 않은 줄(CR·후행 공백 제거)
first=$(printf '%s' "$msg" | awk 'NF { sub(/\r$/, ""); sub(/[[:space:]]+$/, ""); print; exit }')

verdict_re='^QA: (PASS WITH MINOR|PASS|FAIL|BLOCKED) [^ ]+$'
na_re='^QA: N/A (—|-) .+$'
if [[ $first =~ $verdict_re ]] || [[ $first =~ $na_re ]]; then
  log "$event" "$agent_type" "$agent_id" pass "$msg_source"
  exit 0
fi

reason="QA 라인 누락: 코드를 변경했다면 /qa-check review(FE는 UI 변경 시 style도)를 실행하고 마지막 메시지 첫 줄을 'QA: <verdict> <report-path>'로 시작하라. 코드 변경이 없으면 'QA: N/A — <이유>'로 시작하라. 같은 줄을 <report-dir>/status-<name>.txt에도 기록하라."
jq -cn --arg reason "$reason" '{decision: "block", reason: $reason}'
log "$event" "$agent_type" "$agent_id" block "$msg_source"
exit 0
