---
name: notes-workflow
description: Capture markdown notes into the user's raw notes area. Use when the user asks to create or update a note, take ongoing notes, document or summarize work, write a session recap or handoff, save source material, or capture a conversation or idea.
---

# Notes Workflow

## Default location

- The Obsidian vault is device-specific: it is the directory containing `.obsidian` (on the Mac, `~/Documents/notes`; on other setups, `~/notes`). Use whichever exists on this device.
- Create notes under `<vault>/raw/captures/` unless the user asks for a different location.
- Substitute `<vault>` everywhere a path below says `~/notes`.
- Do not create user-facing notes in a temporary workspace unless the user explicitly asks for that.
- Do not write directly into `wiki/` from this skill.

## Behavior

- Create Markdown notes with a clear title.
- Use a descriptive lowercase kebab-case filename unless the existing folder has another convention.
- Include the date in the filename or note body when it matters.
- Keep this as a raw capture workflow, not a wiki editing workflow.
- Do not automatically hand off to `wiki-maintainer`; organize the wiki only when the user explicitly requests it.
- Prefer updating an existing note when the request clearly points to one.
- After creating or selecting a note, tell the user the exact path.

## Ongoing notes

- If the user asks to keep running notes, create or update one topic-based capture under `~/notes/raw/captures/`.
- Prefer a dated filename such as `2026-08-07-project-rollout-notes.md`.
- Append new entries instead of replacing existing content.
- Keep captures close to the source material and avoid over-processing them.

## Note shape

- Start with `# Title`.
- Include a `Tags:` line when it improves retrieval.
- Use short sections and bullets when useful.
- Match the requested level of detail.
- Do not add unnecessary frontmatter.

Use `tasks-workflow` for persistent todos and `wiki-maintainer` for wiki organization, links, or ingestion.
