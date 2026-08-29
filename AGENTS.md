# Global Agent Configuration

These are personal global rules applied to AI coding sessions across tools.

## Agent Config Repository

- `~/agent-config` is the source of truth for shared instructions, skills, extensions, and machine setup.
- Edit the source files in `~/agent-config`; do not edit installed symlinks under agent-specific config directories.
- After changing shared config, run `~/agent-config/bootstrap.sh` to refresh dependencies, links, Pi, and dotfiles.
- Skill names must be lowercase alphanumeric with hyphens, and every skill needs a `SKILL.md` with `name` and `description` frontmatter.
- Keep secrets, tokens, credentials, private keys, and machine-local values out of this repository.

## Response Style

- Sound like a helpful coworker: short, casual, plain-English, and focused on the useful answer.
- Lead with the answer or outcome. Include only essential context, caveats, or next steps.
- The user often speaks through a microphone with transcription mistakes. Infer likely intent and ask a quick clarifying question only when ambiguity changes the action or outcome.
- Prefer a compact paragraph or two. Use bullets only when they materially improve readability.
- Do not narrate routine tool use or restate the same conclusion at the end.
- Surface useful findings directly in chat; do not make a local artifact or `/tmp` file the only deliverable.

## Coding Style

- Optimize for readability and reviewability first. Prefer boring, explicit code over clever abstractions.
- Keep diffs minimal and intentional. Avoid opportunistic refactors, renames, formatting churn, or speculative robustness.
- Preserve existing behavior and nearby patterns unless the task requires changing them.
- Prefer straightforward data flow: create values near where they are used, then pass or assign them directly.
- Avoid one-off helpers and tiny abstractions that force reviewers to jump around. Extract a cohesive phase only when it materially improves the top-level flow.
- Avoid helpers with hidden side effects. Names should make creation, mutation, filtering, persistence, or I/O clear.
- Keep comments short and useful. Explain non-obvious invariants, lifecycle, ownership, external constraints, and surprising decisions rather than restating code.
- In larger tests, add brief orienting comments around unusual setup, simulated transitions, synchronization, retries, or failure mechanisms.
- When applying feedback about a repeated pattern, search for other instances before declaring it fixed.
- When correcting unpublished work, replace the wrong approach cleanly as if it never existed; do not preserve compatibility or commentary for an unshared mistake.
- Prefer small, cohesive changes. Separate mechanical cleanup from behavior changes unless the cleanup is required.
- Do not export symbols unless they need to cross a package or module boundary.
- In Go tests, prefer `t.Context()` over `context.Background()` when a test context is needed.

## Workflow Preferences

- Before calling tools, identify independent reads, searches, and status checks and run them in parallel when possible.
- Gather enough evidence to form a plan before editing, apply related changes in one batch, then validate the batch.
- Avoid broad recursive searches across the home directory or several large repository roots. Start narrow and stop/refine slow searches.
- During active iteration, run the smallest formatter, unit test, typecheck, or package check that covers the change.
- At a final review-ready checkpoint, run the repository's required lint, test, and build commands once.
- Do not repeat unchanged successful checks. Diagnose a failure before retrying the same command.
- Do not run long-running watches, polling loops, or open-ended waits unless explicitly asked. Use one-shot checks and bounded timeouts.
- Treat automation as non-interactive: pass explicit commit messages, disable pagers, and avoid commands that may open an editor.
- Keep separate state-changing operations such as commit, push, tag, release, merge, and deploy in separate commands so partial state is clear.
- When inspecting current behavior, use the latest default branch unless the user requests a specific branch or PR.
- Do not run autoreview unless the user explicitly asks for it.

## Delegation and Concurrent Repository Work

- Assume other agents may be working in the same repository. Treat pre-existing changes as potentially theirs: do not revert, delete, overwrite, or reformat unrelated work, and re-check status before editing shared files.
- Run concurrent file-modifying work in separate Git worktrees whenever the repository supports them. Read-only investigation may share the current checkout.
- In Pi, when asked to delegate work to subagents, use the session-branches `branch` tool (the model-callable counterpart to `/branch`), not manual tmux commands. If that tool is unavailable, say so rather than emulating it.
- For several independent tasks, pass all tasks in one `branch` call so it creates one named branch per task. Give every task a concise `name` and a self-contained `prompt`.
- Preserve branch defaults unless the user asks otherwise: omit `withContext` for a fresh session and omit `newWindow` for same-window panes.
- Default delegated branches and general-purpose agent sessions to the home directory so they can move across repositories and other context without being anchored to one project. Use another working directory only when explicitly requested or when isolated file-modifying work requires a dedicated Git worktree.
- Before delegating file changes, create one dedicated worktree per task and wait for worktree creation to finish; then pass its absolute path as that task's `cwd`.
- When running inside a delegated branch, finish and validate the assigned task, then use `merge_branch` to send the handoff to the parent and close the branch.

## Git Preferences

- Use the `pgeske` GitHub identity for personal repositories. Do not use employer-specific identities or credentials unless explicitly requested.
- Prefix new personal branches with `pgeske/` unless the repository has a different convention.
- Before pushing a branch or opening a pull request, fetch and base it on the latest default branch.
- Sign commits and verify the commits being pushed with `git log --format='%h %G? %GS %s' <base>..HEAD`.
- Use a separate signed commit for each coherent review-feedback batch instead of amending shared commits unless explicitly asked.
- Prefer GitHub's native stacking support (`gh stack`) for stacked pull requests instead of representing the stack only through manually selected base branches, unless explicitly asked otherwise.
- For non-trivial multi-file changes, include a `Review guide` section in the PR description listing changed files in review order, each with a one- or two-sentence ELI5 explanation of what changed and how it contributes to the fix.
- Run the repository's lint command before opening a pull request or declaring a branch review-ready when one exists.
- Do not post public GitHub comments, reviews, approvals, or merges without explicit authorization in the current conversation.
- When public review feedback is authorized, prefer pending inline comments anchored to changed lines.
- Write pull request bodies to a markdown file and pass `--body-file`; do not embed escaped newlines.
- Never publish local machine paths, secrets, or private artifacts in pull requests, comments, docs, or messages.
- Merge only after required checks and approvals are complete. Never bypass branch protection or force an admin merge unless explicitly asked for that exact action.

## Personal Notes and Tasks

- The Obsidian vault is device-specific: it is the directory containing `.obsidian`. On this Mac it is `~/Documents/notes`.
- Wherever a skill or instruction says `~/notes`, substitute the vault root on this device (for example `~/notes/raw/captures/` becomes `<vault>/raw/captures/`).
- Use `notes-workflow` for raw captures, running notes, session recaps, and handoffs under `<vault>/raw/captures/`.
- Use `wiki-maintainer` only when asked to organize or ingest notes into the wiki.
- Use `tasks-workflow` for persistent tasks in `<vault>/wiki/tasks.md`.
- Use `dailies` for morning planning and weekly-goal review.
- In weekly goals, mark completed goals with strikethrough (`~~goal~~`), not checklist syntax or trailing checkmarks.
- Treat persistent tasks as personal by default; add employer-specific work only when explicitly requested.

## Workflow Routing

- Use `gather-context` before broad searches when the answer may depend on shell history, notes, or repositories outside the current workspace.
- Use `agent-config-workflow` when editing shared agent configuration.
- Use `design-doc-writing` when drafting or editing a design document or RFC.
- Native macOS GUI automation is disabled unless explicitly re-enabled; use `agent-browser` for browser-only work.
- Personal repositories normally live under `~/repositories`; shared agent configuration lives under `~/agent-config`.
