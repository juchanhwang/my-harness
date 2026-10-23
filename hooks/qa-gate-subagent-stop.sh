#!/usr/bin/env bash
# SubagentStop 훅 — fe-dev/be-dev 가 마지막 메시지 첫 줄에 QA 라인 없이 끝나면 한 번 차단한다.
#   첫 줄 형식: "QA: <PASS|PASS WITH MINOR|FAIL|BLOCKED> <report-path>" 또는 "QA: N/A — <이유>"
# fail-open: 입력이 깨졌거나 필드가 없거나 jq 가 실패하면 항상 통과한다(exit 0, stdout 없음).
#   훅 오류가 사용자 세션을 가두면 안 된다. stop_hook_active 이면 다시 막지 않는다.
# env: QA_GATE_LOG_DIR(기본 $HOME/.claude/logs/qa-gate), QA_GATE_DEBUG=1 이면 payload 전체를 저장한다.
set -u

LOG_DIR=${QA_GATE_LOG_DIR:-$HOME/.claude/logs/qa-gate}
mkdir -p "$LOG_DIR" 2> /dev/null || true

input=$(cat 2> /dev/null || true)

if [ "${QA_GATE_DEBUG:-}" = "1" ]; then
  printf '%s' "$input" > "$LOG_DIR/payload-$(date +%Y%m%dT%H%M%S)-$$.json" 2> /dev/null || true
fi

# log <event> <agent_type> <agent_id> <decision> — 로그 실패는 무시한다.
log() {
  jq -cn --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg event "$1" --arg agent_type "$2" --arg agent_id "$3" --arg decision "$4" \
    '{ts: $ts, event: $event, agent_type: $agent_type, agent_id: $agent_id, decision: $decision}' \
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

if [ "$(field '.last_assistant_message | type')" != "string" ]; then
  log "$event" "$agent_type" "$agent_id" pass
  exit 0
fi

# 첫 번째 비어 있지 않은 줄(CR·후행 공백 제거)
first=$(field '.last_assistant_message' | awk 'NF { sub(/\r$/, ""); sub(/[[:space:]]+$/, ""); print; exit }')

verdict_re='^QA: (PASS WITH MINOR|PASS|FAIL|BLOCKED) [^ ]+$'
na_re='^QA: N/A (—|-) .+$'
if [[ $first =~ $verdict_re ]] || [[ $first =~ $na_re ]]; then
  log "$event" "$agent_type" "$agent_id" pass
  exit 0
fi

reason="QA 라인 누락: 코드를 변경했다면 /qa-check review(FE는 UI 변경 시 style도)를 실행하고 마지막 메시지 첫 줄을 'QA: <verdict> <report-path>'로 시작하라. 코드 변경이 없으면 'QA: N/A — <이유>'로 시작하라. 같은 줄을 <report-dir>/status-<name>.txt에도 기록하라."
jq -cn --arg reason "$reason" '{decision: "block", reason: $reason}'
log "$event" "$agent_type" "$agent_id" block
exit 0
