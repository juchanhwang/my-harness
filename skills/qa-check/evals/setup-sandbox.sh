#!/usr/bin/env bash
# qa-check eval sandbox 생성기.
#   bash setup-sandbox.sh <dest> [--overlay] [--overlay-agents fe-dev,be-dev] [--reports role=VERDICT,...]
#                         [--report-inputs role:inputs]... [--playwright-artifact]
#   --report-inputs   시드 리포트 헤더의 inputs: 줄을 정한다(role = review|style|acceptance|gate, 여러 번 가능).
#                     예: --report-inputs review:scope=app/   기본값은 "seeded by setup-sandbox.sh"
#   --playwright-artifact  .playwright-mcp/x 를 미리 만들고 .git/info/exclude 로 가리지 않는다
#                     (Playwright MCP 산출물이 무시되지 않는 사용자 저장소를 흉내 낸다 — tree 판정에서 제외돼야 한다)
# 구현 범위는 위 옵션까지다. --overlay-into / --stale / --dirty / --waivers 는 지원하지 않는다(진행 기록의 Ruling).
#   dest 는 git 저장소 밖 신뢰된 경로(~/.qa-check-sandboxes/…)에 만든다. 이미 있으면 exit 1.
set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SKILL=$(dirname "$HERE")
REPO=$(dirname "$(dirname "$SKILL")")
FILES=$HERE/files

usage() {
  echo "usage: setup-sandbox.sh <dest> [--overlay] [--overlay-agents a,b] [--reports role=VERDICT,...] [--report-inputs role:inputs]... [--playwright-artifact]" >&2
  exit 2
}

[ $# -ge 1 ] || usage
dest=$1
shift
case "$dest" in -*) usage ;; esac

overlay=0
overlay_agents=""
reports=""
playwright_artifact=0
# bash 3.2(macOS 기본)에는 연관 배열이 없어 역할마다 변수를 둔다.
inputs_review=""
inputs_style=""
inputs_acceptance=""
inputs_gate=""
while [ $# -gt 0 ]; do
  case "$1" in
    --overlay) overlay=1; shift ;;
    --overlay-agents) [ $# -ge 2 ] || usage; overlay_agents=$2; shift 2 ;;
    --reports) [ $# -ge 2 ] || usage; reports=$2; shift 2 ;;
    --report-inputs)
      [ $# -ge 2 ] || usage
      case "$2" in
        review:*) inputs_review=${2#*:} ;;
        style:*) inputs_style=${2#*:} ;;
        acceptance:*) inputs_acceptance=${2#*:} ;;
        gate:*) inputs_gate=${2#*:} ;;
        *) echo "bad --report-inputs (expected role:inputs): $2" >&2; exit 2 ;;
      esac
      shift 2 ;;
    --playwright-artifact) playwright_artifact=1; shift ;;
    *) echo "unsupported option: $1" >&2; exit 2 ;;
  esac
done

[ ! -e "$dest" ] || { echo "dest already exists: $dest" >&2; exit 1; }
mkdir -p "$dest"
dest=$(cd "$dest" && pwd -P)

# 정답표(ground-truth.json)와 디자인 값(design-values.json)은 sandbox 에 넣지 않는다.
cp -R "$FILES/app" "$dest/app"
cp "$FILES/prd.md" "$FILES/mockup.html" "$FILES/figma-snapshot.json" "$dest/"

git -C "$dest" init -q -b main
# 오버레이·리포트·Playwright MCP 산출물(.playwright-mcp/)이 tree 를 더럽히지 않게 한다.
# --playwright-artifact 는 .playwright-mcp/ 를 일부러 가리지 않는다(tree 판정이 이 디렉터리를 제외하는지 보는 eval 용).
printf '.claude/\n.orchestrator/\n' >> "$dest/.git/info/exclude"
if [ "$playwright_artifact" = 0 ]; then printf '.playwright-mcp/\n' >> "$dest/.git/info/exclude"; fi
git -C "$dest" add -A
git -C "$dest" -c user.name=qa-eval -c user.email=qa-eval@example.invalid -c commit.gpgsign=false \
  commit -q --no-verify -m "fixture: 빠른 메모 앱"
sha=$(git -C "$dest" rev-parse HEAD)
sha7=${sha:0:7}

