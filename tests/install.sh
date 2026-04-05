#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)

run_install() {
  local home_dir="$1"
  shift
  HOME="$home_dir" bash "$ROOT_DIR/install.sh" "$@"
}

assert_symlink_target() {
  local path="$1"
  local expected="$2"

  [[ -L "$path" ]] || {
    printf 'expected symlink: %s\n' "$path" >&2
    return 1
  }

  [[ $(readlink -f "$path") == "$expected" ]] || {
    printf 'unexpected symlink target for %s: %s\n' "$path" "$(readlink -f "$path")" >&2
    printf 'expected: %s\n' "$expected" >&2
    return 1
  }
}

test_install_all_creates_opencode_agents_symlink() (
  local home_dir
  home_dir=$(mktemp -d)
  trap 'rm -rf "$home_dir"' EXIT

  run_install "$home_dir"

  assert_symlink_target \
    "$home_dir/.config/opencode/AGENTS.md" \
    "$ROOT_DIR/AGENTS.md"
)

test_named_skill_install_still_installs_agents() (
  local home_dir
  home_dir=$(mktemp -d)
  trap 'rm -rf "$home_dir"' EXIT

  run_install "$home_dir" testskill

  assert_symlink_target \
    "$home_dir/.config/opencode/AGENTS.md" \
    "$ROOT_DIR/AGENTS.md"

  assert_symlink_target \
    "$home_dir/.config/opencode/skills/testskill" \
    "$ROOT_DIR/skills/testskill"
)

test_existing_unmanaged_agents_file_requires_force() (
  local home_dir
  local output

  home_dir=$(mktemp -d)
  trap 'rm -rf "$home_dir"' EXIT

  mkdir -p "$home_dir/.config/opencode"
  printf 'local-only\n' > "$home_dir/.config/opencode/AGENTS.md"

  if output=$(run_install "$home_dir" 2>&1); then
    printf 'expected install to fail without --force\n' >&2
    return 1
  fi

  case "$output" in
    *"exists (use --force to replace): $home_dir/.config/opencode/AGENTS.md"*)
      ;;
    *)
      printf 'unexpected error output:\n%s\n' "$output" >&2
      return 1
      ;;
  esac

  run_install "$home_dir" --force >/dev/null

  assert_symlink_target \
    "$home_dir/.config/opencode/AGENTS.md" \
    "$ROOT_DIR/AGENTS.md"
)

main() {
  test_install_all_creates_opencode_agents_symlink
  test_named_skill_install_still_installs_agents
  test_existing_unmanaged_agents_file_requires_force
  printf 'all installer checks passed\n'
}

main "$@"
