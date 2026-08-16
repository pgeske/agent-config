---
name: codex-review
description: Use when the user asks for Codex review, PR review, second-model code review, or when a non-trivial/risky branch needs a final code-review closeout before merge.
---

# Codex Review

Run Pi's `/codex-review` command as a structured closeout review for PRs, branches, commits, and risky local code changes.

## When To Use

- User asks for Codex review, code review, autoreview, or second-model review.
- Before merging a non-trivial PR or branch.
- After fixes from a prior review, to verify the accepted findings are gone.
- For security-sensitive, install/runtime, dependency, data-loss, or concurrency changes.

Skip for tiny docs-only, formatting-only, rename-only, or obviously mechanical edits unless the user asks.

## Commands

Current PR or branch:

```bash
/codex-review
```

Specific base:

```bash
/codex-review --base origin/main
```

Uncommitted local changes:

```bash
/codex-review --uncommitted
```

Single commit:

```bash
/codex-review --commit HEAD
```

Shared PR URL:

```bash
/codex-review https://github.com/owner/repo/pull/123
```

Optional focused prompt:

```bash
/codex-review --base origin/main focus on install/runtime dependency issues
```

## Review Contract

- Treat Codex output as advisory, not authoritative.
- Verify every accepted finding by reading the actual code path and nearby tests.
- Reject speculative, low-impact, style-only, or over-complicated findings.
- If a review finding causes a code change, rerun relevant tests and rerun `/codex-review`.
- Do not push, merge, or mutate GitHub state just to review.
- Report the command used, accepted findings, rejected findings, tests run, and final recommendation.
