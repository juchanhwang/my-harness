# /init-deep

Generate hierarchical CLAUDE.md files. Root + complexity-scored subdirectories.

## Usage

```
/init-deep                      # Update mode: modify existing + create new where warranted
/init-deep --create-new         # Read existing → remove all → regenerate from scratch
/init-deep --max-depth=2        # Limit directory depth (default: 3)
```

---

## Workflow (High-Level)

1. **Discovery + Analysis** (concurrent) — Fire background explore agents + bash structure analysis + read existing CLAUDE.md
2. **Score & Decide** — Determine CLAUDE.md locations from merged findings
3. **Generate** — Root first, then subdirs in parallel
4. **Review** — Deduplicate, trim, validate

<critical>
**TaskCreate ALL phases. Mark in_progress → completed in real-time.**

```
TaskCreate({ subject: "Phase 1: Discovery + Analysis", description: "Fire explore agents + bash structure + read existing CLAUDE.md", activeForm: "Analyzing project structure" })
TaskCreate({ subject: "Phase 2: Score & Decide locations", description: "Score directories, determine CLAUDE.md locations", activeForm: "Scoring directories" })
TaskCreate({ subject: "Phase 3: Generate CLAUDE.md files", description: "Generate CLAUDE.md files (root + subdirs)", activeForm: "Generating CLAUDE.md files" })
TaskCreate({ subject: "Phase 4: Review & Deduplicate", description: "Deduplicate, validate, trim", activeForm: "Reviewing and deduplicating" })
```
</critical>

---

## Phase 1: Discovery + Analysis (Concurrent)

**Mark Phase 1 as in_progress.**

### Fire Background Explore Agents IMMEDIATELY

Use the `Task` tool with `subagent_type="Explore"` and `run_in_background=true`. Don't wait — these run async while main session works.

```
Task(subagent_type="Explore", run_in_background=true, prompt="Project structure: PREDICT standard patterns for detected language → REPORT deviations only")
Task(subagent_type="Explore", run_in_background=true, prompt="Entry points: FIND main files → REPORT non-standard organization")
Task(subagent_type="Explore", run_in_background=true, prompt="Conventions: FIND config files (.eslintrc, pyproject.toml, .editorconfig, tsconfig.json, biome.json) → REPORT project-specific rules")
Task(subagent_type="Explore", run_in_background=true, prompt="Anti-patterns: FIND 'DO NOT', 'NEVER', 'ALWAYS', 'DEPRECATED' comments → LIST forbidden patterns")
Task(subagent_type="Explore", run_in_background=true, prompt="Build/CI: FIND .github/workflows, Makefile, docker files → REPORT non-standard patterns")
Task(subagent_type="Explore", run_in_background=true, prompt="Test patterns: FIND test configs, test structure → REPORT unique conventions")
```

Fire ALL 6 agents in a SINGLE message (parallel tool calls).

<dynamic-agents>
**DYNAMIC AGENT SPAWNING**: After bash analysis, spawn ADDITIONAL explore agents based on project scale:

| Factor | Threshold | Additional Agents |
|--------|-----------|-------------------|
| **Total files** | >100 | +1 per 100 files |
| **Total lines** | >10k | +1 per 10k lines |
| **Directory depth** | ≥4 | +2 for deep exploration |
| **Large files (>500 lines)** | >10 files | +1 for complexity hotspots |
| **Monorepo** | detected | +1 per package/workspace |
| **Multiple languages** | >1 | +1 per language |

```bash
# Measure project scale first
total_files=$(find . -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/venv/*' -not -path '*/dist/*' -not -path '*/build/*' -not -path '*/__pycache__/*' | wc -l)
total_lines=$(find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.py" -o -name "*.go" -o -name "*.rs" -o -name "*.js" -o -name "*.jsx" \) -not -path '*/node_modules/*' -not -path '*/.git/*' -exec wc -l {} + 2>/dev/null | tail -1 | awk '{print $1}')
large_files=$(find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.py" -o -name "*.go" \) -not -path '*/node_modules/*' -exec wc -l {} + 2>/dev/null | awk '$1 > 500 {count++} END {print count+0}')
max_depth=$(find . -type d -not -path '*/node_modules/*' -not -path '*/.git/*' | awk -F/ '{print NF}' | sort -rn | head -1)
```
</dynamic-agents>

### Main Session: Concurrent Analysis

**While background agents run**, main session does:

#### 1. Bash Structural Analysis
```bash
# Directory depth + file counts
find . -type d -not -path '*/\.*' -not -path '*/node_modules/*' -not -path '*/venv/*' -not -path '*/dist/*' -not -path '*/build/*' | awk -F/ '{print NF-1}' | sort -n | uniq -c

# Files per directory (top 30)
find . -type f -not -path '*/\.*' -not -path '*/node_modules/*' | sed 's|/[^/]*$||' | sort | uniq -c | sort -rn | head -30

# Code concentration by extension
find . -type f \( -name "*.py" -o -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.go" -o -name "*.rs" \) -not -path '*/node_modules/*' | sed 's|/[^/]*$||' | sort | uniq -c | sort -rn | head -20

# Existing CLAUDE.md files
find . -type f -name "CLAUDE.md" -not -path '*/node_modules/*' 2>/dev/null
```

#### 2. Read Existing CLAUDE.md
```
For each existing CLAUDE.md found:
  Read(file_path=file)
  Extract: key insights, conventions, anti-patterns
  Store in EXISTING_CLAUDE map
```

If `--create-new`: Read all existing first (preserve context) → then delete all → regenerate.

#### 3. Codebase Symbol Analysis (Grep-based)

Since Claude Code doesn't have LSP, use Grep/Glob for structural analysis:

