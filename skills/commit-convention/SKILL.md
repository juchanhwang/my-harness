---
name: commit-convention
description: >
  Git commit best practices skill. Analyzes staged changes to determine if they should be split,
  guides on writing proper subject lines and commit bodies.
  Trigger when: (1) about to run git commit, (2) asked "how should I write this commit message?",
  (3) reviewing staged changes, (4) changes appear to span multiple concerns.
  Always check project CLAUDE.md first — project-specific conventions (language, type list) take precedence.
---

# Commit Convention

Follow this skill before creating a commit.

> **Project conventions first**: If the project has a CLAUDE.md with commit rules
> (subject language, allowed types, ticket prefix format), those override this skill's defaults.

---

## Step 1: Understand staged changes

```bash
git diff --staged --stat        # which files changed and by how much
git diff --staged               # actual content of changes
```

---

## Step 2: Determine commit granularity

**Rule: one logical change, not one file or one line count.**
A 500-line change can be one commit. A 10-line change may need to be two.

### Signs you should split

- The subject line needs "and" to describe what changed
- More than one Conventional Commit type applies (e.g., `feat` + `refactor`)
- Refactoring (rename, move, extract) is mixed with behavior change (fix, feat)
- You can imagine wanting to revert only part of this commit

### Split patterns

| Situation | Order |
|-----------|-------|
| New feature | types/interfaces → core logic → integration → tests |
| Refactor then change behavior | structural change (refactor) → behavior change (fix/feat) |
| Dependency update | single commit regardless of file count |
| CI, docs, test changes | separate from code changes (except directly related tests) |

To split: use `git add -p` or `git reset HEAD <file>` to stage selectively.

---

## Step 3: Write the subject line

### Format

```
type(scope): subject
type(scope)!: subject          ← breaking change
```

**Rules** (Conventional Commits + Tim Pope + Chris Beams):
- 50 characters or less
- **Subject language: Korean by default** (technical identifiers and proper nouns in English are fine)
  — override with project CLAUDE.md if the project uses a different language
- Imperative or noun form: "기능 추가" not "기능을 추가했다"
- Lowercase `type` and `scope`; no period at the end

### Imperative mood test (Chris Beams)

The subject should complete this sentence naturally:

> "If applied, this commit will **[subject]**"

- "If applied, this commit will **fix off-by-one error in pagination**" ✅
- "If applied, this commit will **fixed off-by-one error in pagination**" ❌

### Conventional Commits standard types

| Type | Use when |
|------|----------|
| `feat` | new feature |
| `fix` | bug fix |
| `refactor` | code restructure with no behavior change |
| `test` | adding or updating tests |
| `docs` | documentation only |
| `style` | formatting, whitespace (no logic change) |
| `chore` | build process, tooling, dependencies |
| `perf` | performance improvement |
| `ci` | CI/CD configuration |
| `build` | build system changes |
| `revert` | reverting a previous commit |
| `hotfix` | urgent production fix (bypasses normal flow) |

> Projects often extend this list (e.g., `design`, `rename`). Check CLAUDE.md.

---

## Step 4: Write the body

### When to write a body

Err on the side of writing one. Commits are permanent history — what seems obvious today is
opaque six months later.

**Body is necessary when:**
- The reason for the change isn't obvious from the code alone
- Bug fix: root cause explanation
- An alternative approach was considered and rejected
- There are trade-offs or known limitations
- Performance improvement: include numbers to back up the claim
- Revert: explain why

**Subject alone is sufficient for:**
- `docs: fix typo in README`
- `chore: bump dependency versions`
- `style: remove trailing whitespace`

### What to write vs. what to avoid

Based on 5 references: Tim Pope (2008), Chris Beams (2014), Git official docs, Google Engineering Practices, Linux Kernel submitting-patches — all in agreement:

| Write this | Avoid this |
|-----------|------------|
| **Why** the change was needed (motivation/problem) | Implementation details already visible in the code (How) |
| What was wrong with the previous behavior | "This commit adds..." (redundant) |
| Why this approach was chosen over alternatives | A list of what changed (that's what the diff is for) |
| Trade-offs and known limitations | Explanations that rely solely on external links\* |
| Issue/ticket references | |
| Concrete numbers when claiming performance gains | |

\* The body must be **self-contained**. It should make sense even if the link breaks.

### Format

```
type(scope): short summary in imperative mood     ← 50 chars or less

                                                  ← blank line (mandatory)
Explain the problem this commit solves. Focus     ← wrap at 72 chars
on why, not how. The diff already shows how.

Further paragraphs separated by blank lines.

 - Bullet points are fine
 - Use a hyphen with a hanging indent

Fixes #123                                        ← issue references last
```

### Examples

**Bug fix — with root cause:**
```
fix(pagination): correct off-by-one error in page offset

The server expects 0-indexed page numbers, but the client was
passing the raw 1-indexed value from the URL. This caused the
first item to always be skipped on page 1.

Added offset = (page - 1) * limit conversion before the API call.

Fixes #456
```

**Refactor — body optional:**
```
refactor(user): move UserService to services/ directory
```

**Feature — with trade-off:**
```
feat(auth): use sliding window for token refresh

The fixed window approach caused abrupt logouts when users made
requests near the expiry boundary — the window reset regardless
of activity.

Sliding window resets the expiry on each active request, keeping
active sessions alive. Load tests show no measurable latency change.

Trade-off: tokens cannot be individually revoked before expiry.
A short-TTL token blocklist is planned as follow-up work.
```

---

## Checklist

Before committing:

- [ ] Do the staged changes represent a single logical change?
- [ ] Does the subject avoid "and"?
- [ ] Are refactoring and behavior changes separated?
- [ ] Is the subject in imperative mood, ≤ 50 chars, no period?
- [ ] Does the change need a body? If so, does it explain *why*?
