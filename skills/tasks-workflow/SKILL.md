---
name: tasks-workflow
description: Read and manage persistent personal tasks in `~/notes/wiki/tasks.md`. Use when the user asks to add, complete, update, remove, inspect, or summarize tasks or todos.
version: "0.2.0"
author: alyosha
---

# Tasks Workflow

## When to use

- Use this skill when the user asks to create a task or todo, add something to their list, mark a task done, move a task between states, remove a task, or check what tasks they have.
- Use it when the user refers to "my tasks", "my todo list", or otherwise means the persistent personal task list.
- Prefer this skill over `notes-workflow` when the request is clearly about tasks or todos rather than general note creation.
- Do not use this skill for transient task tracking for the current coding session; that is separate from the user's persistent task file.

## Source of truth

- The source of truth is `~/notes/wiki/tasks.md`.
- Always read the current file before answering questions about tasks or modifying it.
- If `~/notes/wiki/tasks.md` does not exist, create it with the canonical structure described below.
- Treat the existing file as user-owned state: preserve useful wording, tags, and completed history unless the user's request clearly changes them.

## Scope

- This file is for personal tasks only.
- Do not add employer or job-related tasks by default; the user manages work todos elsewhere.
- Only put a work task in `~/notes/wiki/tasks.md` if the user explicitly overrides that rule.

## Canonical structure

- Keep the file in markdown.
- Preserve the existing leading reconciliation comment if present.
- Keep sections in this order:
  - `## Active`
  - `## Backlog`
  - `## Waiting`
  - `## Done`
- Use `- [ ]` for tasks in `Active`, `Backlog`, and `Waiting`.
- Use `- [x]` for tasks in `Done`.
- Keep one task per line.
- Use inline lowercase kebab-case tags like `#health`, `#errands`, `#notes`, or `#home-assistant` when they add useful theme context.
- Prefix each task with a priority marker emoji: `🔴` for high, `🟡` for normal, `⚪` for low.
- Default new tasks to `🟡` unless the user indicates low or high priority, or the urgency is obvious from context.
- Use `🔴` when the user explicitly says something is urgent/high priority, or when the task is clearly time-sensitive or important enough that it should stand out.
- Store the created date as hidden inline metadata at the end of the task line using an HTML comment: `<!-- created: YYYY-MM-DD priority: normal -->`.
- Preserve existing metadata comments when editing tasks, and update the `priority:` field in the comment if the visible priority emoji changes.

## Section guidance

- Put near-term or actively relevant tasks in `Active`.
- Put later or lower-urgency tasks in `Backlog`.
- Put blocked, pending, or monitor-only tasks in `Waiting`.
- Put completed tasks in `Done`.
- When a task is marked complete, move it to `Done` instead of deleting it unless the user explicitly asks to remove it entirely.
- When a completed task becomes active again, move it out of `Done` and uncheck it.

## Editing behavior

- Prefer updating an existing matching task over adding a duplicate.
- Preserve tags when they still fit.
- Keep task wording concise and actionable.
- Avoid trailing punctuation in task text.
- When adding a new task, always include both a priority emoji and `created` metadata.
- When completing, moving, or rewording a task, preserve its original `created` metadata unless the user explicitly wants it reset.
- Reorder tasks only when it materially improves clarity or matches the user's request.
- If the user asks for a summary instead of an edit, read from `~/notes/wiki/tasks.md` and summarize the relevant sections rather than rewriting the file.

## Default file template

If the file must be created from scratch, use this structure:

```md
<!-- Managed task list. Manual edits are allowed. -->

# Tasks

## Active
- [ ] 🟡 example active task #example <!-- created: 2026-04-06 priority: normal -->

## Backlog
- [ ] ⚪ example backlog task #example <!-- created: 2026-04-06 priority: low -->

## Waiting

## Done
- [x] 🟡 example completed task #example <!-- created: 2026-04-06 priority: normal -->
```

## After changes

- Tell the user what changed.
- Reference `~/notes/wiki/tasks.md` in the response.
