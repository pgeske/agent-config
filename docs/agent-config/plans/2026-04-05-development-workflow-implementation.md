# Development Workflow Skill Stack Implementation Plan

> **For agentic workers:** Implement this plan in `~/projects/agent-config`, keep the repo as the source of truth, and use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fully owned development workflow skill stack to `agent-config`, install it from the repo source of truth, and remove the legacy workflow plugin and its remaining managed references.

**Architecture:** Add four small helper skills plus one top-level orchestrator skill. Use shell integration checks to prove the new skills install correctly and that managed files stop referring to Superpowers. Keep task breakdown and subagent coordination in the orchestrator for v1.

**Tech Stack:** Markdown skills, Bash installer tests, OpenCode managed config

---

## File Map

- Create: `/home/alyosha/projects/agent-config/skills/requirements-clarity/SKILL.md`
- Create: `/home/alyosha/projects/agent-config/skills/git-worktree/SKILL.md`
- Create: `/home/alyosha/projects/agent-config/skills/tdd-red-green-refactor/SKILL.md`
- Create: `/home/alyosha/projects/agent-config/skills/final-code-review/SKILL.md`
- Create: `/home/alyosha/projects/agent-config/skills/development-workflow/SKILL.md`
- Create: `/home/alyosha/projects/agent-config/docs/agent-config/specs/2026-04-05-development-workflow-design.md`
- Modify: `/home/alyosha/projects/agent-config/AGENTS.md`
- Modify: `/home/alyosha/projects/agent-config/tests/install.sh`
- Delete the legacy docs directory that still carries old plugin references.

## Task 1: Add Failing Installer And Reference Checks

**Files:**
- Modify: `/home/alyosha/projects/agent-config/tests/install.sh`

- [ ] Add a named-install check for `development-workflow`, `requirements-clarity`, `git-worktree`, `tdd-red-green-refactor`, and `final-code-review`.
- [ ] Add a managed-reference check that fails if `AGENTS.md`, `install.sh`, `targets.yaml`, or files under `skills/` still reference the legacy plugin name.
- [ ] Run `bash /home/alyosha/projects/agent-config/tests/install.sh` and confirm it fails before the new skills exist and before the references are cleaned up.

## Task 2: Add The Owned Helper Skills

**Files:**
- Create: `/home/alyosha/projects/agent-config/skills/requirements-clarity/SKILL.md`
- Create: `/home/alyosha/projects/agent-config/skills/git-worktree/SKILL.md`
- Create: `/home/alyosha/projects/agent-config/skills/tdd-red-green-refactor/SKILL.md`
- Create: `/home/alyosha/projects/agent-config/skills/final-code-review/SKILL.md`

- [ ] Create a small `requirements-clarity` skill with one-question-at-a-time clarification and recommended-option-first behavior.
- [ ] Create a small `git-worktree` skill with project-local-then-global worktree selection and safe `.worktrees` handling.
- [ ] Create a small `tdd-red-green-refactor` skill with explicit red, green, and refactor rules.
- [ ] Create a small `final-code-review` skill that blocks completion on critical or important findings.

## Task 3: Add The Top-Level Orchestrator

**Files:**
- Create: `/home/alyosha/projects/agent-config/skills/development-workflow/SKILL.md`
- Modify if needed: `/home/alyosha/projects/agent-config/AGENTS.md`

- [ ] Create `development-workflow` as the explicit entry point for non-trivial implementation work.
- [ ] Make it route through clarification, worktree choice, task breakdown, execution mode choice, TDD, and final review.
- [ ] Keep helper-skill references local to `agent-config` and keep subagent/task breakdown logic inside the orchestrator for v1.
- [ ] Add only a minimal `AGENTS.md` pointer if it is needed for reliable auto-invocation.

## Task 4: Remove Superpowers References From Managed Content

**Files:**
- Create or move: `/home/alyosha/projects/agent-config/docs/agent-config/specs/2026-04-05-development-workflow-design.md`
- Delete the legacy docs tree after the current design/spec is moved into `docs/agent-config/`.
- Review other managed files as needed

- [ ] Move the new design/spec material out of the legacy docs path into `docs/agent-config/`.
- [ ] Remove any remaining legacy-plugin mentions from managed skills and shared config.
- [ ] Leave `.git/` internals alone unless a real workflow problem requires repair.

## Task 5: Install, Verify, And Remove The Local Plugin

**Files:**
- Install from: `/home/alyosha/projects/agent-config`
- Remove local plugin/cache references under the user config tree after verification

- [ ] Run `bash /home/alyosha/projects/agent-config/tests/install.sh` and confirm it passes.
- [ ] Run `~/projects/agent-config/install.sh development-workflow requirements-clarity git-worktree tdd-red-green-refactor final-code-review` from the source repo.
- [ ] Verify the new skills are present in managed install targets.
- [ ] Remove the local Superpowers plugin and any remaining user-level references to it.
- [ ] Re-run the relevant verification commands before claiming completion.
