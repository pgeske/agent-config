# Coordinator note formats

Use plain Markdown and relative links within the notes root. Times use the
machine's local timezone with a UTC offset. These are outlines, not mandatory
empty fields: keep notes useful rather than filling them with boilerplate.

## briefing.md — living current snapshot

```markdown
# Coordinator briefing
Updated: <timestamp with offset>
Scope: <personal/work context; no secrets>

## Current priorities
- <Goal, why it matters, current state, next action>

## Open assignments
- <ID / goal> — <in progress | blocked | awaiting acceptance | accepted>
  Worker: <host/session/name/pane if known; last verified time>
  Report: [task](workers/<assignment-id>.md) — <received time or pending>
  Next: <what happens next and who owns it>

## Open conversations and constraints
- <Unfinished decision, relevant preference, uncertainty>

## Recent context
- <Brief meaningful development> — [daily log](daily/YYYY-MM-DD.md)
```

The briefing is revised, not appended forever. A successor should understand it
without reading the coordinator's transcript. Do not retire active projects simply
because they were not mentioned today. Save meaningful history in logs first.

## daily/YYYY-MM-DD.md — dated work history

```markdown
# Work log — YYYY-MM-DD

## <assignment-id or stable topic>
Updated: <timestamp with offset>
- Activity/result: <what actually happened>
- Decision and rationale: <if any>
- Evidence: <report/commit/test links; distinguish reported from verified>
- Open: <remaining work or missing update>
- Report: [task](../workers/<assignment-id>.md)
```

Preserve past activity. Repeated wrap-ups update an existing topic entry for the
day rather than appending copies. Explicitly date corrections or changed decisions.
Conversations and non-delegated work belong here too; no worker report is required.

## workers/<assignment-id>.md — task-specific current handoff

```markdown
# <Task title>
Assignment: <stable unique id>
Updated: <timestamp with offset>
Handoff: <checkpoint | accepted closeout>
Status: <in progress | blocked | ready for review | accepted>
Worker: <host/session/name/pane if available>

## Goal and constraints
<Enough context to continue without the original prompt>

## Current result
<What changed and why; separate attempted from completed actions>

## Evidence and validation
<Commands/checks and actual results, commits/PRs/files, meaningful gaps>

## Remaining work and next action
<Blockers, questions, uncommitted changes, exact next step>

## Resume context
<Repository/worktree/branch, relevant artifacts, worker locator if known>

## Decisions and corrections
<Important reversals from earlier attempts, if any>
```

One report per assignment, not per worker turn. Revise checkpoints at the same
path, preserving important reversals and evidence. A worker can be ready for review
without being accepted. Only use `accepted` when the coordinator/user explicitly
said so. Closeout never means terminate the worker session.
