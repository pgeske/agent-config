---
name: notes-workflow
description: Create markdown notes in the current user's home notes folder. Use when the user asks to create a note, write something down, save a note, or capture notes unless they specify a different destination.
---

# Notes Workflow

## When to use

- Use this skill when the user asks you to create a note, save notes, write something down, or capture information in a note file.
- Do not use this skill for persistent task or todo management in `~/notes/tasks.md`; prefer `tasks-workflow` for that.

## Default location

- The default note location is the current user's home notes folder.
- Use `~/notes` unless the user says otherwise.
- If `~/notes` does not exist and the user did not specify a path, create `~/notes` and place the note there.
- If the notes root contains `AGENTS.md` plus `raw/` and `wiki/`, treat it as a second-brain vault.
- In a second-brain vault, default rough note capture to `raw/captures/` unless the user explicitly asks for a polished wiki page or a different destination.
- In a second-brain vault, default to same-turn wiki filing after capture unless the user explicitly asks for raw-only storage.

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
- In a second-brain vault, keep captures close to the source material instead of over-organizing them.
- If the user asks to organize, file, link, ingest, or update the knowledge base, prefer the `wiki-maintainer` skill after capture.
- In a second-brain vault, if a newly created capture contains durable information and the user did not ask for raw-only storage, invoke `wiki-maintainer` in the same turn.
