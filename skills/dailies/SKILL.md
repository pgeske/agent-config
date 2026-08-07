---
name: dailies
description: Runs a daily planning workflow against ~/notes/wiki/tasks.md by checking recurring morning tasks, reviewing carry-over work, and updating today, this week, backlog, and done.
---

# Dailies

## Overview

Use this skill to run a short daily planning session around `~/notes/wiki/tasks.md`.

The flow has three parts:

1. A recurring daily check-in for the same startup tasks.
2. A high-level weekly goals pass that captures what the week is broadly about in human-readable prose or bullets.
3. A checklist planning pass that turns the weekly goals and existing tasks into concrete `today` and `this week` todos, then rewrites the task file cleanly.

This skill is designed for the user's current Obsidian-style task file with these sections:

- `## weekly goal`
- `## today`
- `## this week`
- `## backlog`
- `## done`

Do not invent a more complex system unless the user asks for one.

The user currently wants lightweight task metadata and tags added inline.

## Default File

Use `~/notes/wiki/tasks.md` unless the user explicitly asks to use a different file.

Use `~/notes/wiki/weekly-goals.md` for the high-level weekly goals capture unless the user explicitly asks to use a different file.

## Weekly Goals Format

Weekly goals are not todos. Keep them human-readable: short prose, bullets, or a compact mixed shape that reflects how the user described the week.

Use one dated section per week in `~/notes/wiki/weekly-goals.md`:

```md
## Week of 2026-05-11

- Ship the first usable version of the current project.
- Keep the supporting infrastructure work moving toward merge.
```

Rules:

- Prefer the Monday date for the section heading.
- If the current week already has a section, update that section rather than appending a duplicate.
- Preserve older weekly sections.
- Do not force checklist syntax in weekly goals.
- Keep the goals concise enough to review during future dailies.

Also mirror the current week's goals at the top of `~/notes/wiki/tasks.md` in a visible `## weekly goal` section so the user sees them during normal task review:

```md
## weekly goal
_Week of 2026-05-11_

- Ship the first usable version of the current project.
- Keep the supporting infrastructure work moving toward merge.
```

Rules for the mirrored task-file section:

- Keep `## weekly goal` as the first section in `tasks.md`.
- Preserve or refresh this section whenever rewriting `tasks.md`; do not delete it during cleanup.
- Use italic text for the week label.
- Keep the content non-checklist unless the user explicitly asks for checklist goals.
- Treat `weekly-goals.md` as the durable history and `tasks.md` as the visible current-week mirror.

## Task Format

Represent tasks as markdown checklist items with inline metadata.

Default format:

```md
- [ ] task text #project/example #theme/example ➕ 2026-04-21
- [x] finished task #project/example ➕ 2026-04-20 ✅ 2026-04-21
```

Rules:

- Add a created date to every new task with `➕ YYYY-MM-DD`.
- When a task is marked done, add a completion date with `✅ YYYY-MM-DD`.
- Preserve an existing created date when rewriting or moving a task.
- Preserve existing useful tags when rewriting a task.
- Keep metadata at the end of the task line.

If the task file later adopts a different Obsidian-specific metadata convention, follow the file's existing convention instead of forcing this one.

## Workflow

### 1. Daily Startup Check

Ask these in order, one at a time, and wait for the user's answer before moving on:

1. `Did you check your messages?`
2. `Did you check email?`
3. `Did you check your calendar?`

Keep this lightweight. The goal is just to walk through the routine.

Do not add these recurring startup prompts to `tasks.md` unless the user explicitly asks to persist them there.

### 2. Read Current Planning State

Read `~/notes/wiki/tasks.md` and `~/notes/wiki/weekly-goals.md` before asking planning questions. If the weekly goals file does not exist yet, continue normally and create it when saving the new weekly goals.

Use `tasks.md` as reference for:

- the visible `## weekly goal` section, if present
- unfinished carry-over from `today`
- existing commitments in `this week`
- backlog items that might matter now
- completed items that still need to be moved into `done`

Use `weekly-goals.md` as reference for:

- the current week's existing high-level goals, if any
- the previous week's goals, if they help frame carry-over

Give the user a short context summary before the planning interview. Keep it concise and practical.

Example shape:

- `Here is the current weekly goal, if we have one: ...`
- `Here is the carry-over from today: ...`
- `Here is what you already had in this week: ...`
- `Here are backlog items that might be relevant: ...`

Do not dump the whole file back unless the user asks.

### 3. Weekly Goals Interview

After the context summary, start by working backwards from the week-level picture.

Ask:

1. `What do you want this week to be about?`
2. `What do you want to have accomplished by the end of the week?`

Help the user turn their answer into a short weekly goals section. This should read like an overview, not a task checklist.

Before moving on, briefly reflect the proposed weekly goals and ask whether that is the right shape. Once the user agrees, save or update the current week's section in `~/notes/wiki/weekly-goals.md`.

