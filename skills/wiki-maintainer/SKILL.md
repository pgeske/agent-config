---
name: wiki-maintainer
description: Compile raw captures and legacy notes into a linked wiki in the user's notes vault. Use when the user asks to organize notes, file something into the knowledge base, ingest captures, or update the wiki.
---

# Wiki Maintainer

## When to use

- Use this skill when the user asks to organize notes, ingest recent captures, file something into the wiki, link notes together, or update the knowledge base.
- Use it after rough capture when the user wants durable knowledge instead of just a saved source note.
- In a second-brain vault, it is the default follow-up after capture unless the user asked for raw-only storage.

## Vault assumptions

- Use `~/notes`.
- Expect a second-brain layout with `AGENTS.md`, `raw/`, and `wiki/`.
- Read `AGENTS.md` and `wiki/index.md` before making changes.

## Core rules

- `raw/` is immutable source material.
- `raw/legacy/` stores migrated legacy notes and older memo material until compiled.
- `raw/archive/` stores raw notes that should remain available but are no longer in the active migration backlog.
- `tasks.md`, `shopping.md`, and `Home.md` are normal vault files and may be linked from the wiki index when relevant.
- Prefer updating existing wiki pages over creating duplicates.
- Always update `wiki/index.md` and `wiki/log.md` when the wiki changes.
- Treat graph quality as part of correctness, not optional polish.
- Prefer a small number of well-linked durable pages over many isolated pages.

## Ingest workflow

1. Read the source capture or legacy note.
2. Identify the smallest useful set of destination wiki pages.
3. Create or update those wiki pages.
4. Add or improve cross-links on both the changed page and any directly related pages.
5. Update `wiki/index.md` so the pages remain discoverable.
6. Append a concise entry to `wiki/log.md` describing the ingest.

## Linking rules

- Every wiki page should link back to `[[index|Wiki Index]]` near the top or in a clearly visible navigation section.
- Every wiki page should have a `## Related` section unless the page is so small that inline links already make the relationships obvious.
- Prefer meaningful `[[wikilinks]]` to other wiki pages over plain text mentions of topics that already have pages.
- When a page is updated, add or refresh links to the 2-5 most relevant related pages if they exist.
- When creating a new page, also update at least one existing related page so the new page is not orphaned.
- Link operational files like `[[tasks|Tasks]]` or `[[shopping|Shopping]]` when the page naturally produces actions or purchases.
- Avoid link spam: only add links that improve navigation, retrieval, or graph structure.
- If a concept appears often enough to deserve a page but does not have one yet, mention it plainly for now instead of inventing a stub page with no substance.

## Page conventions

- Use lowercase kebab-case filenames.
- Start pages with a clear `#` title.
- Keep pages concise and skimmable.
- Add a `## Sources` section when provenance matters.
- Record contradictions explicitly instead of flattening them away.
- Prefer merged topic pages when they produce a clearer graph than many tiny notes.
- Avoid leaving orphan pages that are reachable only from search.

## Query support

- When answering note questions, start from `wiki/index.md` and then read the linked wiki pages.
- Fall back to raw captures or legacy notes only when the wiki does not yet contain the answer.
