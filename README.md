# Agent Config

Personal Pi, agent, tmux, terminal, and editor setup. The repository is designed to be cloned onto a new machine and safely re-applied as the setup evolves.

## Fresh machine

Prerequisites: Git, Node.js, and npm. On macOS, Homebrew is required for Peekaboo desktop automation; Ghostty, tmux, and Neovim are optional but recommended.

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

1. installs Peekaboo desktop automation on macOS when it is missing;
2. installs the stable Pi version pinned by this repository;
3. installs this repository's dependencies;
4. builds the pinned experimental Pi used for fullscreen mode;
5. links shared skills, extensions, commands, and `AGENTS.md` into supported agents; and
6. syncs Pi, MCP, zsh, tmux, Neovim, and Ghostty configuration.

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
- Pi, tmux, Ghostty, and Neovim use coordinated Catppuccin Frappé styling.
- `/branch`, `/merge`, `/detach`, and `/branches` provide tmux-backed parallel session branches.
- `/handoff` writes a self-contained session handoff into the notes vault.
- `/config-sync` reapplies the managed machine configuration.
- MCP adapter, Peekaboo macOS computer use, fast compaction, autocomplete layout, Codex image generation, voice bridge, tmux notification, Excalidraw, and Codex review extensions are included.

Stable Pi is pinned to `0.84.1`. The experimental Pi source is pinned to commit [`28657a2ffa6dbeccba74c166682e7a7ee547f5b4`](https://github.com/badlogic/pi-mono/commit/28657a2ffa6dbeccba74c166682e7a7ee547f5b4) and built under `~/.pi/experimental/pi-main-28657a2`.

## Managed configuration

`/config-sync` or `npm run sync` manages:

- `AGENTS.md` → `~/.pi/agent/AGENTS.md`
- `dotfiles/pi/settings.json` → merged into `~/.pi/agent/settings.json`
- `dotfiles/pi/themes/` → `~/.pi/agent/themes/`
- `dotfiles/pi/keybindings.json` → `~/.pi/agent/keybindings.json`
- `dotfiles/pi/web-search.json` → `~/.pi/web-search.json`
- `dotfiles/mcp/mcp.json` → `~/.config/mcp/mcp.json` on macOS
- `dotfiles/pi/bin/` → Pi launchers under `~/.pi/agent/bin/` and `~/.local/bin/`
- `dotfiles/bin/deploy-filmstream` → `~/.local/bin/deploy-filmstream`
- `dotfiles/zsh/zshrc` → `~/.zshrc`
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

The managed `~/.config/mcp/mcp.json` configures Peekaboo locally through the MCP adapter. Project `.mcp.json` files and Pi-specific overrides in `~/.pi/agent/mcp.json` remain machine-local; run `/mcp setup` for interactive additions. The adapter also uses the system credential store. `.env.example` shows environment-variable placeholders for optional personal integrations. The voice bridge is inert until a compatible local broker is listening at `~/.pi/voice/control.sock`.

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
