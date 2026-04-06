---
name: development-workflow
description: Use when handling non-trivial implementation work such as features, bug fixes, behavior changes, multi-file edits, or work that should probably have tests. Skip for docs, comments, formatting, rename-only, or other low-risk mechanical changes.
---

# Development Workflow

## Overview

This is the top-level workflow for non-trivial implementation work.

Use it to keep the process explicit without forcing heavyweight ceremony on simple requests.

## When to Use

- new features
- real bug fixes
- behavior changes
- multi-file changes
- work that should probably have tests

Do not use this skill for:

- docs-only changes
- comments-only changes
- formatting-only changes
- rename-only or other purely mechanical edits

If the work is primarily service packaging, deployment, cluster changes, or PR shipping in the existing Alygo or Alycluster flow, use `sdlc` instead.

## Workflow

### 1. Clarify Only What Matters

If the request is underspecified, invoke `requirements-clarity`.

- Ask only the questions that materially affect the implementation.
- Prefer one question at a time.
- Present the recommended option first.
- Skip clarification when the request is already clear.

### 2. Choose The Workspace

For meaningful implementation work in a git repository, invoke `git-worktree` unless staying inline is clearly the better path.

Prefer a worktree when:

- the change is non-trivial
- the repo is busy or dirty
- isolation reduces risk

Stay inline when:

- the edit is tiny
- the worktree would be needless overhead
- the user explicitly wants the current tree

### 3. Break The Work Into Practical Tasks

Before implementation, create a short task list.

- Keep tasks actionable and proportionate to the work.
- Separate independent tasks from tightly coupled work.
- Do not turn a small bug fix into a large project plan.

### 4. Choose Execution Mode

If tasks are genuinely independent and your environment supports subagents, you may use subagents for execution.

Otherwise, stay in one session and execute the tasks directly.

Rules:

- Use subagents only when they reduce risk or speed up the work.
- Stay inline for tightly coupled, small, or highly interactive work.
- Keep task breakdown and execution coordination here in the orchestrator.

### 5. Implement With TDD

For features, bug fixes, and behavior changes, invoke `tdd-red-green-refactor`.

Follow explicit red, green, refactor behavior:

- write the failing test first
- observe the failure
- make the smallest passing change
- refactor while staying green

Only skip strict TDD for trivial mechanical edits or when tests are not meaningful.

### 6. Run The Final Quality Gate

Before calling the work done, invoke `final-code-review`.

- Critical and important findings must be fixed.
- Minor nits may be reported without blocking completion.

### 7. Verify Before Completion

Run the relevant verification commands for the work you changed before claiming success.

Examples:

- focused tests
- full relevant test suite
- installer checks
- lint or build checks when applicable

Do not claim the work is complete without fresh verification evidence.

## Operating Principles

- Be explicit about which phase you are in.
- Use the smallest workflow that still protects quality.
- Avoid repeated planning loops for simple work.
- Prefer clear, simple code over cleverness.
- Keep comments sparse but useful.

## Common Mistakes

- invoking this workflow for trivial edits
- skipping clarification when the requirements are actually fuzzy
- forcing a worktree for a tiny change
- using subagents when the work is tightly coupled
- treating TDD as optional for real behavior changes
- skipping the final review and verification gate
