---
name: github
description: GitHub integration via MCP server for repository management. Create issues, manage pull requests, review code, search repositories, and interact with GitHub's full API. Triggers on "create issue", "manage PR", "search repos", or any GitHub API interaction beyond what `gh` CLI provides.
---

# GitHub MCP Integration

Official GitHub MCP server for comprehensive repository management directly from the coding environment.

## When to Use

- Creating or managing GitHub issues
- Pull request operations (create, review, merge, comment)
- Repository search and management
- Code review workflows
- Any GitHub API interaction that benefits from structured MCP tools over raw `gh` CLI

## Setup Required

This skill requires the GitHub MCP server to be configured in OpenCode.

**MCP Configuration** (in `~/.config/opencode/opencode.json`):
```json
{
  "mcp": {
    "github": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp/",
      "headers": {
        "Authorization": "Bearer ${GITHUB_PERSONAL_ACCESS_TOKEN}"
      }
    }
  }
}
```

**Environment variable required**: `GITHUB_PERSONAL_ACCESS_TOKEN`
- Generate at: https://github.com/settings/tokens
- Required scopes: `repo`, `read:org`, `read:user`

## Capabilities

When the MCP server is connected, the following operations become available as structured tool calls:

### Repository Management
- List, create, search repositories
- Get repository details, contributors, languages

### Issues
- Create, update, close issues
- Add labels, assignees, milestones
- Search issues across repositories

### Pull Requests
- Create, update, merge PRs
- Add reviewers, labels
- Get PR diff, files changed, review comments
- Create inline review comments

### Code & Content
- Get file contents, directory listings
- Search code across repositories
- Get commit history, blame information

### Actions & CI
- List workflow runs, check statuses
- Trigger workflows

## Usage Notes

- For simple operations like `gh pr view`, the `gh` CLI (already available via Bash) may be faster
- Use the MCP server when you need structured data responses or complex multi-step GitHub workflows
- The MCP server provides richer data than `gh` CLI for operations like code search and review comments
- Combine with the `code-review` skill for comprehensive PR review workflows
