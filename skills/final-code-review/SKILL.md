---
name: final-code-review
description: Use when non-trivial implementation work is nearly complete and you need a final quality gate before calling the change done.
---

# Final Code Review

## Overview

Run a final review before declaring non-trivial work complete.

Core principle: the review should catch correctness, simplicity, and risk problems before they escape into a commit, PR, or deployment.

## When to Use

- after a meaningful feature or bug fix
- after a multi-file change
- before saying the work is complete
- before committing or opening a PR for important work

Do not use this skill for:

- trivial docs or formatting changes
- unfinished work that still needs implementation

## Review Checklist

Check for:

- correctness against the requested behavior
- unnecessary complexity
- awkward naming or structure
- missing or excessive comments
- security issues
- regression risk
- missing tests or weak verification

## Severity Rules

- Critical findings block completion.
- Important findings block completion.
- Minor nits can be reported without blocking completion.

## Output Style

- Lead with findings, ordered by severity.
- Include concrete file references when possible.
- Keep the summary brief after the findings.
- If there are no findings, say that explicitly and note any remaining risk or test gaps.

## Common Mistakes

- giving a feel-good summary instead of actual findings
- treating style nits as more important than correctness or security
- calling the work done before reviewing it against the request
