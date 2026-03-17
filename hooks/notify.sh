#!/bin/bash

INPUT=$(cat)
EVENT=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('hook_event_name',''))" 2>/dev/null)
MESSAGE=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('message',''))" 2>/dev/null)

case "$EVENT" in
  Notification)
    osascript -e "display notification \"${MESSAGE}\" with title \"Claude Code\" sound name \"Glass\""
    ;;
  Stop)
    osascript -e 'display notification "응답 완료" with title "Claude Code" sound name "Glass"'
    ;;
esac

exit 0
