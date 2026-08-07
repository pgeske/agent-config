---
name: tasks-workflow
description: Read and manage persistent personal tasks in `~/notes/wiki/tasks.md`. Use when the user asks to add, complete, update, remove, inspect, or summarize tasks or todos.
---

# Tasks Workflow

## Source of truth

- Use `~/notes/wiki/tasks.md`.
- Always read the current file before modifying it.
- Treat the file as user-owned state: preserve useful wording, tags, dates, and completed history.
- If it does not exist, create these sections in order:
  - `## weekly goal`
  - `## today`
  - `## this week`
  - `## backlog`
  - `## done`

## Scope

- Treat this as a personal task list by default.
- Add employer-specific tasks only when the user explicitly asks.
- Do not use this file for transient coding-session plans.

## Task format

Use Markdown checklist items with lightweight metadata:

```md
- [ ] task text #project/example #theme/example ➕ 2026-08-07
- [x] finished task #project/example ➕ 2026-08-06 ✅ 2026-08-07
```

- Add `➕ YYYY-MM-DD` to new tasks.
- Add `✅ YYYY-MM-DD` when completing a task.
- Keep metadata at the end of the line.
- Preserve existing metadata conventions rather than forcing a rewrite.

## Behavior

- Prefer updating an existing matching task over adding a duplicate.
- Keep wording concise and actionable.
- Preserve useful tags and original created dates.
- Active tasks remain unchecked in `today`, `this week`, or `backlog`.
- During normal task updates, completed tasks stay checked at the bottom of their current section.
- The `dailies` workflow moves checked tasks into `done` during morning cleanup.
- If the user asks to remove a delegated or irrelevant task, delete it rather than pretending the user completed it.
- If the user asks for a summary, read and summarize without rewriting the file.

## Section guidance

- `weekly goal`: visible non-checklist mirror of the current week's high-level goals
- `today`: tasks intended for today
- `this week`: tasks intended this week but not necessarily today
- `backlog`: not now, but worth retaining
- `done`: completed tasks archived by the dailies workflow

After changing the file, briefly state what changed.
