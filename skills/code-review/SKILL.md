---
name: code-review
description: Automated code review for pull requests using multiple parallel agents with confidence-based scoring to filter false positives. Triggers on "review this PR", "code review", "review PR #123", or when working with pull requests that need quality checks.
---

# Code Review

Systematic, multi-agent PR code review with confidence-based filtering. Adapted from Anthropic's Claude Code plugin for OpenCode's task() orchestration system.

## When to Use

- User asks to review a pull request
- User says "code review", "review this PR", "review PR #123"
- After completing a feature, user wants quality validation before merge

## Prerequisites

- `gh` CLI must be installed and authenticated
- PR must be open and not a draft

## Workflow

### Step 1: Eligibility Check

Before reviewing, verify the PR is eligible:

```
task(category="quick", load_skills=[], run_in_background=false,
  description="Check PR eligibility",
  prompt="Check if PR {url_or_number} is (a) closed, (b) draft, (c) automated/trivial, or (d) already reviewed by an AI. Use `gh pr view`. Return: eligible=true/false with reason.")
```

If not eligible, stop and inform the user.

### Step 2: Gather Context (Parallel)

Launch background agents to collect context simultaneously:

```
# Agent 1: Find relevant CLAUDE.md / AGENTS.md files
task(subagent_type="explore", run_in_background=true, load_skills=[],
  description="Find project guideline files",
  prompt="Find all CLAUDE.md and AGENTS.md files in the repo, especially in directories modified by PR {number}. Return file paths and key rules/conventions from each.")

# Agent 2: PR summary
task(subagent_type="explore", run_in_background=true, load_skills=[],
  description="Summarize PR changes",
  prompt="Run `gh pr view {number}` and `gh pr diff {number}`. Return: PR title, description, list of changed files, and a concise summary of what the change does.")
```

### Step 3: Parallel Code Review (5 angles)

Launch 5 review agents in parallel, each focusing on a different dimension:

```
# Agent 1: CLAUDE.md / AGENTS.md compliance
task(category="quick", load_skills=[], run_in_background=true,
  description="Review: guideline compliance",
  prompt="Review PR {number} changes against project guidelines found in {claude_md_paths}. Flag violations of explicit rules only. Return issues with file:line references and the specific guideline violated. Skip issues a linter would catch.")

# Agent 2: Shallow bug scan
task(category="quick", load_skills=[], run_in_background=true,
  description="Review: obvious bugs",
  prompt="Read the PR diff for PR {number}. Scan for obvious bugs: logic errors, null handling, race conditions, security issues. Focus on the CHANGES ONLY, not surrounding code. Flag large bugs, not nitpicks. Ignore likely false positives. Return issues with file:line.")

# Agent 3: Historical context
task(category="quick", load_skills=["git-master"], run_in_background=true,
  description="Review: git history context",
  prompt="For files modified in PR {number}, read git blame and recent history. Identify any bugs visible in the PR changes when considering historical context (e.g., reverting intentional fixes, breaking assumptions from previous commits). Return issues with file:line and historical reference.")

# Agent 4: Previous PR comments
task(category="quick", load_skills=[], run_in_background=true,
  description="Review: previous PR feedback",
  prompt="Find previous PRs that touched the same files modified in PR {number} using `gh pr list`. Check comments on those PRs for feedback that might also apply to this PR. Return applicable issues with references to the original comment.")

# Agent 5: Code comment compliance
task(category="quick", load_skills=[], run_in_background=true,
  description="Review: code comment compliance",
  prompt="Read comments (TODO, FIXME, NOTE, IMPORTANT, etc.) in files modified by PR {number}. Check if the PR changes comply with guidance in those comments. Return issues where changes violate comment instructions, with file:line.")
```

### Step 4: Confidence Scoring

For each issue found, evaluate confidence on 0-100 scale:

| Score | Meaning |
|-------|---------|
| **0** | False positive, doesn't hold up to scrutiny, or pre-existing |
| **25** | Might be real, might be false positive. If stylistic, not in guidelines |
| **50** | Real but nitpicky, not important relative to rest of PR |
| **75** | Verified real issue, will impact functionality or violates explicit guideline |
| **100** | Confirmed real, will happen frequently, evidence directly confirms |

**Filter threshold: Only report issues with confidence >= 80.**

### Step 5: Post Review

Use `gh pr comment` to post the review. Format:

```markdown
### Code review

Found N issues:

1. <description> (CLAUDE.md says "<rule>")
   <link to file:line with full SHA, e.g. https://github.com/org/repo/blob/{full_sha}/path/file.ext#L10-L15>

2. <description> (bug due to <evidence>)
   <link to file:line>

Generated with Claude Code / OpenCode
```

If no issues pass the threshold:

```markdown
### Code review

No issues found. Checked for bugs and guideline compliance.

Generated with Claude Code / OpenCode
```

## False Positive Examples (exclude these)

- Pre-existing issues (not introduced by this PR)
- Issues a linter/typechecker/compiler would catch
- Pedantic nitpicks a senior engineer wouldn't flag
- General code quality (unless explicitly required in guidelines)
- Issues silenced with lint-ignore comments
- Intentional functionality changes related to the broader change
- Real issues on lines the user did NOT modify

## Important Notes

- Do NOT run builds or typechecks (CI handles that)
- Use `gh` for all GitHub interaction
- Always use full git SHA in file links (not `$(git rev-parse HEAD)`)
- Create a todo list to track progress
- Cite and link every issue found
