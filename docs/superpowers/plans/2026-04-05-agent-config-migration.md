# Agent Config Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename `skill-registry` to `agent-config`, add repo-managed `AGENTS.md` installation for OpenCode, and rename the workflow skill so future config changes are edited, committed, and pushed from the new source-of-truth repo.

**Architecture:** Keep the repo simple: a root `AGENTS.md`, the existing `skills/` tree, and one installer that manages both skills and the shared OpenCode `AGENTS.md`. Implement the new installer behavior with shell integration tests first, then update docs and workflow naming, and finally perform a careful repo/worktree rename with verification.

**Tech Stack:** Bash, git, GitHub CLI, markdown skills

---

## File Map

- Create: `/home/alyosha/projects/skill-registry/tests/install.sh`
- Create: `/home/alyosha/projects/skill-registry/AGENTS.md`
- Modify: `/home/alyosha/projects/skill-registry/install.sh`
- Modify: `/home/alyosha/projects/skill-registry/README.md`
- Move: `/home/alyosha/projects/skill-registry/skills/skill-registry-workflow/` -> `/home/alyosha/projects/skill-registry/skills/agent-config-workflow/`
- Modify after move: `/home/alyosha/projects/agent-config/skills/agent-config-workflow/SKILL.md`
- Verify symlink target: `/home/alyosha/.config/opencode/AGENTS.md`
- Move worktree parent: `/home/alyosha/.config/superpowers/worktrees/skill-registry/` -> `/home/alyosha/.config/superpowers/worktrees/agent-config/`

## Task 1: Add Failing Installer Integration Tests

**Files:**
- Create: `/home/alyosha/projects/skill-registry/tests/install.sh`
- Test: `/home/alyosha/projects/skill-registry/tests/install.sh`

- [ ] **Step 1: Write the failing integration test script**

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)

run_install() {
  local home_dir="$1"
  shift
  HOME="$home_dir" bash "$ROOT_DIR/install.sh" "$@"
}

assert_symlink_target() {
  local path="$1"
  local expected="$2"

  [[ -L "$path" ]] || {
    printf 'expected symlink: %s\n' "$path" >&2
    return 1
  }

  [[ $(readlink -f "$path") == "$expected" ]] || {
    printf 'unexpected symlink target for %s: %s\n' "$path" "$(readlink -f "$path")" >&2
    printf 'expected: %s\n' "$expected" >&2
    return 1
  }
}

test_install_all_creates_opencode_agents_symlink() (
  local home_dir
  home_dir=$(mktemp -d)
  trap 'rm -rf "$home_dir"' EXIT

  run_install "$home_dir"

  assert_symlink_target \
    "$home_dir/.config/opencode/AGENTS.md" \
    "$ROOT_DIR/AGENTS.md"
)

test_named_skill_install_still_installs_agents() (
  local home_dir
  home_dir=$(mktemp -d)
  trap 'rm -rf "$home_dir"' EXIT

  run_install "$home_dir" testskill

  assert_symlink_target \
    "$home_dir/.config/opencode/AGENTS.md" \
    "$ROOT_DIR/AGENTS.md"

  assert_symlink_target \
    "$home_dir/.config/opencode/skills/testskill" \
    "$ROOT_DIR/skills/testskill"
)

test_existing_unmanaged_agents_file_requires_force() (
  local home_dir
  local output

  home_dir=$(mktemp -d)
  trap 'rm -rf "$home_dir"' EXIT

  mkdir -p "$home_dir/.config/opencode"
  printf 'local-only\n' > "$home_dir/.config/opencode/AGENTS.md"

  if output=$(run_install "$home_dir" 2>&1); then
    printf 'expected install to fail without --force\n' >&2
    return 1
  fi

  case "$output" in
    *"exists (use --force to replace): $home_dir/.config/opencode/AGENTS.md"*)
      ;;
    *)
      printf 'unexpected error output:\n%s\n' "$output" >&2
      return 1
      ;;
  esac

  run_install "$home_dir" --force >/dev/null

  assert_symlink_target \
    "$home_dir/.config/opencode/AGENTS.md" \
    "$ROOT_DIR/AGENTS.md"
)

main() {
  test_install_all_creates_opencode_agents_symlink
  test_named_skill_install_still_installs_agents
  test_existing_unmanaged_agents_file_requires_force
  printf 'all installer checks passed\n'
}

