# Agent Config

Personal Pi, agent, Herdr, tmux, terminal, and editor setup. The repository is designed to be cloned onto a new machine and safely re-applied as the setup evolves.

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
6. syncs Pi, Herdr, MCP, zsh, tmux, Neovim, and Ghostty configuration.

Existing dotfiles are backed up as `.bak-<timestamp>` before replacement. Preview file changes without applying them with:

```bash
npm run sync:dry-run
# or inside Pi
/config-sync --dry-run
```

## Pi experience

- `pi` launches the pinned experimental build with fullscreen mode enabled.
- `pi-stable` bypasses it and launches the installed stable release.
- `Ctrl+K` opens session resume; use `/new` for a new Pi session. Inside Herdr, `Ctrl+N` creates a tab.
- Pi, Herdr, tmux, Ghostty, and Neovim use coordinated Catppuccin Frappé styling.
- Herdr is the default subagent launcher: fresh named agents in new unfocused tabs, with isolated worktrees for file changes.
- Pi uses native compaction, including its default model/summary behavior and token thresholds. `compact-footer` is UI-only and remains installed.
- `/handoff` writes a self-contained session handoff into the notes vault.
- `/config-sync` reapplies the managed machine configuration.
- MCP adapter, Peekaboo macOS computer use, autocomplete layout, Codex image generation, voice bridge, tmux notification, Excalidraw, and Codex review extensions are included.

Stable Pi is pinned to `0.84.1`. The experimental Pi source is pinned to commit [`28657a2ffa6dbeccba74c166682e7a7ee547f5b4`](https://github.com/badlogic/pi-mono/commit/28657a2ffa6dbeccba74c166682e7a7ee547f5b4) and built under `~/.pi/experimental/pi-main-28657a2`.

## Herdr

Install [Herdr](https://herdr.dev) separately (config verified with 0.8.2), then run `npm run sync` or `./bootstrap.sh` from your permanent checkout. Only `config.toml` is managed, not the whole Herdr directory. Existing config files or links are backed up before replacement; review your personal differences with `npm run sync:dry-run` first. The config keeps Ctrl+A, Cmd+Shift+[ / ] tab switching, Ctrl+N new tab, Cmd+Shift+N vertical split, symbol status indicators, in-Herdr notifications, and the official Catppuccin Frappé palette. Pi's Ctrl+A bindings are freed for Herdr, while its personal paste-image shortcuts remain.

Install the official Pi status integration through Herdr, not by copying generated files:

```bash
herdr integration install pi
herdr integration status
```

No installer reloads Herdr or Pi, stops agents, or changes session state. Run `herdr server reload-config` yourself when ready to apply config changes without closing panes. If you use `HERDR_CONFIG_PATH`, keep that local override or point it at the installed file.

Both `./install.sh` and config sync remove dangling extension links whose recorded target is the same-named resource under this checkout's `extensions/`, even without `--prune`. Real directories, unrelated links, live resources, and official integration files are preserved. Links to old checkout paths require manual inspection; ownership is not guessed. Config sync removes the `compaction` settings object to restore Pi's native defaults; it does not change local provider/model choices or per-model thinking maps. Existing Pi processes need `/reload` while idle or a new process to unload retired hooks.

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
- `dotfiles/herdr/config.toml` → `~/.config/herdr/config.toml`

Static files use symlinks on macOS/Linux and copies on Windows. The Pi settings overlay is merged so local provider/model choices and unrelated packages remain intact.

## Machine-local configuration

Keep these outside git:

- `~/.pi/agent/auth.json`
- `~/.pi/agent/mcp.json`
- `~/.pi/agent/models.json`
- API keys, OAuth tokens, webhook URLs, and private keys
- Herdr session/workspace/tab state, history, sockets, logs, agent sessions, caches, runtime metadata, machine identity, pairing credentials, and network setup

The managed `~/.config/mcp/mcp.json` configures Peekaboo locally through the MCP adapter. Project `.mcp.json` files and Pi-specific overrides in `~/.pi/agent/mcp.json` remain machine-local; run `/mcp setup` for interactive additions. The adapter also uses the system credential store. `.env.example` shows environment-variable placeholders for optional personal integrations. The voice bridge is inert until a compatible local broker is listening at `~/.pi/voice/control.sock`.

## What was intentionally not mirrored

This personal setup excludes employer-specific skills, internal MCP endpoints, internal model gateways, account-routing rules, Slack workflow hooks, deployment tooling, credentials, and organization-specific instructions. Generic workflow and coding preferences were translated into the personal `AGENTS.md`. The review helper keeps native Codex authentication and the personal `gpt-5.6-sol` model, now with explicit `xhigh` default effort. It includes portable review safeguards and opt-in model/effort/provider overrides, not a bundled gateway configuration.

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
