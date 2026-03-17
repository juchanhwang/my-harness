---
name: feature-dev
description: Comprehensive feature development workflow with specialized agents for codebase exploration, architecture design, and quality review. Triggers on "implement feature", "build feature", "add feature", "feature-dev", or when the user describes a new feature to implement end-to-end.
---

# Feature Development

Systematic, multi-phase feature development workflow with specialized sub-agents. Adapted from Anthropic's Claude Code plugin for OpenCode's task() orchestration system.

## When to Use

- User asks to implement a new feature
- User says "feature-dev", "implement X", "build X", "add X feature"
- Any end-to-end feature implementation request

## Core Principles

- **Ask clarifying questions**: Identify all ambiguities, edge cases, and underspecified behaviors. Ask specific, concrete questions rather than making assumptions. Wait for user answers before proceeding.
- **Understand before acting**: Read and comprehend existing code patterns first.
- **Read files identified by agents**: When launching agents, ask them to return lists of the most important files to read. After agents complete, read those files to build detailed context.
- **Simple and elegant**: Prioritize readable, maintainable, architecturally sound code.
- **Use TodoWrite**: Track all progress throughout.

---

## Phase 1: Discovery

**Goal**: Understand what needs to be built.

**Actions**:
1. Create todo list with all phases
2. If feature is unclear, ask user for:
   - What problem are they solving?
   - What should the feature do?
   - Any constraints or requirements?
3. Summarize understanding and confirm with user

---

## Phase 2: Codebase Exploration

**Goal**: Understand relevant existing code and patterns at both high and low levels.

**Actions**: Launch 2-3 explore agents in parallel, each targeting a different aspect:

```
# Agent 1: Similar features
task(subagent_type="explore", run_in_background=true, load_skills=[],
  description="Find similar feature implementations",
  prompt="[CONTEXT]: Implementing {feature_description}.
  [GOAL]: Find similar features to understand existing patterns.
  [REQUEST]: Find features similar to {feature} and trace their implementation comprehensively. Focus on: entry points, data flow, abstractions used. Return list of 5-10 key files to read.")

# Agent 2: Architecture mapping
task(subagent_type="explore", run_in_background=true, load_skills=[],
  description="Map relevant architecture",
  prompt="[CONTEXT]: Implementing {feature_description}.
  [GOAL]: Understand the architecture and abstractions for {feature_area}.
  [REQUEST]: Map the architecture: module boundaries, abstraction layers, design patterns. Trace through the code comprehensively. Return list of 5-10 key files to read.")

# Agent 3 (optional): UI/Testing patterns
task(subagent_type="explore", run_in_background=true, load_skills=[],
  description="Analyze UI/testing patterns",
  prompt="[CONTEXT]: Implementing {feature_description}.
  [GOAL]: Understand UI patterns, testing approaches, or extension points relevant to {feature}.
  [REQUEST]: Analyze current implementation patterns. Return list of 5-10 key files to read.")
```

After agents return: **Read ALL files identified** to build deep understanding. Present comprehensive summary of findings.

---

## Phase 3: Clarifying Questions

**Goal**: Fill in gaps and resolve ALL ambiguities before designing.

**CRITICAL: DO NOT SKIP THIS PHASE.**

**Actions**:
1. Review codebase findings and original feature request
2. Identify underspecified aspects:
   - Edge cases and error handling
   - Integration points with existing code
   - Scope boundaries (what's in/out)
   - Design preferences
   - Backward compatibility
   - Performance requirements
3. **Present all questions to user in a clear, organized list**
4. **Wait for answers before proceeding**

If user says "whatever you think is best", provide your recommendation and get explicit confirmation.

---

## Phase 4: Architecture Design

**Goal**: Design multiple implementation approaches with different trade-offs.

**Actions**: Launch 2-3 architecture agents in parallel with different focuses:

```
# Agent 1: Minimal changes approach
task(category="deep", load_skills=[], run_in_background=true,
  description="Design: minimal change architecture",
  prompt="[CONTEXT]: Implementing {feature_description}. Codebase uses: {patterns_found}.
  [GOAL]: Design architecture with smallest change and maximum reuse.
  [REQUEST]: Analyze existing patterns from {key_files}. Design the complete feature with:
  - Patterns & conventions found (with file:line references)
  - Component design: file paths, responsibilities, dependencies, interfaces
  - Implementation map: files to create/modify with detailed changes
  - Data flow from entry to output
  - Build sequence as phased checklist
  Make confident choices. Be specific with file paths and function names.")

# Agent 2: Clean architecture approach
task(category="deep", load_skills=[], run_in_background=true,
  description="Design: clean architecture",
  prompt="[CONTEXT]: Implementing {feature_description}. Codebase uses: {patterns_found}.
  [GOAL]: Design for maximum maintainability and elegant abstractions.
  [REQUEST]: Same deliverables as above, but prioritize clean architecture, testability, and long-term maintainability over minimal changes.")

# Agent 3: Pragmatic balance
task(category="deep", load_skills=[], run_in_background=true,
  description="Design: pragmatic balance",
  prompt="[CONTEXT]: Implementing {feature_description}. Codebase uses: {patterns_found}.
  [GOAL]: Balance speed of implementation with code quality.
  [REQUEST]: Same deliverables as above, but optimize for the best speed + quality tradeoff.")
```

Review all approaches and present to user:
- Brief summary of each approach
- Trade-offs comparison
- **Your recommendation with reasoning**
- Concrete implementation differences

**Ask user which approach they prefer.**

---

## Phase 5: Implementation

**Goal**: Build the feature.

**DO NOT START WITHOUT USER APPROVAL.**

**Actions**:
1. Wait for explicit user approval
2. Read all relevant files identified in previous phases
3. Implement following the chosen architecture
4. Follow codebase conventions strictly
5. Write clean, well-documented code
6. Update todos as you progress

---

## Phase 6: Quality Review

**Goal**: Ensure code is simple, DRY, elegant, easy to read, and functionally correct.

**Actions**: Launch 3 review agents in parallel:

```
# Agent 1: Simplicity & elegance
task(category="quick", load_skills=[], run_in_background=true,
  description="Review: simplicity and DRY",
  prompt="Review the changes in {modified_files}. Focus on: simplicity, DRY principles, elegance, readability. Score each issue 0-100 confidence. Only report issues >= 80. Return with file:line references and concrete fix suggestions.")

# Agent 2: Bugs & correctness
task(category="quick", load_skills=[], run_in_background=true,
  description="Review: bugs and correctness",
  prompt="Review the changes in {modified_files}. Focus on: logic errors, null handling, race conditions, security vulnerabilities, edge cases. Score each issue 0-100 confidence. Only report issues >= 80. Return with file:line references and concrete fix suggestions.")

# Agent 3: Convention adherence
task(category="quick", load_skills=[], run_in_background=true,
  description="Review: project conventions",
  prompt="Review the changes in {modified_files} against project conventions in {claude_md_paths}. Focus on: naming, patterns, abstractions, file organization. Score each issue 0-100 confidence. Only report issues >= 80. Return with file:line references and concrete fix suggestions.")
```

Consolidate findings and present to user:
- Highest severity issues with recommendations
- **Ask user what to do**: fix now, fix later, or proceed as-is

---

## Phase 7: Summary

**Goal**: Document what was accomplished.

**Actions**:
1. Mark all todos complete
2. Summarize:
   - What was built
   - Key decisions made
   - Files modified/created
   - Suggested next steps (tests, docs, follow-up features)
