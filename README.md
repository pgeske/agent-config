# Agent Config

Personal Pi, agent, tmux, terminal, and editor setup. The repository is designed to be cloned onto a new machine and safely re-applied as the setup evolves.

## Fresh machine

Prerequisites: Git, Node.js, and npm. On macOS, Ghostty, tmux, and Neovim are optional but recommended.

```bash
git clone https://github.com/pgeske/agent-config.git ~/agent-config
cd ~/agent-config
./bootstrap.sh
```

Ensure the managed launchers are early in your shell `PATH`:

```bash
export PATH="$HOME/.pi/agent/bin:$HOME/.local/bin:$PATH"
```

Then start Pi and configure a personal provider:

```bash
pi
```

Run `/login` inside Pi. Provider credentials, model catalogs, MCP credentials, and other machine-local secrets are intentionally not stored here.

## Updating later

```bash
cd ~/agent-config
git pull --ff-only
./bootstrap.sh
```

`bootstrap.sh` is idempotent. It:

1. installs stable Pi with npm when it is missing;
2. installs this repository's dependencies;
3. builds the pinned experimental Pi used for fullscreen mode;
4. links shared skills, extensions, and `AGENTS.md` into supported agents; and
5. syncs Pi, tmux, Neovim, and Ghostty configuration.

Existing dotfiles are backed up as `.bak-<timestamp>` before replacement. Preview file changes without applying them with:

```bash
npm run sync:dry-run
# or inside Pi
/config-sync --dry-run
```

## Pi experience

- `pi` launches the pinned experimental build with fullscreen mode enabled.
- `pi-stable` bypasses it and launches the installed stable release.
- `Ctrl+K` opens session resume; `Ctrl+N` starts a new session.
- tmux uses Catppuccin Frappé styling with Pi activity/completion markers.
- `/branch`, `/merge`, `/detach`, and `/branches` provide tmux-backed parallel session branches.
- `/config-sync` reapplies the managed machine configuration.
- MCP, Codex image generation, voice bridge, tmux notification, Excalidraw, Codex review, and background subagent extensions are included.

The experimental Pi source is pinned to commit [`04d6447f7c492aafac97e2d2450b532650a85556`](https://github.com/earendil-works/pi/commit/04d6447f7c492aafac97e2d2450b532650a85556) and built under `~/.pi/experimental/pi-main-04d6447`.

## Managed configuration

`/config-sync` or `npm run sync` manages:

- `AGENTS.md` → `~/.pi/agent/AGENTS.md`
- `dotfiles/pi/settings.json` → merged into `~/.pi/agent/settings.json`
- `dotfiles/pi/keybindings.json` → `~/.pi/agent/keybindings.json`
- `dotfiles/pi/web-search.json` → `~/.pi/web-search.json`
- `dotfiles/pi/bin/` → Pi launchers under `~/.pi/agent/bin/` and `~/.local/bin/`
- `dotfiles/tmux/tmux.conf` → `~/.tmux.conf`
- `dotfiles/tmux/tmux.conf.local` → `~/.tmux.conf.local`
- `dotfiles/nvim/` → `~/.config/nvim/` on macOS/Linux or `%LOCALAPPDATA%\nvim\` on Windows
- `dotfiles/ghostty/config` → `~/.config/ghostty/config`

Static files use symlinks on macOS/Linux and copies on Windows. The Pi settings overlay is merged so local provider/model choices and unrelated packages remain intact.

## Machine-local configuration

Keep these outside git:

- `~/.pi/agent/auth.json`
- `~/.pi/agent/mcp.json`
- `~/.pi/agent/models.json`
- API keys, OAuth tokens, webhook URLs, and private keys

The MCP bridge reads `~/.pi/agent/mcp.json`; `.env.example` shows environment-variable placeholders. The voice bridge is inert until a compatible local broker is listening at `~/.pi/voice/control.sock`.

## What was intentionally not mirrored

This personal setup excludes employer-specific skills, internal MCP endpoints, internal model gateways, account-routing rules, Slack workflow hooks, deployment tooling, credentials, and organization-specific instructions. Generic workflow and coding preferences were translated into the personal `AGENTS.md`.

## Safe testing

Run config sync against a fake home:

```bash
npm run sync:dry-run -- --home /tmp/agent-home --config-home /tmp/agent-home/.config --pi-agent-dir /tmp/agent-home/.pi/agent --mode copy
npm run sync -- --home /tmp/agent-home --config-home /tmp/agent-home/.config --pi-agent-dir /tmp/agent-home/.pi/agent --mode copy
```

## Development

```bash
npm ci --ignore-scripts
npm run typecheck
npm test
```

Pi extensions execute arbitrary code. Review third-party package changes before updating or installing them.
