#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$1" >&2
    exit 1
  fi
}

find_stable_pi() {
  local candidate
  for candidate in /opt/homebrew/bin/pi /usr/local/bin/pi "$HOME/.npm-global/bin/pi"; do
    if [[ -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  local clean_path=""
  local directory
  local old_ifs=$IFS
  IFS=:
  for directory in $PATH; do
    case "$directory" in
      "$HOME/.pi/agent/bin"|"$HOME/.local/bin") continue ;;
    esac
    if [[ -z "$clean_path" ]]; then clean_path=$directory; else clean_path="$clean_path:$directory"; fi
  done
  IFS=$old_ifs
  PATH="$clean_path" command -v pi 2>/dev/null || true
}

require_command git
require_command node
require_command npm

required_stable_pi=$(node -e 'const p = require(process.argv[1]); console.log(p.dependencies["@earendil-works/pi-coding-agent"].replace(/^[^0-9]*/, ""))' "$ROOT_DIR/package.json")
stable_pi=$(find_stable_pi)
stable_pi_version=""
if [[ -n "$stable_pi" ]]; then
  stable_pi_version=$($stable_pi --version 2>/dev/null || true)
fi
if [[ "$stable_pi_version" != "$required_stable_pi" ]]; then
  printf 'Installing stable Pi %s with npm...\n' "$required_stable_pi"
  npm install -g --ignore-scripts "@earendil-works/pi-coding-agent@$required_stable_pi"
  stable_pi=$(find_stable_pi)
fi
if [[ -z "$stable_pi" ]] || [[ $($stable_pi --version 2>/dev/null || true) != "$required_stable_pi" ]]; then
  printf 'Stable Pi %s was installed but is not on PATH. Add the npm global bin directory and rerun.\n' "$required_stable_pi" >&2
  exit 1
fi

printf 'Installing agent-config dependencies...\n'
cd "$ROOT_DIR"
npm ci --ignore-scripts

printf 'Building pinned experimental Pi...\n'
node scripts/install-experimental-pi.mjs

printf 'Installing shared skills, extensions, and instructions...\n'
./install.sh --force --prune

printf 'Syncing Pi, tmux, Neovim, and Ghostty configuration...\n'
node scripts/sync.mjs

printf '\nAgent setup is ready.\n'
printf 'Stable Pi: %s\n' "$stable_pi"
printf 'Experimental Pi: %s\n' "$HOME/.local/bin/pi-experimental"
printf 'Default Pi wrapper: %s\n' "$HOME/.pi/agent/bin/pi"
case ":$PATH:" in
  *":$HOME/.pi/agent/bin:"*) ;;
  *) printf '\nAdd this to your shell profile, then start a new shell:\n  export PATH="$HOME/.pi/agent/bin:$HOME/.local/bin:$PATH"\n' ;;
esac
printf '\nRun pi, then /login to configure a personal model provider.\n'
