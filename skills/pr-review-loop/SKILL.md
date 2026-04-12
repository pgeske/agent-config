---
name: pr-review-loop
description: Use when implementation in a git repository is locally complete and it is time to commit, push, open or update a PR with gh, and carry user feedback rounds on the same review branch.
---

# PR Review Loop

## Overview

Use this skill after the code is implemented, reviewed, and locally verified.

Core principle: do not stop at local completion when the work should be published for review, and finish the loop with the requested merge action when the user approves it.

## When to Use

- after non-trivial git-backed implementation work is locally ready
- when the user should review the change in a PR
- when follow-up feedback should stay on the same review branch
- when the user later wants that reviewed PR merged

Do not use this skill for:

- work outside a git repository
- repos with no viable GitHub remote or no usable `gh` authentication
- trivial changes where the user clearly does not want commit or PR help

## Branch Rules

- Prefer reusing the branch created earlier by `git-worktree`.
- If you stayed inline and no suitable branch exists, create one before committing.
- Branch names should start with `alyosha/` unless the user explicitly asks for something else.
- Do not open the PR from `main`, `master`, or another shared long-lived branch.

## Publish Steps

1. Confirm the work is actually ready.
   - The implementation is done.
   - The final review is done.
   - Relevant verification already passed.
2. Ensure the branch is suitable.
   - Reuse the current feature branch if it is already appropriate.
   - Otherwise create or rename to an `alyosha/<task-name>` branch before publishing.
3. Commit the change.
   - Use one clean commit by default for the reviewable unit of work.
   - Write a concise message that reflects why the change exists.
4. Push the branch.
   - Set upstream if needed.
5. Open or update the PR with `gh`.
   - If no PR exists, create one.
   - If a PR already exists for the branch, update that branch instead of creating a duplicate PR.
6. Share the PR with the user.
   - Return the PR URL.
   - Ask the user to review and respond with feedback.

## Feedback Round Rules

- Treat user feedback as continuation of the same review loop, not as unrelated new work.
- Apply the requested changes, rerun the relevant verification, and update the existing PR branch.
- If the user explicitly asks for a new commit, create a new commit.
- Otherwise prefer amending the current review commit to keep the branch history clean.
- Only amend a commit that you created for this branch.
- If rewriting the branch is needed after it was pushed, use `--force-with-lease`, never plain `--force`.
- If the branch contains commits from someone else, or the history is no longer clearly yours to rewrite, stop and ask before amending.

## Output Expectations

- Tell the user which branch is being used.
- Share the PR URL.
- State whether the PR was newly created or updated.
- On feedback rounds, state that the PR was updated after verification.

## Merge Rules

- Merge only when the user explicitly asks you to merge.
- Prefer a squash merge for this workflow.
- Use the PR description as the squash merge message.
- Reuse the existing PR instead of bypassing it with a direct branch merge.
- If the PR is not mergeable, checks are failing, or the merge message cannot be set from the PR description, stop and tell the user what blocked the merge.

When merging with `gh`:

- use `gh pr merge --squash`
- make the merged commit message match the PR description
- report that the PR was merged

## Common Mistakes

- opening the PR before local verification is complete
- publishing from `main` or `master`
- creating a new PR for each review round
- stacking extra commits for every small user feedback round when the user wanted a clean review branch
- rewriting shared branch history without checking whether it is safe
- merging before the user explicitly approves it
