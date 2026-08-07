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

## Tmux and Subagents

- When asked to spin up a subagent, use a separate Pi session in tmux and follow the `tmux-subagent` skill.
- Start subagents from `~` by default unless a specific repository or worktree is requested.
- For a same-window subagent, create or stack a right-side pane in the window that was active when requested.
- For a new-window subagent, use a concise human-readable tmux window name and matching `pi --name` session name.
- Always use stable tmux pane/window IDs for create, close, rename, and send-keys operations; never rely on the implicit current pane.
- For follow-up prompts, use a one-line instruction or write detailed text to a temporary file and tell the subagent to read it.
- Subagents must return a concise result in their session; local files may be supporting artifacts but not the only deliverable.

## Git Preferences

- Use the `pgeske` GitHub identity for personal repositories. Do not use employer-specific identities or credentials unless explicitly requested.
- Prefix new personal branches with `pgeske/` unless the repository has a different convention.
- Before pushing a branch or opening a pull request, fetch and base it on the latest default branch.
- Sign commits and verify the commits being pushed with `git log --format='%h %G? %GS %s' <base>..HEAD`.
- Use a separate signed commit for each coherent review-feedback batch instead of amending shared commits unless explicitly asked.
- Run the repository's lint command before opening a pull request or declaring a branch review-ready when one exists.
- Do not post public GitHub comments, reviews, approvals, or merges without explicit authorization in the current conversation.
- When public review feedback is authorized, prefer pending inline comments anchored to changed lines.
- Write pull request bodies to a markdown file and pass `--body-file`; do not embed escaped newlines.
- Never publish local machine paths, secrets, or private artifacts in pull requests, comments, docs, or messages.
- Merge only after required checks and approvals are complete. Never bypass branch protection or force an admin merge unless explicitly asked for that exact action.

## Personal Notes and Tasks

- Use `notes-workflow` for raw captures, running notes, session recaps, and handoffs under `~/notes/raw/captures/`.
- Use `wiki-maintainer` only when asked to organize or ingest notes into the wiki.
- Use `tasks-workflow` for persistent tasks in `~/notes/wiki/tasks.md`.
- Use `dailies` for morning planning and weekly-goal review.
- In weekly goals, mark completed goals with strikethrough (`~~goal~~`), not checklist syntax or trailing checkmarks.
- Treat persistent tasks as personal by default; add employer-specific work only when explicitly requested.

## Workflow Routing

- Use `development-workflow` for non-trivial implementation work that should have a plan and tests.
- Use `gather-context` before broad searches when the answer may depend on shell history, notes, or repositories outside the current workspace.
- Use `agent-config-workflow` when editing shared agent configuration.
- Use `design-doc-writing` when drafting or editing a design document or RFC.
- Personal repositories normally live under `~/repositories`; shared agent configuration lives under `~/agent-config`.
