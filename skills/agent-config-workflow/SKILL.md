---
name: agent-config-workflow
description: Use when creating or editing shared agent skills, extensions, dotfiles, or AGENTS.md in ~/agent-config, or when syncing those files into local agent-specific targets.
---

# Agent Config Workflow

## Source of truth

- Edit shared configuration only in `~/agent-config`.
- Do not edit installed copies in `~/.config/opencode/`, `~/.claude/`, `~/.codex/`, `~/.agents/`, `~/.pi/agent/`, or Claude Desktop's local skill bundles.
- Keep secrets and machine-local credentials out of the repository.

## Create or update a skill

1. Edit or create `~/agent-config/skills/<skill-name>/SKILL.md`.
2. Use a lowercase alphanumeric, hyphenated skill name and valid `name`/`description` frontmatter.
3. Add helper files under the same skill directory when needed.
4. Run `~/agent-config/bootstrap.sh` to refresh dependencies and managed links.

## Create or update an extension

1. Edit or create `~/agent-config/extensions/<extension-name>/index.ts`.
2. Add runtime dependencies to `~/agent-config/package.json`.
3. Add focused tests under `~/agent-config/tests/` when behavior changes.
4. Run `npm run typecheck` and the relevant tests before shipping.
5. Run `~/agent-config/bootstrap.sh` to install the updated extension.

## Update shared instructions or dotfiles

1. Edit `~/agent-config/AGENTS.md` or the source under `~/agent-config/dotfiles/`.
2. Run `~/agent-config/bootstrap.sh`, or preview dotfile changes with `/config-sync --dry-run` first.
3. Verify installed targets point to the repository source and contain no credentials.

## Commit and push

1. Review the diff in `~/agent-config`.
2. Run affected tests, then the final typecheck/test suite at the review-ready checkpoint.
3. Commit the cohesive change with signing enabled.
4. Push from `~/agent-config` when the change should be shared.
5. Never commit generated installed copies from agent-specific config directories.
