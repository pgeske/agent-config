---
name: agent-config-workflow
description: Use when creating or editing shared agent skills, dotfiles, or AGENTS.md in ~/agent-config, or when syncing those files into local agent-specific targets.
---

# Agent Config Workflow

## Source of truth

- Edit shared configuration only in `~/agent-config`.
- Do not edit installed copies in `~/.omp/agent/`, `~/.claude/`, `~/.codex/`, `~/.agents/`, or `~/.config/opencode/`.
- Keep secrets and machine-local credentials out of the repository. OMP's models, authentication, MCP configuration (`~/.omp/agent/mcp.json`), and settings stay machine-local.

## Change a skill, AGENTS.md, or dotfile

1. Edit `~/agent-config/skills/<skill-name>/SKILL.md` (lowercase, hyphenated name with valid `name`/`description` frontmatter), `~/agent-config/AGENTS.md`, or the source under `~/agent-config/dotfiles/`.
2. Preview dotfile changes with `npm run sync:dry-run` when replacing existing files.
3. Run `~/agent-config/bootstrap.sh` to refresh managed links.
4. Run `npm run typecheck && npm test` when install or sync behavior changes.

## Commit and push

1. Review the diff in `~/agent-config`.
2. Commit the cohesive change with signing enabled.
3. Land the commit on `main` and push from `~/agent-config` without asking; don't leave finished changes uncommitted.
4. Never commit generated installed copies from agent-specific config directories.
