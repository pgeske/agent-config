---
name: requirements-clarity
description: Use when a non-trivial implementation request is underspecified, ambiguous, or has multiple valid approaches and you need focused clarification before coding.
---

# Requirements Clarity

## Overview

Turn fuzzy implementation requests into clear, buildable requirements without turning the conversation into a heavyweight interview.

Core principle: ask only the questions that materially change what you will build.

## When to Use

- The user asked for a feature, bug fix, or behavior change, but key details are missing.
- Multiple reasonable approaches exist and the choice affects implementation.
- You need confirmation on scope, constraints, or success criteria before coding.

Do not use this skill for:

- obvious mechanical edits
- formatting, comments, or docs-only changes
- requests that are already sufficiently specific

## Process

1. Identify the minimum missing decisions that actually matter.
2. Ask focused questions one at a time when possible.
3. Prefer multiple-choice questions over open-ended questions when practical.
4. Put the recommended option first and explain it briefly.
5. Stop once the request is clear enough to implement.

## Rules

- Do not ask questions just to be thorough.
- Do not ask the user to redesign the system for you.
- Do not offer a menu of equal options without a recommendation.
- If the request is already clear, skip clarification and proceed.

## Good Question Pattern

Use this structure when a choice matters:

```text
Recommended: Option A because it is the smallest change and matches the current behavior.

Which should we do?
1. Option A
2. Option B
3. Option C
```

## Common Mistakes

- Asking five questions when one would unlock the work
- Asking broad product questions for a narrow bug fix
- Presenting options without a recommendation
- Continuing to clarify after the requirements are already good enough