main "$@"
```

- [ ] **Step 2: Make the test script executable**

Run: `chmod +x "/home/alyosha/projects/skill-registry/tests/install.sh"`
Expected: no output

- [ ] **Step 3: Run the test to verify it fails**

Run: `bash "/home/alyosha/projects/skill-registry/tests/install.sh"`
Expected: FAIL because `install.sh` does not yet create `~/.config/opencode/AGENTS.md`

- [ ] **Step 4: Commit the failing test scaffold**

```bash
git -C "/home/alyosha/projects/skill-registry" add tests/install.sh
git -C "/home/alyosha/projects/skill-registry" commit -m "test: cover AGENTS install behavior"
```

## Task 2: Implement Repo-Managed AGENTS Installation

**Files:**
- Create: `/home/alyosha/projects/skill-registry/AGENTS.md`
- Modify: `/home/alyosha/projects/skill-registry/install.sh`
- Test: `/home/alyosha/projects/skill-registry/tests/install.sh`

- [ ] **Step 1: Seed the new repo-root AGENTS.md from the current OpenCode file**

Run: `cp "/home/alyosha/.config/opencode/AGENTS.md" "/home/alyosha/projects/skill-registry/AGENTS.md"`
Expected: `/home/alyosha/projects/skill-registry/AGENTS.md` exists with the same content as the current OpenCode file

- [ ] **Step 2: Update `install.sh` usage text and add AGENTS constants**

Replace the top-of-file setup with this exact code:

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
SKILLS_DIR="$ROOT_DIR/skills"
TARGETS_FILE="$ROOT_DIR/targets.yaml"
AGENTS_SOURCE="$ROOT_DIR/AGENTS.md"
AGENTS_TARGET_RAW="~/.config/opencode/AGENTS.md"

usage() {
  cat <<'EOF'
Usage: ./install.sh [--force] [--prune] [skill ...]

Install managed skills and shared agent config.

Options:
  --force  Replace existing files or directories for symlink-based targets
  --prune  Remove stale registry-managed links not in the selected set
  --help   Show this help message
EOF
}
```

- [ ] **Step 3: Add a reusable managed-symlink helper and validate `AGENTS.md` exists**

Insert this exact code after `contains_skill()` and before the counters are initialized:

```bash
install_managed_symlink() {
  local src="$1"
  local dst="$2"

  mkdir -p "$(dirname "$dst")"

  if [[ -e "$dst" || -L "$dst" ]]; then
    if [[ -L "$dst" ]] && [[ $(readlink -f "$dst" || true) == "$src" ]]; then
      skipped=$((skipped + 1))
      return 0
    fi

    if [[ $force -ne 1 ]]; then
      printf '  ! exists (use --force to replace): %s\n' "$dst"
      return 2
    fi

    rm -rf "$dst"
    updated=$((updated + 1))
  else
    created=$((created + 1))
  fi

  ln -s "$src" "$dst"
  printf '  linked %s -> %s\n' "$dst" "$src"
}

if [[ ! -f "$AGENTS_SOURCE" ]]; then
  printf 'Missing shared AGENTS.md: %s\n' "$AGENTS_SOURCE" >&2
  exit 1
fi
```

- [ ] **Step 4: Install the managed AGENTS symlink after the skill loop**

Replace the final summary block with this exact code:

```bash
agents_target=$(expand_path "$AGENTS_TARGET_RAW")

printf '\n==> %s\n' "$agents_target"
if ! install_managed_symlink "$AGENTS_SOURCE" "$agents_target"; then
  exit 1
fi

printf '\nDone. created=%s updated=%s skipped=%s\n' "$created" "$updated" "$skipped"
```

- [ ] **Step 5: Run the integration test to verify it passes**

Run: `bash "/home/alyosha/projects/skill-registry/tests/install.sh"`
Expected: PASS with `all installer checks passed`

- [ ] **Step 6: Run install help to verify the new description**

Run: `bash "/home/alyosha/projects/skill-registry/install.sh" --help`
Expected: help text includes `Install managed skills and shared agent config.`

- [ ] **Step 7: Commit the installer and shared AGENTS source**

```bash
git -C "/home/alyosha/projects/skill-registry" add AGENTS.md install.sh tests/install.sh
git -C "/home/alyosha/projects/skill-registry" commit -m "feat: manage shared agent config installs"
```

## Task 3: Rename the Workflow Skill and Update Repo Docs

**Files:**
- Move: `/home/alyosha/projects/skill-registry/skills/skill-registry-workflow/` -> `/home/alyosha/projects/skill-registry/skills/agent-config-workflow/`
- Modify: `/home/alyosha/projects/skill-registry/skills/agent-config-workflow/SKILL.md`
- Modify: `/home/alyosha/projects/skill-registry/README.md`
- Test: `/home/alyosha/projects/skill-registry/install.sh`

