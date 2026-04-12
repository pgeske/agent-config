---
name: gather-context
description: Gather high-signal context before broad searches. Prefer shell history for command reuse, notes for personal or project-specific context, and targeted repo resolution for code questions outside the current workspace.
version: "0.1.0"
author: alyosha
---

# Gather Context

Use this skill to choose the fastest, highest-signal context sources before falling back to broad search or public web lookups.

## When to use

- Use this skill when the request likely depends on prior local activity, personal notes, repo knowledge, or other context not already present in the current file or working tree.
- Use it before broad scans like grepping `~` or reading large docs when a narrower local source is more likely to answer the question.
- Use it when multiple sources are plausible and parallel subagents can reduce latency.

## Do not use

- Do not invoke this skill when the answer is already in the current file or current repo and a direct read is obviously cheaper.
- Do not start with this skill for purely public, vendor-doc, or syntax-reference questions unless the user clearly expects reuse of local conventions.

## Core rules

1. Start narrow and local.
2. Prefer private sources over web for private or project-specific questions.
3. Never broad-grep the entire home directory as a first move.
4. Only parallelize plausible sources; do not fan out into low-signal searches.
5. Read matched files or repos after search; do not guess from filenames alone.

## Source routing

### Command execution requests

- First check shell history for the command or a close variant.
- Use `python3 scripts/history_search.py "<query>" --json`.
- After history, inspect `--help`, `-h`, or local docs only if history is missing, stale, or ambiguous.
- Use the web only after local command reuse and local help are insufficient.

### Personal, private, or project-memory questions

- Search the notes vault first.
- If the notes vault contains `AGENTS.md` and `wiki/index.md`, read those first and treat `wiki/index.md` as the entry point.
- In second-brain vaults, prefer wiki navigation before broad note search.
- Use `python3 scripts/notes_search.py "<query>" --json`.
- Narrow with tags when useful, for example `--tag obsidian` or `--tag work`.
- Prefer notes over the public web when the answer could reasonably live in a memo, daily note, or project note.
- Use broad note search as fallback when the wiki index does not surface the answer or when you need unmigrated raw or legacy material.

### Code and repository questions

- If the current repo is clearly the target, inspect it directly first.
- Otherwise resolve the most likely repo before searching code.
- Use `python3 scripts/resolve_repo.py "<repo or topic>" --json`.
- Prefer the local clone under `~/projects` when present.
- Use GitHub repo listing as fallback or disambiguation, not as the default replacement for local clones.
- After the repo is identified, search only inside that repo.

### Public knowledge questions

- If the request is mostly public and local context is unlikely to matter, use normal web and repo inspection paths without forcing this skill.

## Parallel subagents

- When two or three sources are genuinely plausible, launch one subagent per source and gather results in parallel.
- Good pairs: notes plus repo resolution, history plus repo resolution, notes plus current repo.
- Do not launch subagents just to search adjacent low-value sources or large generic directories.

## Suggested workflow

1. Classify the request: command reuse, private memory, code context, or public knowledge.
2. Pick one to three high-signal sources.
3. Search those sources with the helper scripts or targeted repo inspection.
4. Read the most relevant results.
5. Answer or implement using the gathered evidence.

## Defaults

- Shell history files: `~/.zsh_history`, `~/.bash_history`, `~/.zhistory`, `~/.histfile`
- Notes root: `~/notes`
- Local repos root: `~/projects`

## Examples

- `What command did I use to list my GitHub repos?` -> search shell history first.
- `What did I do on Thursday?` -> search notes first, especially daily notes and memos.
- `How does alygo task reconciler work?` -> resolve the repo, then inspect that repo instead of grepping the home directory.
