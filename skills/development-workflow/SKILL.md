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

## Workflow

### 1. Clarify Only What Matters

If the request is underspecified, invoke `requirements-clarity`.

- Ask only the questions that materially affect the implementation.
- Prefer one question at a time.
- Present the recommended option first.
- Skip clarification when the request is already clear.

### 2. Present A Mini Design

If you had to clarify requirements, do not jump straight from answers into implementation.

- Synthesize the clarified requirements into a short proposed approach before coding.
- Keep it brief: usually 3-5 bullets.
- Include the expected behavior, the main code areas you plan to touch, and any key tradeoff or assumption.
- Recommend one approach when multiple valid implementations exist.
- This is the design-level view, not the detailed execution plan.
- End with a clear transition into the implementation plan, not immediate coding.

Skip this extra checkpoint only when the request was already clear and the implementation is obviously small.

### 3. Choose The Workspace

For meaningful implementation work in a git repository, invoke `git-worktree` unless staying inline is clearly the better path.

Prefer a worktree when:

- the change is non-trivial
- the repo is busy or dirty
- isolation reduces risk

Stay inline when:

- the edit is tiny
- the worktree would be needless overhead
- the user explicitly wants the current tree

If `git-worktree` is used, the branch is normally created there before implementation begins.

### 4. Break The Work Into Practical Tasks

Before implementation, create a short task list.

- Keep tasks actionable and proportionate to the work.
- Separate independent tasks from tightly coupled work.
- Do not turn a small bug fix into a large project plan.
- Present this task list to the user as the implementation plan before starting substantial coding work.
- Keep it short: usually 3-7 bullets.
- Include what you will change first, any risky or uncertain step, and how you plan to verify the work.
- If you already presented a mini design, make the implementation plan the follow-on checkpoint.
- End with a clear approval gate such as: `This is the implementation plan I am planning to follow. Let me know if you want anything changed; otherwise I will continue.`

For obviously tiny changes, you may combine the mini design and implementation plan into one brief checkpoint.

### 5. Choose Execution Mode

If tasks are genuinely independent and your environment supports subagents, you may use subagents for execution.

Otherwise, stay in one session and execute the tasks directly.

Rules:

- Use subagents only when they reduce risk or speed up the work.
- Stay inline for tightly coupled, small, or highly interactive work.
- Keep task breakdown and execution coordination here in the orchestrator.

### 6. Implement With TDD

For features, bug fixes, and behavior changes, invoke `tdd-red-green-refactor`.

Follow explicit red, green, refactor behavior:

- write the failing test first
- observe the failure
- make the smallest passing change
- refactor while staying green

Only skip strict TDD for trivial mechanical edits or when tests are not meaningful.

### 7. Run The Final Quality Gate

Before calling the work done, invoke `final-code-review`.

- Critical and important findings must be fixed.
- Minor nits may be reported without blocking completion.

### 8. Verify Before Completion

Run the relevant verification commands for the work you changed before claiming success.

Examples:

- focused tests
- full relevant test suite
- installer checks
- lint or build checks when applicable

Do not claim the work is complete without fresh verification evidence.

### 9. Open The Review Loop

After implementation, final review, and local verification are done for git-backed work, invoke `pr-review-loop`.

- Treat this as the publish-and-review phase, not part of implementation.
- Create or update the branch, commit, push, and open or update the PR there.
- Share the PR with the user for review instead of stopping at local completion.
- If the user gives feedback rounds on that same work, continue through the PR until the user is satisfied.
- If `git-worktree` was used, reuse its branch.
- If the work stayed inline and no suitable feature branch exists yet, create one before pushing.
- If the repository is not a git repo or cannot support a GitHub PR, report that clearly instead of pretending the phase succeeded.

## Operating Principles

- Be explicit about which phase you are in.
- Use the smallest workflow that still protects quality.
- Avoid repeated planning loops for simple work.
- Prefer clear, simple code over cleverness.
- Keep comments sparse but useful.

## Common Mistakes

- invoking this workflow for trivial edits
- skipping clarification when the requirements are actually fuzzy
- jumping from clarified answers straight into coding without proposing the implementation shape
- keeping the task breakdown internal when the user should see the implementation plan before coding starts
- forcing a worktree for a tiny change
- using subagents when the work is tightly coupled
- treating TDD as optional for real behavior changes
- skipping the final review and verification gate
- stopping after local verification when the normal workflow should continue through a PR and user review
