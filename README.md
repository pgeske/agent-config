# Agent Config

Personal Pi package plus machine setup dotfiles.

## Goals

- Install Pi once, then install this repo as a Pi package.
- Keep Pi extensions, skills, prompts, themes, and global `AGENTS.md` in one place.
- Sync editor/terminal dotfiles on a fresh machine or an existing machine with the same command.
- Keep secrets and machine-local values out of git.

## Fresh machine

```bash
curl -fsSL https://pi.dev/install.sh | sh
pi install git:git@github.com:pgeske/agent-config
pi
/config-sync --dry-run
/config-sync
```

You can also run the sync script directly from the package checkout:

```bash
node ~/.pi/agent/git/github.com/pgeske/agent-config/scripts/sync.mjs --dry-run
node ~/.pi/agent/git/github.com/pgeske/agent-config/scripts/sync.mjs
```

## Updating later

```bash
pi update --extensions
pi
/config-sync --dry-run
/config-sync
```

The sync command is idempotent. It backs up replaced files as `.bak-<timestamp>` unless `--no-backup` is passed.

## What Pi loads from this package

- `AGENTS.md` - personal global instructions, synced to `~/.pi/agent/AGENTS.md`
- `extensions/` - Pi extensions and slash commands
- `skills/` - reusable skills
- `prompts/` - prompt templates, if present
- `themes/` - Pi themes, if present

## Dotfiles synced by `/config-sync`

- `dotfiles/tmux/tmux.conf` -> `~/.tmux.conf`
- `dotfiles/tmux/tmux.conf.local` -> `~/.tmux.conf.local`
- `dotfiles/nvim/` -> `~/.config/nvim/` on macOS/Linux, `%LOCALAPPDATA%\nvim\` on Windows
- `dotfiles/ghostty/config` -> `~/.config/ghostty/config`
- `AGENTS.md` -> `~/.pi/agent/AGENTS.md`

By default, sync uses symlinks on macOS/Linux and copies on Windows. Override with `--mode symlink` or `--mode copy`.

## Testing safely

Run against a fake home instead of your real profile:

```bash
npm run sync:dry-run -- --home /tmp/agent-home --config-home /tmp/agent-home/.config --pi-agent-dir /tmp/agent-home/.pi/agent --mode copy
npm run sync -- --home /tmp/agent-home --config-home /tmp/agent-home/.config --pi-agent-dir /tmp/agent-home/.pi/agent --mode copy
```

## Development

```bash
npm install
npm run typecheck
npm test
```

MCP bridge secrets belong in environment variables or local untracked config such as `~/.pi/agent/mcp.json`; use `.env.example` as a template only.