```
# Find exports and public API surfaces
Grep(pattern="^export (default |)(class|function|const|interface|type) ", glob="*.{ts,tsx,js,jsx}")
Grep(pattern="^(class |def |func )", glob="*.{py,go,rs}")

# Find module boundaries
Glob(pattern="**/index.{ts,tsx,js,jsx}")
Glob(pattern="**/__init__.py")
Glob(pattern="**/mod.rs")

# Find configuration and entry points
Glob(pattern="**/package.json")
Glob(pattern="**/Cargo.toml")
Glob(pattern="**/go.mod")
Glob(pattern="**/pyproject.toml")
```

### Collect Background Results

```
// After main session analysis done, collect all background agent results using TaskOutput
TaskOutput(task_id="<agent_id>", block=true)
```

**Merge: bash + symbol analysis + existing + explore findings. Mark Phase 1 as completed.**

---

## Phase 2: Scoring & Location Decision

**Mark Phase 2 as in_progress.**

### Scoring Matrix

| Factor | Weight | High Threshold | Source |
|--------|--------|----------------|--------|
| File count | 3x | >20 | bash |
| Subdir count | 2x | >5 | bash |
| Code ratio | 2x | >70% | bash |
| Unique patterns | 1x | Has own config | explore |
| Module boundary | 2x | Has index.ts/__init__.py | bash |
| Symbol density | 2x | >30 exports/classes | Grep |
| Cross-references | 3x | Imported by >10 files | Grep |

### Decision Rules

| Score | Action |
|-------|--------|
| **Root (.)** | ALWAYS create |
| **>15** | Create CLAUDE.md |
| **8-15** | Create if distinct domain |
| **<8** | Skip (parent covers) |

### Max Depth

Default max depth is 3. Respect `--max-depth=N` if provided.

### Output
```
CLAUDE_LOCATIONS = [
  { path: ".", type: "root" },
  { path: "src/hooks", score: 18, reason: "high complexity" },
  { path: "src/api", score: 12, reason: "distinct domain" }
]
```

**Mark Phase 2 as completed.**

---

## Phase 3: Generate CLAUDE.md

**Mark Phase 3 as in_progress.**

### Root CLAUDE.md (Full Treatment)

Prefix the file with:

```markdown
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
```

Then include these sections as relevant:

```markdown
## OVERVIEW
{1-2 sentences: what + core stack}

## STRUCTURE
```
{root}/
├── {dir}/    # {non-obvious purpose only}
└── {entry}
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|

## CONVENTIONS
{ONLY deviations from standard — if project follows standard conventions for its stack, omit this section}

## ANTI-PATTERNS (THIS PROJECT)
{Explicitly forbidden here — from comments and existing docs}

## COMMANDS
```bash
{dev/test/build/lint — only non-obvious commands}
```

## NOTES
{Gotchas, quirks, things that waste time if you don't know}
```

**Quality gates**: 50-150 lines. No generic advice. No obvious info. Telegraphic style.

### Subdirectory CLAUDE.md (Parallel)

Launch Task agents for each location in parallel:

```
for loc in CLAUDE_LOCATIONS (except root):
  Task(subagent_type="delegator", run_in_background=true, prompt=`
    Generate CLAUDE.md for directory: ${loc.path}
    Reason for creation: ${loc.reason}

    Rules:
    - Prefix with: # CLAUDE.md\n\nGuidance for ${loc.path} directory.
    - 30-80 lines max
    - NEVER repeat content from root CLAUDE.md
    - Include only: OVERVIEW (1 line), STRUCTURE (if >5 subdirs), WHERE TO LOOK, CONVENTIONS (only if different from root), ANTI-PATTERNS
    - Telegraphic style — no fluff
    - No generic advice that applies to all projects
    - Focus on what makes THIS directory special/different

    Context from root CLAUDE.md:
    ${ROOT_CLAUDE_CONTENT}

    Context from explore agents about this directory:
    ${RELEVANT_EXPLORE_FINDINGS}
  `)
```

**Wait for all. Mark Phase 3 as completed.**

---

## Phase 4: Review & Deduplicate

**Mark Phase 4 as in_progress.**

For each generated file:
1. **Remove generic advice** — Anything that applies to ALL projects of this type
2. **Remove parent duplicates** — Child must never repeat parent content
3. **Trim to size limits** — Root: 50-150 lines, Subdirs: 30-80 lines
4. **Verify telegraphic style** — Remove filler words, passive voice, obvious statements
5. **Check cross-references** — Subdirs should reference parent for shared info, not repeat it

**Mark Phase 4 as completed.**

---

## Final Report

After all phases complete, output a summary:

```
=== init-deep Complete ===

Mode: {update | create-new}
Max Depth: {N}

Files:
  [OK] ./CLAUDE.md (root, {N} lines)
  [OK] ./src/hooks/CLAUDE.md ({N} lines, score: {S})
  [SKIP] ./src/utils (score: {S}, below threshold)

Dirs Analyzed: {N}
CLAUDE.md Created: {N}
CLAUDE.md Updated: {N}

Hierarchy:
  ./CLAUDE.md
  └── src/hooks/CLAUDE.md
```

---

## Anti-Patterns

- **Static agent count**: MUST vary agents based on project size/depth
- **Sequential execution**: MUST parallel (explore agents + bash concurrent)
- **Ignoring existing**: ALWAYS read existing first, even with --create-new
- **Over-documenting**: Not every dir needs CLAUDE.md — use scoring
- **Redundancy**: Child never repeats parent
- **Generic content**: Remove anything that applies to ALL projects
- **Verbose style**: Telegraphic or die
- **Exceeding depth**: Respect --max-depth flag