Also update the `## weekly goal` section at the top of `~/notes/wiki/tasks.md` with the same current-week goals. If `tasks.md` does not have that section yet, add it before `## today`.

### 4. Checklist Planning Interview

After weekly goals are settled, guide the user into concrete tasks.

Before asking what should go into `today`, refresh the planning context again. This is important because the user decides today's agenda from both the high-level weekly goals and the existing task list, including unrelated admin or follow-up work.

Show a compact summary with:

- the saved weekly goals
- unfinished carry-over from `today`
- existing concrete `this week` tasks
- relevant `backlog` items
- checked items still sitting outside `done` that should be moved during cleanup

Keep this summary concise, but include enough context for the user to choose today's agenda without having to remember the prior task file.

Cover at least these questions:

1. `Given those weekly goals, what do you want to get done today?`
2. `What concrete tasks should stay in this week but not necessarily today?`
3. `Anything from the current list you want to defer, rewrite, mark done, or drop?`

If needed, ask short follow-ups to clarify:

- whether an item belongs in `today`, `this week`, or `backlog`
- whether a carry-over item is still active
- whether something is already done and should be moved
- whether a task should be rewritten to be clearer or smaller

Be collaborative and concise. The point is to help the user decide, not to over-structure the conversation.

### 5. Update The Task File

When the planning conversation is complete, update `~/notes/wiki/tasks.md`.

Use this structure:

- `## weekly goal`
- `## today`
- `## this week`
- `## backlog`
- `## done`

Apply these rules:

- Preserve or refresh the visible weekly goal section at the top from the current week in `weekly-goals.md`.
- Keep active tasks under `today`, `this week`, or `backlog` as unchecked markdown checklist items.
- Move completed tasks out of active sections and into `## done`.
- Preserve completed tasks in `## done` as checked items.
- Rewrite task wording when the user asked for it or when a tiny cleanup makes the task clearer.
- Remove obvious duplication when reorganizing.
- Preserve useful carry-over items unless the user explicitly drops them.
- Add `➕ YYYY-MM-DD` to newly created tasks.
- Add `✅ YYYY-MM-DD` when moving a task into `done` if it does not already have one.
- Sort `## done` by completion date descending, with the most recently completed items first.

If checked tasks are still sitting in `today`, `this week`, or `backlog`, move them into `done` during the rewrite.

### 5a. Tags

Add tags when they help capture stable themes, projects, or workstreams.

Use a small number of tags per task. Prefer 1-3 useful tags over tagging everything heavily.

Default tag style:

- `#project/<name>` for a concrete project, repo, or initiative
- `#theme/<name>` for a recurring category of work

Examples:

- `#project/agent-config`
- `#project/home-automation`
- `#theme/review`
- `#theme/docs`
- `#theme/deploy`

Rules:

- Use short, lowercase, hyphenated tag names.
- Reuse existing tags when they fit.
- Do not create extra tags if none are clearly helpful.

### 6. Confirm The Result

After editing, summarize:

- the saved weekly goals
- what went into `today`
- what went into `this week`
- what was moved to `done`
- anything intentionally deferred to `backlog`

Keep the summary short.

## Editing Guidance

- Prefer a clean rewrite of the small file over fragile line-by-line edits.
- Keep both documents simple and readable in plain Markdown.
- Keep the metadata lightweight: created date, completion date, and a few useful tags.
- Do not add priorities or new task headings unless the user asks.
- Keep task section ordering stable, with `## weekly goal` first.
- If a section is empty, leave the heading in place.

## Decision Rules

Use these heuristics unless the user says otherwise:

- `today`: tasks the user intends to work on today
- `this week`: tasks the user wants to accomplish this week but not necessarily today
- `backlog`: not now, but worth keeping
- `done`: completed items only

Unchecked carry-over tasks from `today` should not automatically stay in `today` forever. Ask whether they still belong in `today`, should move to `this week`, or should move to `backlog`.

When converting an existing plain task with no metadata into the new format:

- add a created date when the task is being newly added during the current session
- if an older carried-over task has no created date, it is acceptable to leave it without one rather than inventing a false historical date
- always add a completion date when marking a task done during the current session

## Example Session Shape

1. Ask `Did you check your messages?`
2. Ask `Did you check email?`
3. Ask `Did you check your calendar?`
4. Read `~/notes/wiki/tasks.md` and `~/notes/wiki/weekly-goals.md`
5. Summarize current weekly goals, carry-over, and existing weekly commitments
6. Ask what the user wants this week to be about
7. Draft and save the current week's high-level goals in `weekly-goals.md`
8. Ask what concrete tasks should go into `today`, `this week`, and `backlog`
9. Clarify any moves, rewrites, or completed items
10. Rewrite `tasks.md`
11. Briefly summarize the saved weekly goals and final task organization
