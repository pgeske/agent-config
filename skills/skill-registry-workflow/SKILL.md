---
name: skill-registry-workflow
description: Create and maintain shared local skills from ~/projects/skill-registry, then sync them to OpenClaw, Opencode, and Codex using registry-managed installs. OpenClaw uses copied directories while the other targets use symlinks. Use when adding new skills, editing existing skills, or fixing/validating skill links across environments.
---

# Skill Registry Workflow

## Source of truth

- Create and edit skills only in `~/projects/skill-registry/skills/<skill-name>`.
- Do not edit installed copies in agent-specific folders.
- Keep the repo minimal: create the skill directory and `SKILL.md` directly instead of using helper scaffolding scripts.

## Create a skill

1. Create `~/projects/skill-registry/skills/<skill-name>/`.
2. Add `~/projects/skill-registry/skills/<skill-name>/SKILL.md` with frontmatter and instructions.
3. Add any skill-local helpers under that skill directory if needed.
4. Run `~/projects/skill-registry/install.sh <skill-name>`.

## Install

Install everything:

```bash
~/projects/skill-registry/install.sh
```

Install one or more skills:

```bash
~/projects/skill-registry/install.sh my-skill another-skill
```

Replace mismatched entries for symlink-based targets:

```bash
~/projects/skill-registry/install.sh --force
```

Optional cleanup of stale registry-managed links:

```bash
~/projects/skill-registry/install.sh --prune
```

Notes:

- `~/.openclaw/workspace/skills` is installed as copied directories because OpenClaw does not support symlinked skills.
- Rerunning the installer automatically overwrites existing OpenClaw skill copies.
- The `--force` flag is mainly for symlink-based targets when a path already exists and is not registry-managed.

## Targets

Configured in `~/projects/skill-registry/targets.yaml`.
Default targets:

- `~/.openclaw/workspace/skills`
- `~/.opencode/skills`
- `~/.config/opencode/skills`
- `~/.codex/skills`
