---
name: notes-workflow
description: Capture markdown notes into the current user's raw notes inbox. Use when the user asks to create a note, write something down, save a note, or capture a conversation or idea as source material.
---

# Notes Workflow

## When to use

- Use this skill when the user asks you to create a note, save notes, write something down, or capture information in a note file.
- In a second-brain vault, treat this as a raw capture workflow, not a wiki editing workflow.
- Do not use this skill for persistent task or todo management in `~/notes/wiki/tasks.md`; prefer `tasks-workflow` for that.
- Do not use this skill to organize, file, link, ingest, or update the wiki; prefer `wiki-maintainer` for that.

## Default location

- The default note location is the current user's home notes folder.
- Use `~/notes` unless the user says otherwise.
- If `~/notes` does not exist and the user did not specify a path, create `~/notes` and place the note there.
- If the notes root contains `AGENTS.md` plus `raw/` and `wiki/`, treat it as a second-brain vault.
- In a second-brain vault, always write new captures to `raw/captures/` unless the user explicitly asks for a different raw destination.
- Do not write directly into `wiki/` from this skill.

## File format

- Create notes as Markdown files ending in `.md`.
- Use a clear, descriptive filename based on the topic.
- Prefer lowercase kebab-case filenames unless the existing folder clearly uses a different convention.
- Add a date in the filename when it helps disambiguate status notes, meeting notes, or time-specific writeups.

## Note structure

- Start with a meaningful `#` title.
- Add a `Tags:` line immediately below the title with 2-6 Obsidian-style tags based on the note's main themes, for example `Tags: #project-planning #health #ideas`.
- Keep tags lowercase and prefer short kebab-case theme names.
- Organize the body with short sections and bullets when helpful.
- Match the user's request: concise for quick notes, more structured for plans, summaries, or research notes.
- Do not add unnecessary frontmatter unless the user asks for it or the existing notes in that folder rely on it.

## Behavior

- If the user names the note or gives a destination, follow that.
- If they only give a topic, infer a sensible title and filename.
- After creating the note, tell the user the final path.
- If updating an existing note is more appropriate than creating a new one, prefer the existing note when the user's request clearly points to it.
- In a second-brain vault, keep captures close to the source material and avoid heavy transformation or over-organization.
- If the user explicitly asks to edit a wiki page, organize notes, file knowledge, or update the knowledge base, hand off to `wiki-maintainer` instead of doing that work here.
- After creating a raw capture, invoke `wiki-maintainer` in the same turn unless the user explicitly asked for raw-only storage.
- When handing off, pass `wiki-maintainer` the new raw note path and make clear that the raw note is the source of truth.
