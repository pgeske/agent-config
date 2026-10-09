#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$1" >&2
    exit 1
  fi
}

require_command git
require_command node
require_command npm

printf 'Installing agent-config dependencies...\n'
cd "$ROOT_DIR"
npm ci --ignore-scripts

printf 'Installing shared skills and instructions...\n'
./install.sh --force --prune

printf 'Syncing Herdr, zsh, tmux, Neovim, and Ghostty configuration...\n'
node scripts/sync.mjs

printf '\nAgent setup is ready.\n'
