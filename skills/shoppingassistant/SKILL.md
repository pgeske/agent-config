---
name: shoppingassistant
description: Research and shop for products, then add the best Amazon option to cart without checkout. Use when the user asks to shop, buy, find, compare, or add an item to Amazon cart from either a vague need or an exact product name. Always run this skill in a sub-agent because it is multi-step and browser-heavy.
version: "0.1.0"
author: alyosha
dependencies:
  - browser (amazon)
  - sub-agent
---

# shoppingassistant

## Overview

Use this skill to convert a shopping request into a completed Amazon cart action (or an external buy link if Amazon has no good option).

## Workflow

1. **always run in a sub-agent**
   - spawn a sub-agent for every request that triggers this skill.

2. **classify the request**
   - if the user gave an exact product name/model, verify it and go to Amazon evaluation.
   - if the request is general, do research first.

3. **research (for general requests)**
   - read `references/research-checklist.md` and follow it.
   - include:
     - reddit recommendation signal
     - at least one non-reddit web source
     - amazon listing quality/ratings/review volume

4. **choose candidate + fallback**
   - pick the best Amazon option that matches user constraints.
   - keep one fallback Amazon option in case the first listing is unavailable.

5. **amazon action**
   - use browser automation in the `openclaw` profile.
   - assume Amazon is already logged in.
   - if login is missing/blocked, stop and ask user to log in.
   - add item to cart only. **never checkout.**

6. **if Amazon is not viable**
   - if the ideal product is not on Amazon and no strong Amazon alternative exists, do not add a substitute.
   - return an exact external purchase link for the recommended product.

7. **report back**
   - keep the user-facing update concise.
   - include:
     - what was chosen
     - a brief “why this is best” summary tied to the user’s constraints
     - concise research justification (what sources/signals were checked, e.g., Reddit + non-Reddit + Amazon listing quality)
     - price snapshot
     - final action:
       - added to Amazon cart, or
       - external link provided.
