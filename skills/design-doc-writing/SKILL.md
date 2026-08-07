---
name: design-doc-writing
description: Use when drafting, structuring, or editing a design doc or RFC, including in a notes vault before publishing it for review. Captures preferences for structure, length, tense, prose style, and diagrams so docs need fewer editing cycles.
---

# Design Doc / RFC Writing

Preferences for writing design docs and RFCs. The goal is a doc that is short, easy to consume, explicit, and well-structured, with strong flow from section to section.

## Workflow

- Draft in the notes vault first as a raw capture under `~/notes/raw/captures/`. Publish it to the team's shared documentation system only when it is ready for review.
- Use strong existing RFCs from the same project or organization as style templates.
- When publishing, let the page title carry the document title, start the body at the first real section, and keep it as a draft until the author is ready to share it.

## Structure

Default arc:

1. **Background** — brief context on the current state and how things work today.
2. **Problem** — why this is worth solving, framed as a short set of concrete weaknesses (bolded lead-ins). One-sentence intro that hints at the problems without enumerating a count.
3. **Solution** — the high-level shape first ("at a high level, this has N parts"), before any technical depth.
4. **Technical design** — lead with a diagram, then short named subsections, one per moving part.
5. **Implementation plan** — an ordered, concrete, dependency-ordered task list. Lead with a sentence on the overall size/effort if it helps set expectations.
6. **Alternatives considered / Open questions** — what was weighed, and the honest unknowns.

## Length and density

- Target 1–2 pages. Be concise.
- Trim aggressively. Cut details that don't earn their place.
- Don't over-explain the obvious (e.g. don't define what feature flags are).
- The Background and Problem are the most-read sections — make them especially tight and readable.

## Framing and tense

- For a system that does not exist yet, use future tense ("the controller will read…"), not present tense that implies it already exists.
- Don't write defensively or reference content that was removed or changed ("no backwards-compatibility in writing"). State things positively; the reader has no memory of prior drafts.
- Avoid essay-isms like "There are four main issues." Don't enumerate a count in a lead-in.
- Emphasize the right focus, not just technically-correct facts. Lead with what matters (e.g. "we will build a new X that does Y").

## Sentence-level style

- Be explicit, direct, and simple. Lead with the important point; don't bury it.
- Don't open sentences with "Because…"; state the point first, then the reason.
- Read it aloud — if it's awkward aloud, rework it.
- No repeated words or restated ideas in close proximity.
- Use precise, consistent terminology. Refer to things by their real/official names; avoid vague or awkward referents like "the service" or "the webhooks."
- Section openers should hint at what's coming without being too on-the-nose (don't just restate the bullet headers) or too vague. Gripping, but not high-school-essay.
- Headers should highlight the key point.
- Flow matters: each section should build on the last and connect back to earlier ideas.

## Diagrams

- Use ASCII or Mermaid depending on what the user asks for.
- ASCII: best for architecture diagrams embedded in a code block; alignment matters, so build them carefully (a generator is fine for guaranteeing column alignment). Keep them simple and gripping — a reader should get the whole vibe at a glance.
- Mermaid: good for flow, sequence, and state diagrams when the target documentation system supports it.
- A diagram's job at the top of Technical design is the "glance and get it" overview, not exhaustive detail.

## Ethos

- Make it good, don't overdo it. When in doubt, simpler and shorter.
- Expect iteration, but bias toward getting structure, tense, and focus right the first time to cut editing cycles.