- [ ] **Step 1: Rename the workflow skill directory with git**

Run: `git -C "/home/alyosha/projects/skill-registry" mv skills/skill-registry-workflow skills/agent-config-workflow`
Expected: the skill directory is renamed in git index and working tree

- [ ] **Step 2: Replace the workflow skill file with this exact content**

```markdown
---
name: agent-config-workflow
description: Use when creating or editing shared agent skills or the shared AGENTS.md in ~/projects/agent-config, or when syncing those managed files into local agent-specific targets.
---

# Agent Config Workflow

## Source of truth

- Create and edit skills only in `~/projects/agent-config/skills/<skill-name>`.
- Create and edit the shared instructions file only in `~/projects/agent-config/AGENTS.md`.
- Commit config changes in `~/projects/agent-config`; do not commit generated installed copies from agent-specific folders.
- Push the branch from `~/projects/agent-config` directly when you want the config shared, unless your human partner explicitly asks for a PR workflow.
- Do not edit installed copies in agent-specific folders.
- Keep the repo minimal: add only the files needed for shared agent config.

## Create or update a skill

1. Create or edit `~/projects/agent-config/skills/<skill-name>/SKILL.md`.
2. Add any skill-local helpers under that skill directory if needed.
3. Run `~/projects/agent-config/install.sh <skill-name>`.

## Update shared AGENTS.md

1. Edit `~/projects/agent-config/AGENTS.md`.
2. Run `~/projects/agent-config/install.sh`.
3. Verify `~/.config/opencode/AGENTS.md` points at the repo source.

## Commit and push

1. Review the diff in `~/projects/agent-config`.
2. Commit the config change in `~/projects/agent-config`.
3. Push that branch directly from `~/projects/agent-config` unless your human partner asks for a different flow.
4. Never commit installed copies from `~/.openclaw/workspace/skills`, `~/.opencode/skills`, `~/.config/opencode/skills`, `~/.codex/skills`, or `~/.config/opencode/AGENTS.md`.

## Install

Install everything:

```bash
~/projects/agent-config/install.sh
```

Install one or more skills:

```bash
~/projects/agent-config/install.sh my-skill another-skill
```

Replace mismatched managed targets:

```bash
~/projects/agent-config/install.sh --force
```

Optional cleanup of stale registry-managed skill links:

```bash
~/projects/agent-config/install.sh --prune
```

## Targets

Configured in `~/projects/agent-config/targets.yaml`.
Default skill targets:

- `~/.openclaw/workspace/skills`
- `~/.opencode/skills`
- `~/.config/opencode/skills`
- `~/.codex/skills`

Managed shared config target:

- `~/.config/opencode/AGENTS.md`
```

- [ ] **Step 3: Replace the README with this exact content**

```markdown
# Agent Config

Shared agent configuration and reusable skills.

## Structure

- `AGENTS.md` - Shared instructions source installed into `~/.config/opencode/AGENTS.md`
- `skills/` - Reusable skills and capabilities

## Usage

### Source of truth

Create and edit shared agent config only in this repo:

- `~/projects/agent-config/AGENTS.md`
- `~/projects/agent-config/skills/<skill-name>`

### Tooling

- Install managed config and all skills:
  - `./install.sh`
- Install managed config plus one or more named skills:
  - `./install.sh my-skill another-skill`
- Replace mismatched managed targets:
  - `./install.sh --force`
- Remove stale registry-managed skill links while installing:
  - `./install.sh --prune`

OpenClaw skill targets are installed as copied directories, not symlinks, so rerunning `./install.sh` overwrites existing skill copies there automatically.

### Target config

Edit `targets.yaml` for skill destination directories. The shared OpenCode `AGENTS.md` target is managed directly by `install.sh`.
```

- [ ] **Step 4: Run targeted install for the renamed workflow skill**

Run: `bash "/home/alyosha/projects/skill-registry/install.sh" agent-config-workflow --force`
Expected: the renamed skill installs successfully and the managed `AGENTS.md` symlink is refreshed if needed

- [ ] **Step 5: Re-run the installer integration test**

Run: `bash "/home/alyosha/projects/skill-registry/tests/install.sh"`
Expected: PASS with `all installer checks passed`

- [ ] **Step 6: Commit the workflow/doc rename**