# 커밋 뒤에 만들어야 untracked 로 남는다.
if [ "$playwright_artifact" = 1 ]; then
  mkdir -p "$dest/.playwright-mcp"
  printf 'playwright-mcp leftover\n' > "$dest/.playwright-mcp/x"
fi

if [ "$overlay" = 1 ]; then
  mkdir -p "$dest/.claude/agents" "$dest/.claude/skills/qa-check"
  cp "$REPO/agents/qa.md" "$dest/.claude/agents/qa.md"
  cp -R "$REPO/skills/qa" "$dest/.claude/skills/qa"
  (cd "$SKILL" && tar --exclude='./evals' -cf - .) | (cd "$dest/.claude/skills/qa-check" && tar -xf -)
fi

if [ -n "$overlay_agents" ]; then
  mkdir -p "$dest/.claude/agents"
  IFS=',' read -r -a names <<< "$overlay_agents"
  for n in "${names[@]}"; do
    [ -f "$REPO/agents/$n.md" ] || { echo "no such agent: $n" >&2; exit 1; }
    cp "$REPO/agents/$n.md" "$dest/.claude/agents/$n.md"
  done
fi

if [ -n "$reports" ]; then
  mkdir -p "$dest/.orchestrator/qa"
  now=$(date +%Y-%m-%dT%H:%M:%S%z)
  IFS=',' read -r -a pairs <<< "$reports"
  for pair in "${pairs[@]}"; do
    role=${pair%%=*}
    verdict=${pair#*=}
    verdict=${verdict//_/ }
    case "$role" in review | style | acceptance | gate) ;; *) echo "bad report role: $role" >&2; exit 2 ;; esac
    case "$verdict" in PASS | "PASS WITH MINOR" | FAIL | BLOCKED) ;; *) echo "bad report verdict: $verdict" >&2; exit 2 ;; esac
    base="$dest/.orchestrator/qa/$role-$sha7"
    case "$role" in
      review) role_inputs=$inputs_review ;;
      style) role_inputs=$inputs_style ;;
      acceptance) role_inputs=$inputs_acceptance ;;
      gate) role_inputs=$inputs_gate ;;
    esac
    [ -n "$role_inputs" ] || role_inputs="seeded by setup-sandbox.sh"

    blocked_section=""
    findings_section="(없음)"
    decision="Critical+Major = 0 → $verdict"
    case "$verdict" in
      BLOCKED)
        blocked_section=$'## Blocked by\n- 필요한 것: Figma 노드 URL\n'
        decision="필수 입력 누락 → BLOCKED"
        jq -n --arg r "$role" '{role:$r, blocked:["Figma 노드 URL"], findings:[], notChecked:[]}' > "$base.findings.json"
        ;;
      FAIL)
        findings_section=$'### [M-1] Major — 시드 finding\n- where: app/app.js:1\n- expected: 시드\n- actual: 시드'
        decision="Critical+Major = 1 → FAIL"
        jq -n --arg r "$role" '{role:$r, blocked:[], findings:[{id:"M-1", severity:"Major", status:"open", title:"시드 finding", where:"app/app.js:1"}], notChecked:[]}' > "$base.findings.json"
        ;;
      "PASS WITH MINOR")
        findings_section=$'### [m-1] Minor — 시드 finding\n- where: app/app.js:1\n- expected: 시드\n- actual: 시드'
        decision="Critical+Major = 0, Minor = 1 → PASS WITH MINOR"
        jq -n --arg r "$role" '{role:$r, blocked:[], findings:[{id:"m-1", severity:"Minor", status:"open", title:"시드 finding", where:"app/app.js:1"}], notChecked:[]}' > "$base.findings.json"
        ;;
      *)
        jq -n --arg r "$role" '{role:$r, blocked:[], findings:[], notChecked:[]}' > "$base.findings.json"
        ;;
    esac

    cat > "$base.md" <<REPORT
# QA Report — $role — $now
verdict: $verdict
commit: $sha
tree: clean
mode: pre-check
inputs: $role_inputs

${blocked_section}
## Findings
$findings_section

## Checked / Not checked
- checked: 시드 리포트(eval 용)

## Decision rule applied
$decision
REPORT
  done
fi

echo "SANDBOX=$dest"
echo "HEAD=$sha"
