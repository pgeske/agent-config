# Agent Config Design

## Goal

Refactor `skill-registry` into `agent-config` so it becomes the source-of-truth repo for shared agent configuration, starting with reusable skills plus a shared `AGENTS.md` that is installed into `~/.config/opencode/AGENTS.md`.

## Current State

- The repo currently lives at `~/projects/skill-registry`.
- It manages only `skills/` plus a simple installer that links or copies skill directories into configured skill targets.
- `~/.config/opencode/AGENTS.md` is currently a standalone file containing shared user preferences and behavior guidance.
- There is no home-level `~/AGENTS.md`, and the current workflow does not manage any `AGENTS.md` files.

## Desired Outcome

- The repo is renamed to `agent-config` locally and on GitHub.
- The repo becomes the single source of truth for shared agent configuration that should persist in git.
- The root file `~/projects/agent-config/AGENTS.md` becomes the canonical shared instructions file.
- `install.sh` manages both skills and the shared `AGENTS.md`.
- For now, the shared `AGENTS.md` is installed only to `~/.config/opencode/AGENTS.md`.
- The workflow skill is renamed from `skill-registry-workflow` to `agent-config-workflow` and updated so agents know to edit, commit, and push from `~/projects/agent-config`.
- The cutover is clean: no compatibility layer for the old repo name.

## Non-Goals

- Do not add a generic arbitrary-file deployment system.
- Do not manage workspace-specific files like `~/.openclaw/workspace/AGENTS.md` yet.
- Do not add multiple `AGENTS.md` targets yet beyond `~/.config/opencode/AGENTS.md`.
- Do not preserve the old `skill-registry` naming after the migration is complete.

## Repository Layout

After migration, the repo should look like this:

```text
~/projects/agent-config/
  AGENTS.md
  README.md
  install.sh
  targets.yaml
  skills/
    agent-config-workflow/
      SKILL.md
    ...other skills...
  docs/
    superpowers/
      specs/
```

### Layout decisions

- Keep `AGENTS.md` at repo root because it is the primary shared top-level config file and does not need another directory layer.
- Keep `skills/` unchanged because the current structure is already simple and works.
- Keep a single installer instead of separate scripts for skills vs shared config.

## Shared AGENTS.md Model

### Source of truth

- Source file: `~/projects/agent-config/AGENTS.md`
- Initial contents: copy the current contents of `~/.config/opencode/AGENTS.md`

### Installed target

- Installed target for now: `~/.config/opencode/AGENTS.md`
- Installation mode: symlink

### Rationale

- The current OpenCode sessions are clearly using `~/.config/opencode/AGENTS.md`.
- Using the explicit consumed path is more reliable than assuming home-level `~/AGENTS.md` discovery behavior.
- Keeping a single canonical repo file still allows future expansion to other agent-specific targets without changing the source layout.

## Installer Design

### Overview

`install.sh` should manage two classes of artifacts:

- skills under `skills/`
- the shared repo-root `AGENTS.md`

The default install command should continue to be:

```bash
./install.sh
```

That command should install all managed artifacts.

### Skill installation behavior

- Preserve the existing skill install behavior as much as possible.
- Named skill installs such as `./install.sh my-skill another-skill` should continue to work.
- OpenClaw skill targets may still use copy mode if required.
- Symlink-based skill targets should still be skipped when they already point at the managed source.

### AGENTS installation behavior

- `install.sh` should also install the root `AGENTS.md` to `~/.config/opencode/AGENTS.md`.
- If the target is already a symlink to the correct source, leave it untouched.
- If the target exists as a non-managed file and `--force` was not provided, fail with a clear message.
- If `--force` was provided, replace the target with a symlink to the repo-root `AGENTS.md`.
- The installer should treat `AGENTS.md` as a first-class managed artifact instead of a one-off migration step.

### Installer semantics

- `./install.sh` installs all skills plus `AGENTS.md`.
- `./install.sh my-skill` installs the named skill and still installs `AGENTS.md`.
- `--force` allows replacement of unmanaged conflicting destinations.
- `--prune` should continue to apply only to registry-managed skill links unless explicit AGENTS cleanup behavior is later added.

## Workflow Skill Changes

Rename:

- `skills/skill-registry-workflow/` -> `skills/agent-config-workflow/`
- skill name in frontmatter -> `agent-config-workflow`

Update the skill so it explicitly says:

- create and edit skills in `~/projects/agent-config/skills/<skill-name>`
- create and edit the shared instructions file in `~/projects/agent-config/AGENTS.md`
- commit and push changes from `~/projects/agent-config`
- do not edit installed copies in agent-specific folders
- rerun `~/projects/agent-config/install.sh` after changes

### Intent

This makes the workflow discoverable when an agent is asked to update either a skill or the shared `AGENTS.md`, and reduces the chance that local config drifts from the repo.

## Migration Plan

### Repository rename

1. Rename the GitHub repo from `skill-registry` to `agent-config`.
2. Update the local checkout so it lives at `~/projects/agent-config`.
3. Update `origin` to point at the renamed GitHub repo.

### File migration

1. Copy the current contents of `~/.config/opencode/AGENTS.md` into `~/projects/agent-config/AGENTS.md`.
2. Remove or replace the existing `~/.config/opencode/AGENTS.md` with a managed symlink created by `install.sh`.

### Repo content updates

1. Rename skill `skill-registry-workflow` to `agent-config-workflow`.
2. Update README, install help text, and all repo-local path references from `skill-registry` to `agent-config`.
3. Update any docs or examples that imply the repo only manages skills.

### Cutover rule

- This is a clean cutover.
- Do not add compatibility aliases, fallback path handling, or dual naming.

## Error Handling

- Fail clearly if repo-root `AGENTS.md` is missing.
- Fail clearly if a named skill does not exist.
- Fail clearly if `~/.config/opencode/AGENTS.md` exists as an unmanaged file and `--force` was not provided.
- Never silently replace unmanaged files.
- Stop the migration if the repo rename or local move is incomplete rather than half-applying mixed paths.

## Testing and Verification

### Repository verification

- Confirm local path is `~/projects/agent-config`.
- Confirm `origin` points to the renamed GitHub repo.
- Confirm README and installer help output use `agent-config` terminology.

### AGENTS verification

- Run `./install.sh`.
- Confirm `~/.config/opencode/AGENTS.md` exists.
- Confirm it is a symlink.
- Confirm it resolves to `~/projects/agent-config/AGENTS.md`.

### Skill verification

- Confirm `./install.sh my-skill` still installs a named skill correctly.
- Confirm the renamed `agent-config-workflow` installs into the configured skill targets.

### Idempotence verification

- Rerun `./install.sh`.
- Confirm already-correct symlinks remain unchanged.
- Confirm the installer does not create duplicate state or drift.

## Implementation Notes

- Prefer the smallest installer change that introduces first-class `AGENTS.md` management without redesigning the whole script.
- Preserve existing skill install semantics where possible.
- Keep the repo tool-agnostic: the shared `AGENTS.md` is stored centrally, but installation targets remain explicit per tool.

## Open Questions

There are no open design questions for the first cut. Later expansion to additional managed agent-specific files can build on the same pattern if needed.
