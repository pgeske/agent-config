---
name: memo
description: Turn pasted voice memo or rough transcription text into a clean source note in `~/notes/raw/captures/memos`. Use when the user shares dictated transcript text, rambly spoken notes, or asks to distill a voice memo into a note.
version: "0.1.1"
author: alyosha
dependencies:
  - notes-workflow
---

# Memo

Convert messy spoken transcription into a concise, structured note that is easy to revisit later.

## When to use

- Use this skill when the user pastes a transcript from a voice memo, phone dictation, or other spoken capture.
- Use it when the input is long, informal, repetitive, or clearly spoken rather than written.
- Use it when the user wants the transcription distilled into a note instead of preserved verbatim.
- Default behavior: preserve both a distilled note and the raw transcript in the same memo note unless the user asks for a different format.

## Workflow

1. Read the full transcript and identify the main ideas, decisions, action items, questions, and recurring topics.
2. Remove filler, false starts, and repetition while preserving important meaning and any notable phrasing that changes intent.
3. Draft the note content with:
   - a strong title inferred from the content
   - a consistent light-extraction structure that is easy for both humans and future automation to read
   - a clear sense of the main themes so `notes-workflow` can tag the note well
4. By default, the distilled portion of the memo note should include these sections when supported by the source material:
   - `## Summary`
   - `## Key Points`
   - `## Action Items`
   - `## Ideas / Follow-ups`
   - `## Questions` when there are real open questions worth preserving
5. If a section has no meaningful content, omit it rather than adding empty placeholders.
6. Treat this as light extraction only: capture likely actions, ideas, questions, and important points, but do not try to do heavy routing like deduping tasks across memos, writing to long-term memory, assigning priorities, or deciding calendar/todo placement.
7. If parts of the transcript are unclear or contradictory, keep the note useful and briefly mark uncertain points instead of guessing.
8. Save memo notes in `~/notes/raw/captures/memos` instead of the general notes root.
9. If `~/notes/raw/captures/memos` does not exist yet, create it before saving the note.
10. Create the final note via `notes-workflow`, but override its default location so the file is written to `~/notes/raw/captures/memos`; still follow that skill's rules for tags, filename, and final path reporting.
11. By default, append the original transcript at the end of the note in a `## Raw Transcript` section so the cleaned summary and source text live together.
12. If multiple transcript files are provided for one memo, combine them into a single note and preserve all of their raw text in the `## Raw Transcript` section with light separators or subheadings when helpful.
13. Unless the user explicitly asks for raw-only storage, follow memo capture with `wiki-maintainer` in the same turn so durable themes get merged into the wiki promptly.

## Output style

- Distill rather than transcribe in the main sections.
- Prefer clear structure over chronological retelling.
- Keep the note concise but do not omit decisions or next steps.
- Preserve the full raw transcript at the bottom by default, separated from the distilled note.

## Guardrails

- Do not invent facts that are not supported by the transcript.
- Do not over-format short inputs; a brief note is fine when the source is brief.
- If the user asks not to preserve the raw transcript, omit the `## Raw Transcript` section for that memo.
- Do not restate or duplicate `notes-workflow` instructions when that skill already covers note creation behavior.
