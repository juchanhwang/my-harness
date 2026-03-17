# Language

- Always respond in Korean (한국어).
- Code, terminal commands, file paths, and technical identifiers remain in English.
- Comments in code may be in Korean if the user writes them in Korean.

---

# Agent-Model Freedom Rule (MANDATORY - NEVER SKIP)

- 에이전트와 모델의 고정 조합을 강제하거나 임의로 만들어내지 않는다.
- 사용자가 설정한 경우, 어떤 에이전트든 사용 가능한 어떤 모델과도 조합할 수 있다고 간주한다.
- 사용자가 특정 에이전트+모델 조합을 요청하면 그대로 적용한다.
- 실제 런타임/설정 검증에서 거부되는 경우에만, 파일/명령 근거를 제시하고 대안을 안내한다.

---

# Dual-System Sync Rule (OPTIONAL)

> **범례** — 시스템 텍스트 치환 우회를 위해 약어를 사용한다.
> - **OC** = 이 `AGENTS.md`를 로드하는 시스템
> - **CC** = Claude Code
> - **OC 설정 디렉토리** = 이 `AGENTS.md` 파일이 위치한 디렉토리 (`ls`로 확인)
> - **OC 설정 파일** = OC 설정 디렉토리 내 `.json` 파일

## 핵심 원칙

MCP, skills, hooks, commands, 영구 지침, sub agents의 설치/설정/삭제 시:
1. **CC 쪽 작업을 먼저 수행**한다.
2. 작업 완료 후, **OC 쪽에도 동기화할지 사용자에게 확인**한다.
3. 사용자가 동의하면 OC 쪽도 반영한다. 거부하면 CC만 반영된 상태로 둔다.

## 동기화 확인 시점

어느 한 쪽(CC 또는 OC)에 변경이 발생하면:
- "OC(또는 CC) 쪽에도 동기화할까요?" 라고 묻는다.
- 사용자가 명시적으로 "양쪽 모두" 또는 "한쪽만"이라고 말한 경우, 그에 따른다.

## 시스템별 설정 경로

### MCP

| 시스템 | 글로벌 설정 파일 | 프로젝트 설정 파일 |
|---|---|---|
| OC | OC 설정 파일 (`"mcp"` 키) | 프로젝트 내 설정 파일 |
| CC | `~/.claude.json` (root `"mcpServers"` 키) | `~/.claude.json` (`"projects"."<path>"."mcpServers"` 키) |

- **글로벌 설치** → OC 글로벌 + CC `--scope user`
- **프로젝트 설치** → OC 프로젝트 + CC `--scope project`

### Skills

**글로벌:** symlink `~/.claude/skills/` → `~/.agents/skills/` 하위 디렉토리
**프로젝트:** symlink `{project}/.claude/skills/` → `{project}/.agents/skills/` 하위 디렉토리

### Commands

**글로벌:** symlink `~/.claude/commands/` → `~/.agents/commands/` 하위 파일
**프로젝트:** symlink `{project}/.claude/commands/` → `{project}/.agents/commands/` 하위 파일

### Hooks

CC 전용 기능. 동기화 대상 아님.

### Sub Agents

CC는 `.md`, OC는 JSON. 포맷이 달라 수동 관리 필요.

### Instructions

**글로벌:** `AGENTS.md`와 `CLAUDE.md`의 내용 동기화.
**프로젝트:** `CLAUDE.md`만 사용. `AGENTS.md`는 생성하지 않는다.

---
