---
name: nomi-factory-ceu
description: Answer Nomi Factory CEU gameplay, progression, automation, and pack-specific questions using the pack's own sources first, then save substantial answers via notes-workflow when they are worth keeping.
---

# Nomi Factory CEU

## When to use

- Use this skill for Nomi Factory CEU questions about progression, recipes, automation, AE2 choices, performance tradeoffs, pack modes, version differences, or pack-specific best practices.
- Use it when generic mod docs are likely to be wrong, incomplete, or misleading because Nomi Factory CEU changes recipes, progression, or recommended patterns.
- Prefer this skill over generic web lookup when the user asks what to do next, how to automate something, whether an approach is good, or what changed in a specific pack release.

## Core rule

- Treat Nomi Factory CEU's own files and docs as the source of truth.
- Do not answer from generic AE2, GregTech, or mod wiki knowledge when pack-specific sources are available.
- If a lower-priority source conflicts with a higher-priority source, say so explicitly and follow the higher-priority source.

## Source priority

Use sources in this order:

1. The user's own notes and prior captures in `~/notes`.
2. The Nomi Factory CEU pack repo: `https://github.com/Nomi-CEu/Nomi-CEu`.
3. Nomi Factory CEU release notes and recipe changelogs.
4. The Nomi Factory CEU wiki.
5. Older Nomifactory guides only for evergreen concepts that still appear compatible.
6. Generic mod docs only as a clearly-labeled fallback.

## Most important pack files

- `overrides/config/betterquesting/DefaultQuests.json` for progression and "what next?" answers.
- `overrides/scripts/*.zs` for recipe and automation changes implemented through ZenScript.
- `overrides/groovy/post/**` for newer pack logic and behavior.
- Release notes and linked recipe changelogs for version-specific differences.
- `README.md` and wiki pages for install, modes, configuration, and pack-maintainer guidance.

## Question routing

- For `what should I do next?` or progression questions, search the questbook first.
- For `how do I make X?`, `how do I automate X?`, or `what's the best way to do X?`, search scripts and Groovy first, then confirm against quests or release notes if relevant.
- For `did this change in version X?`, search release notes and changelogs first.
- For `is this a good idea?` or `why do players avoid X?`, prefer pack docs and the user's notes; if the answer is partly community wisdom, say that clearly.
- For install, mode, launcher, update, or Cleanroom questions, prefer the Nomi Factory CEU wiki and README.

## Answering rules

- Start with the short answer.
- Then explain why the answer is correct in Nomi Factory CEU specifically.
- Name the source type you relied on, such as questbook, scripts, Groovy, release notes, wiki, or notes.
- Mention uncertainty when the pack version or mode matters and you do not know it.
- If expert mode versus normal mode could change the answer, ask or state the assumption.
- If you fall back to old Nomifactory guides or generic mod docs, label that fallback clearly.

## Version and mode handling

- When relevant, identify the user's pack version and whether they are playing normal or expert mode.
- If the question is sensitive to version or mode and the answer would differ materially, ask a short clarification question before giving a definitive answer.
- If the answer is still useful without clarification, give a provisional answer and state the assumption.

## Notes and capture

- If an answer is substantial and worth reusing, invoke `notes-workflow` after answering.
- Good capture candidates include pack-specific best practices, progression advice, performance warnings, version-sensitive caveats, AE2 or automation patterns, and "don't do this" guidance.
- Do not capture trivial one-line lookups or generic facts.
- When capturing, include the question, the answer, the pack version or assumed version, the mode if known, and the source types used.
- Let `notes-workflow` handle raw capture and downstream wiki promotion.

## Practical defaults

- If no local clone exists, fetch from GitHub directly.
- If a local clone of `Nomi-CEu/Nomi-CEu` exists, prefer searching it for speed and reliability.
- Prefer targeted file reads and searches over broad web search.
- Do not treat Discord chatter as authoritative unless it has been captured into notes or another durable source.

## Good output style

- Give the direct recommendation.
- Include the pack-specific reason.
- Cite the source category.
- Add one caveat if version or mode may change the answer.