```bash
git -C "/home/alyosha/projects/skill-registry" add README.md skills/agent-config-workflow/SKILL.md
git -C "/home/alyosha/projects/skill-registry" commit -m "refactor: rename workflow around agent config"
```

## Task 4: Rename the Repo and Repair Linked Worktrees

**Files and paths:**
- Move: `/home/alyosha/projects/skill-registry` -> `/home/alyosha/projects/agent-config`
- Move: `/home/alyosha/.config/superpowers/worktrees/skill-registry` -> `/home/alyosha/.config/superpowers/worktrees/agent-config`
- Verify git admin for linked worktrees under the moved repo

- [ ] **Step 1: Rename the GitHub repo**

Run: `gh repo rename agent-config --repo pgeske/skill-registry --yes`
Expected: GitHub repo name changes from `skill-registry` to `agent-config`

- [ ] **Step 2: Update the local remote URL explicitly**

Run: `git -C "/home/alyosha/projects/skill-registry" remote set-url origin "https://github.com/pgeske/agent-config.git"`
Expected: `git remote get-url origin` returns the new `agent-config` URL

- [ ] **Step 3: Move the main local checkout**

Run: `mv "/home/alyosha/projects/skill-registry" "/home/alyosha/projects/agent-config"`
Expected: the repo now lives at `/home/alyosha/projects/agent-config`

- [ ] **Step 4: Move the linked worktree parent directory to match the new repo name**

Run: `mv "/home/alyosha/.config/superpowers/worktrees/skill-registry" "/home/alyosha/.config/superpowers/worktrees/agent-config"`
Expected: both linked worktrees now live under `/home/alyosha/.config/superpowers/worktrees/agent-config/`

- [ ] **Step 5: Repair git worktree metadata after the manual moves**

Run: `git -C "/home/alyosha/projects/agent-config" worktree repair "/home/alyosha/projects/agent-config" "/home/alyosha/.config/superpowers/worktrees/agent-config/agent-browser-headed-display" "/home/alyosha/.config/superpowers/worktrees/agent-config/browser-agent-reset"`
Expected: no output or only repair notices, with all paths updated to the new repo location

- [ ] **Step 6: Verify the repo and worktrees now report the new paths**

Run: `git -C "/home/alyosha/projects/agent-config" worktree list --porcelain`
Expected: output shows `/home/alyosha/projects/agent-config` and `/home/alyosha/.config/superpowers/worktrees/agent-config/...`

- [ ] **Step 7: Commit any path-reference changes left in git after the move**

```bash
git -C "/home/alyosha/projects/agent-config" status --short
if [[ -n $(git -C "/home/alyosha/projects/agent-config" status --short) ]]; then
  git -C "/home/alyosha/projects/agent-config" commit -am "docs: switch repo naming to agent-config"
fi
```

## Task 5: Verify Managed AGENTS Installation and Idempotence

**Files and paths:**
- Verify: `/home/alyosha/projects/agent-config/AGENTS.md`
- Verify: `/home/alyosha/.config/opencode/AGENTS.md`
- Verify: `/home/alyosha/projects/agent-config/tests/install.sh`

- [ ] **Step 1: Run the integration test suite from the renamed repo path**

Run: `bash "/home/alyosha/projects/agent-config/tests/install.sh"`
Expected: PASS with `all installer checks passed`

- [ ] **Step 2: Force-install all managed config from the renamed repo**

Run: `bash "/home/alyosha/projects/agent-config/install.sh" --force`
Expected: skills install successfully and `~/.config/opencode/AGENTS.md` is linked to the repo source

- [ ] **Step 3: Verify the installed OpenCode AGENTS target points at the repo source**

Run: `readlink -f "/home/alyosha/.config/opencode/AGENTS.md"`
Expected: `/home/alyosha/projects/agent-config/AGENTS.md`

- [ ] **Step 4: Verify install help and README use the new repo name**

Run: `bash "/home/alyosha/projects/agent-config/install.sh" --help && grep -n "agent-config" "/home/alyosha/projects/agent-config/README.md"`
Expected: help output and README both reference `agent-config`

- [ ] **Step 5: Verify idempotence by rerunning install**

Run: `bash "/home/alyosha/projects/agent-config/install.sh"`
Expected: already-correct managed targets are skipped cleanly without drift

- [ ] **Step 6: Verify clean git state before final push**

Run: `git -C "/home/alyosha/projects/agent-config" status --short`
Expected: no output

- [ ] **Step 7: Push the finished branch**

```bash
git -C "/home/alyosha/projects/agent-config" push -u origin agent-browser-confirmation
```
