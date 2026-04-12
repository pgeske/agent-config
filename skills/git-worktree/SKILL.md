---
name: git-worktree
description: Use when starting non-trivial implementation work in a git repository and an isolated workspace will reduce risk, avoid conflicts, or keep the main tree clean.
---

# Git Worktree

## Overview

Set up an isolated workspace for meaningful implementation work while keeping the source repository clean.

Core principle: prefer safe isolation, but avoid unnecessary repo churn for tiny edits.

## When to Use

- The work spans multiple files.
- The change is risky enough that isolation is helpful.
- Parallel work is happening in the same repository.
- The task is non-trivial and would benefit from a clean baseline.

Do not use this skill for:

- trivial one-file mechanical edits
- repositories that are not git repositories
- situations where the user explicitly asked to stay in the current tree

## Location Priority

1. Use `.worktrees/` if it already exists and is safely ignored.
2. Otherwise use `worktrees/` if it already exists and is safely ignored.
3. Otherwise use `~/.config/opencode/worktrees/<project>/`.

## Safety Rules

- For project-local worktrees, verify the directory is ignored before using it.
- If `.worktrees/` or `worktrees/` is not ignored, fall back to the global managed location instead of silently polluting git status.
- Do not force a repo-local worktree if that requires an unrelated repo change.

## Setup Steps

1. Detect the repo root and project name.
2. Choose the worktree location using the priority rules.
3. Create a branch with a clear task-oriented name.
   - Use the prefix `alyosha/` unless the user explicitly asked for a different branch name.
4. Create the worktree.
5. Run lightweight project setup if needed.
6. Run a relevant baseline verification command before implementation.

## Reporting

After setup, report:

- the worktree path
- the branch name
- whether baseline verification passed

## Common Mistakes

- creating a repo-local worktree in an unignored directory
- using a worktree for a tiny edit that should stay inline
- skipping baseline verification before implementation
- installing from the worktree when the source-of-truth repo path matters
