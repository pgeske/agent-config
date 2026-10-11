# Agent Config

Personal agent instructions, skills, Herdr, tmux, terminal, and editor setup. The repository is designed to be cloned onto a new machine and safely re-applied as the setup evolves.

## Fresh machine

Prerequisites: Git, Node.js, npm, and [OMP](https://github.com/can1357/oh-my-pi) (`brew install can1357/tap/omp`). Herdr, Ghostty, tmux, and Neovim are optional but recommended.

```bash
git clone https://github.com/pgeske/agent-config.git ~/agent-config
cd ~/agent-config
./bootstrap.sh
```

Ensure `~/.local/bin` is early in your shell `PATH`, then run `omp` and configure authentication with `omp login`.

### Windows

Run the same commands from Git Bash. Turn on Windows Developer Mode first so `bootstrap.sh` can create real symlinks for skills and `AGENTS.md`. Install OMP with `irm https://omp.sh/install.ps1 | iex` and Herdr with `irm https://herdr.dev/install.ps1 | iex` in PowerShell. The bash `omp` launcher, zsh config, and deploy scripts are skipped on Windows; Herdr runs natively in Windows Terminal instead of tmux.

## Updating later

```bash
cd ~/agent-config
git pull --ff-only
./bootstrap.sh
```

`bootstrap.sh` is idempotent. It installs this repository's dev dependencies, links shared skills and `AGENTS.md` into supported agents (OMP, Claude Code, Codex, OpenCode), and syncs Herdr, zsh, tmux, Neovim, and Ghostty configuration. Existing dotfiles are backed up as `.bak-<timestamp>` before replacement. Preview changes with `npm run sync:dry-run`.

## OMP

The `~/.local/bin/omp` launcher wraps Homebrew's binary (or `OMP_BINARY` when set). An optional machine-local `~/.config/omp/ca.pem` adds private CA trust for OMP without disabling certificate verification or changing global trust. An existing `NODE_EXTRA_CA_CERTS` takes precedence.

`dotfiles/omp/PERSONALITY.md` replaces OMP's default terse-engineer persona, which tells the model to skip summaries and assume a technical reader. The reply format itself (answer first, plain words, short) lives in the Communication section of `AGENTS.md`, so every agent shares it.

OMP's `config.yml`, `models.yml`, credential database, and `mcp.json` stay machine-local and are not touched by sync.

In tmux, each tab ends with an omp status mark: omp's own animated spinner (yellow) while omp works, a green `●` when a turn finishes or omp asks a question while you're elsewhere, and nothing once you've seen it. Opening the tab clears the dot; the tab you're on only ever shows the spinner. tmux never beeps for these bells. Turns that stop with an error only get the dot if omp's `error.notify` setting is on (off by default). The same marks show in the `prefix + k` window picker.

## Herdr

Install [Herdr](https://herdr.dev) separately (config verified with 0.8.2). Only `config.toml` is managed, not the whole Herdr directory. The config keeps Ctrl+A, Cmd+Shift+[ / ] tab switching, Ctrl+N new tab, symbol status indicators, in-Herdr notifications, and the built-in Dracula theme. Herdr is the default subagent launcher: fresh named agents in new unfocused tabs, with isolated worktrees for file changes.

No installer reloads Herdr, stops agents, or changes session state. Run `herdr server reload-config` yourself when ready to apply config changes without closing panes.

## Managed configuration

`npm run sync` manages:

- `dotfiles/omp/bin/omp` → `~/.local/bin/omp`
- `dotfiles/omp/PERSONALITY.md` → `~/.omp/agent/PERSONALITY.md`
- `dotfiles/bin/deploy-filmstream` → `~/.local/bin/deploy-filmstream`
- `dotfiles/zsh/zshrc` → `~/.zshrc`
- `dotfiles/tmux/tmux.conf` → `~/.tmux.conf`
- `dotfiles/tmux/tmux.conf.local` → `~/.tmux.conf.local`
- `dotfiles/nvim/` → `~/.config/nvim/` on macOS/Linux or `%LOCALAPPDATA%\nvim\` on Windows
- `dotfiles/ghostty/config` → `~/.config/ghostty/config`
- `dotfiles/herdr/config.toml` → `~/.config/herdr/config.toml` on macOS/Linux or `%APPDATA%\herdr\config.toml` on Windows

Static files use symlinks on macOS/Linux and copies on Windows.

Keep API keys, OAuth tokens, MCP credentials, and Herdr session state outside git.

## Safe testing

Run config sync against a fake home:

```bash
npm run sync:dry-run -- --home /tmp/agent-home --config-home /tmp/agent-home/.config --mode copy
```

## Development

```bash
npm ci --ignore-scripts
npm run typecheck
npm test
```
