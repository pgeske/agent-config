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

Install the shared AGENTS.md plus one or more skills:

```bash
~/projects/agent-config/install.sh my-skill another-skill
```

Replace mismatched managed targets:

```bash
~/projects/agent-config/install.sh --force
```

Optional cleanup of stale agent-config-managed skill links:

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
