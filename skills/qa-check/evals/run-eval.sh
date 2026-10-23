#!/usr/bin/env bash
# qa-check eval 실행기: sandbox 에서 claude -p 를 1회 실행하고 채점용 산출물을 run-dir 에 모은다.
#   bash run-eval.sh <sandbox> <run-dir> <prompt>
# env:
#   QA_EVAL_MODEL        메인 세션 모델(기본 haiku — 진행 기록의 Ruling. qa 포크는 qa 정의의 모델을 따른다)
#   QA_EVAL_ALLOWED      --allowedTools 값(기본: Read,Grep,Glob,Bash,Write,Edit,Skill,Agent + Playwright 플러그인 MCP)
#   QA_GATE_LOG_DIR      훅 payload 로그 디렉터리(기본 <run-dir>/hook-log)
#   QA_EVAL_HOOK_SETTINGS 훅 시험 실행에만: --settings 로 넘길 JSON(HOOK_TEST_MODE=settings)
#   QA_EVAL_MAX_BUDGET_USD 선택: --max-budget-usd 상한
# 산출: <run-dir>/outputs/{result.json,metrics.json,dirty.txt,reports/}, transcript.jsonl, subagents/*.jsonl, timing.json
set -euo pipefail

[ $# -eq 3 ] || { echo "usage: run-eval.sh <sandbox> <run-dir> <prompt>" >&2; exit 2; }
sandbox=$(cd "$1" && pwd -P)
run_dir=$2
prompt=$3

QA_EVAL_MODEL=${QA_EVAL_MODEL:-haiku}
QA_EVAL_ALLOWED=${QA_EVAL_ALLOWED:-"Read,Grep,Glob,Bash,Write,Edit,Skill,Agent,mcp__plugin_playwright_playwright__*"}

[ ! -e "$run_dir/outputs/result.json" ] || { echo "run-dir already has a result: $run_dir" >&2; exit 1; }
mkdir -p "$run_dir/outputs"
run_dir=$(cd "$run_dir" && pwd -P)
export QA_GATE_LOG_DIR=${QA_GATE_LOG_DIR:-$run_dir/hook-log}
mkdir -p "$QA_GATE_LOG_DIR"

args=(-p "$prompt" --model "$QA_EVAL_MODEL" --output-format json --permission-mode acceptEdits --allowedTools "$QA_EVAL_ALLOWED")
if [ -n "${QA_EVAL_HOOK_SETTINGS:-}" ]; then args+=(--settings "$QA_EVAL_HOOK_SETTINGS"); fi
if [ -n "${QA_EVAL_MAX_BUDGET_USD:-}" ]; then args+=(--max-budget-usd "$QA_EVAL_MAX_BUDGET_USD"); fi

# 실행 전부터 있던 리포트(시드)를 기록해 채점 때 QA 가 만든 리포트와 구분한다.
ls "$sandbox/.orchestrator/qa" 2> /dev/null | sort > "$run_dir/outputs/reports-seeded.txt" || true

# 채점에 트랜스크립트가 필요하므로 --no-session-persistence 는 쓰지 않는다.
started=$(date +%s)
rc=0
(cd "$sandbox" && CLAUDE_REMOTE_PORT=9 claude "${args[@]}" > "$run_dir/outputs/raw.json" 2> "$run_dir/stderr.txt") || rc=$?
ended=$(date +%s)

# --output-format json 은 객체 하나지만 배열로 나오는 버전도 있어 result 객체만 뽑는다.
if ! jq 'if type=="array" then (map(select(.type=="result")) | last) else . end' "$run_dir/outputs/raw.json" > "$run_dir/outputs/result.json" 2> /dev/null; then
  echo "run-eval: claude output is not JSON (exit $rc); see $run_dir/stderr.txt and outputs/raw.json" >&2
  exit 1
fi

session_id=$(jq -r '.session_id // empty' "$run_dir/outputs/result.json")
transcript=""
if [ -n "$session_id" ]; then
  transcript=$(find "$HOME/.claude/projects" -name "$session_id.jsonl" -not -path '*/subagents/*' 2> /dev/null | head -n 1)
fi
if [ -n "$transcript" ]; then
  cp "$transcript" "$run_dir/transcript.jsonl"
  sub_dir=${transcript%.jsonl}/subagents
  if [ -d "$sub_dir" ]; then
    mkdir -p "$run_dir/subagents"
    cp "$sub_dir"/* "$run_dir/subagents/" 2> /dev/null || true
  fi
fi

if [ -d "$sandbox/.orchestrator/qa" ]; then
  mkdir -p "$run_dir/outputs/reports"
  cp -R "$sandbox/.orchestrator/qa/." "$run_dir/outputs/reports/"
fi
# Playwright MCP 가 sandbox 에 남긴 스냅샷·스크린샷은 증거로만 보관한다(git status 에서는 제외).
if [ -d "$sandbox/.playwright-mcp" ]; then cp -R "$sandbox/.playwright-mcp" "$run_dir/outputs/playwright-mcp"; fi
git -C "$sandbox" status --porcelain > "$run_dir/outputs/dirty.txt" 2> /dev/null || : > "$run_dir/outputs/dirty.txt"

# cost_usd 는 결과 JSON 의 total_cost_usd(서브에이전트 포함, 추정치).
jq --argjson rc "$rc" '{
  session_id: .session_id,
  cost_usd: .total_cost_usd,
  duration_ms: .duration_ms,
  num_turns: .num_turns,
  models: ((.modelUsage // {}) | keys),
  permission_denials: { count: ((.permission_denials // []) | length), tools: ((.permission_denials // []) | map(.tool_name) | unique) },
  is_error: .is_error,
  exit_code: $rc
}' "$run_dir/outputs/result.json" > "$run_dir/outputs/metrics.json"

jq --argjson wall "$((ended - started))" '{
  duration_ms: .duration_ms,
  total_duration_seconds: $wall,
  total_tokens: (((.modelUsage // {}) | [.[] | ((.inputTokens // 0) + (.outputTokens // 0))] | add) // 0)
}' "$run_dir/outputs/result.json" > "$run_dir/timing.json"

echo "RUN_DIR=$run_dir"
echo "SESSION=${session_id:-none}"
echo "EXIT=$rc"
