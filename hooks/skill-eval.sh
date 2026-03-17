#!/bin/bash
# Forced eval hook for skill activation (UserPromptSubmit)
# Based on Scott Spence's forced eval pattern (84% activation rate)
# https://scottspence.com/posts/how-to-make-claude-code-skills-activate-reliably

cat <<'PROMPT'
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MANDATORY SKILL EVALUATION — DO NOT SKIP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Step 1 — EVALUATE: For each available skill, state YES or NO with a one-line reason.

Step 2 — ACTIVATE: For every YES skill, call Skill() NOW.

Step 3 — IMPLEMENT: Only after all relevant skills are loaded, proceed with the response.

CRITICAL: The evaluation is WORTHLESS unless you actually ACTIVATE the skills.
Do NOT skip to implementation without completing Steps 1 and 2.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT
exit 0
