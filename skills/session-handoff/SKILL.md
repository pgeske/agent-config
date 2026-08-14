---
name: session-handoff
description: Create a durable, self-contained Obsidian handoff note from the current agent session so a new agent can continue with minimal context loss. Use when the user asks for a handoff, session recap for continuation, end-of-session transfer, or invokes /handoff.
---

# Session Handoff

Create a high-signal handoff for a new agent that has no memory of this session.

## Output location

- Write one Markdown note under `~/notes/raw/handoffs/`.
- Create the directory if it does not exist.
- Name the file `YYYY-MM-DD-HHmm-<topic>-handoff.md` using local time and a short lowercase kebab-case topic.
- If the user supplies a topic or focus, use it. Otherwise infer the main active work from the session name and recent conversation.
- Avoid overwriting an existing handoff; add a short numeric suffix if needed.
- Keep this as a raw Obsidian note. Do not update `~/notes/wiki/` or invoke wiki curation automatically.

## Gather the state

Use the current model-visible session context as the primary source. It already contains the latest compaction summary plus recent messages and tool results.

Before writing:

1. Resolve stale state in older summaries against newer messages. The most recent verified state wins.
2. Inspect the current session file only when important details are missing or ambiguous. In Pi, `PI_SESSION_FILE` identifies it. Focus on the active branch, latest compaction, and recent entries rather than dumping or re-reading the entire JSONL file.
3. Perform only small, targeted one-shot checks when volatile state matters to continuation, such as the relevant repository's branch/status, a PR state, or a deployment's current version.
4. Do not continue the unfinished work, publish anything, send messages, deploy, or make unrelated project changes while creating the handoff.

Do not treat an exhaustive transcript as the goal. Preserve the information a capable replacement agent needs to make the next correct move.

## Required content

Start with:

```markdown
---
type: session-handoff
created: YYYY-MM-DDTHH:MM:SSZ
status: ready
tags:
  - handoff
---

# <Topic> handoff
```

Then include concise sections covering:

- **Objective** — what the user is trying to accomplish and why.
- **Current state** — the latest known state in a few direct bullets.
- **Completed work** — concrete changes and external side effects already completed.
- **Decisions and rationale** — important choices, rejected approaches, and why.
- **Files, repositories, and artifacts** — exact paths, branches, commits, PRs, tickets, dashboards, notes, or drafts that matter. Distinguish uncommitted, committed, pushed, merged, deployed, and merely drafted state.
- **Validation and evidence** — commands/checks run and meaningful outcomes; include clickable source links for observability evidence.
- **Open work** — unfinished items, blockers, approvals, and unknowns. Do not present planned work as completed.
- **Exact next steps** — an ordered checklist that tells the next agent where to start and what success looks like.
- **Constraints and cautions** — only session-specific permissions, safety constraints, or user preferences that are not already obvious from shared agent instructions.

Add other sections such as **Commands worth reusing**, **Runtime state**, or **Draft communication** only when they materially help continuation. Omit empty sections.

## Quality bar

- Make the note self-contained enough that a new agent can continue without reading the old chat.
- Prefer precise names, paths, identifiers, timestamps, and links over vague prose.
- Preserve key error messages and measured values when they drive the diagnosis.
- Call out uncertainty explicitly and say how to verify it.
- Avoid giant logs, raw transcripts, exhaustive read/modified-file ledgers, and low-signal history.
- Do not include secrets, tokens, private keys, OAuth state, credentials, or sensitive copied payloads.
- Keep the note compact but complete; normally aim for roughly 1–3 readable pages.

## Completion response

After writing the note, tell the user:

- the exact note path;
- the handoff's one-sentence current state;
- the first one or two next actions.

Surface that concise summary in chat rather than making the local file the only deliverable. Do not end, restart, switch, fork, or compact the session unless the user separately asks.
