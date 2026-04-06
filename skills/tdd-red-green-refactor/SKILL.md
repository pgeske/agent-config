---
name: tdd-red-green-refactor
description: Use when implementing a feature, bug fix, refactor, or behavior change before writing production code so the work follows an explicit red, green, refactor cycle.
---

# TDD Red Green Refactor

## Overview

Write the failing test first. Watch it fail for the right reason. Write the smallest code that passes. Then refactor with the tests still green.

Core principle: if you did not observe the test fail first, you do not know that it protects the behavior you care about.

## When to Use

- feature work
- bug fixes
- refactors that change behavior or guard against regressions
- any implementation where tests are meaningful

Usually skip this skill for:

- docs-only changes
- comments or formatting
- trivial mechanical edits
- work where tests are genuinely not meaningful

## The Cycle

### Red

- Write or update one failing test for one behavior.
- Run the test.
- Confirm it fails for the expected reason.

### Green

- Make the smallest implementation change that passes the test.
- Run the test again.
- Confirm the target behavior is now green.

### Refactor

- Improve names, remove duplication, and simplify structure.
- Re-run the relevant tests.
- Do not add extra behavior during refactor.

## Rules

- No production code before a failing test for real implementation work.
- One behavior per test whenever possible.
- Fix code, not the test, when the green step fails.
- Keep the implementation minimal until the test passes.

## Red Flags

- "I'll add tests after"
- "This is too small to test"
- "I already tried it manually"
- "The implementation is obvious"

Those all mean: stop and go back to red.

## Common Mistakes

- writing a broad test that covers several behaviors at once
- accepting a passing test that never failed first
- overbuilding during the green step
- sneaking extra changes into the refactor step
