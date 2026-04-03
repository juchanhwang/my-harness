#!/bin/bash
# Claude Code webhook hook for Claude Remote - Notification event

PORT="${CLAUDE_REMOTE_PORT:-8765}"
HOOK_SERVER_URL="http://localhost:${PORT}/hook"

TMUX_SESSION=""
if [ -n "$TMUX" ]; then
    TMUX_SESSION=$(tmux display-message -p '#S')
fi

PROJECT="$(basename "$PWD")"
TIMESTAMP=$(date +%s)
JSON=$(cat <<JSONEOF
{"event":"Notification","project":"$PROJECT","tmux_session":"$TMUX_SESSION","timestamp":$TIMESTAMP}
JSONEOF
)
curl -s -X POST "$HOOK_SERVER_URL"     -H "Content-Type: application/json"     -H "X-API-Key: c3mbn7q187pznlp7pe9vqzff2l90boci"     -d "$JSON"     > /dev/null 2>&1 &
exit 0