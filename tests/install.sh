#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)

run_install() {
  local home_dir="$1"
  shift
  HOME="$home_dir" bash "$ROOT_DIR/install.sh" "$@"
}

assert_no_matches() {
  local pattern="$1"
  shift

  if rg -n --hidden --glob '!.git/**' "$pattern" "$@"; then
    printf 'unexpected matches for pattern %s\n' "$pattern" >&2
    return 1
  fi
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

test_install_all_links_skills_and_agents() (
  local home_dir
  home_dir=$(mktemp -d)
  trap 'rm -rf "$home_dir"' EXIT

  run_install "$home_dir"

  assert_symlink_target \
    "$home_dir/.config/opencode/AGENTS.md" \
    "$ROOT_DIR/AGENTS.md"
  assert_symlink_target \
    "$home_dir/.omp/agent/AGENTS.md" \
    "$ROOT_DIR/AGENTS.md"
  assert_symlink_target \
    "$home_dir/.omp/agent/skills/herdr" \
    "$ROOT_DIR/skills/herdr"
  assert_symlink_target \
    "$home_dir/.claude/skills/agent-config-workflow" \
    "$ROOT_DIR/skills/agent-config-workflow"
  [[ ! -e "$home_dir/.pi" ]]
  [[ ! -e "$home_dir/.omp/agent/extensions" ]]
  [[ ! -e "$home_dir/.omp/agent/models.yml" ]]
  [[ ! -e "$home_dir/.omp/agent/agent.db" ]]

  # Reruns must preserve machine-local OMP settings and credentials.
  printf 'local settings\n' > "$home_dir/.omp/agent/config.yml"
  printf 'local credentials\n' > "$home_dir/.omp/agent/agent.db"
  run_install "$home_dir"
  [[ $(< "$home_dir/.omp/agent/config.yml") == 'local settings' ]]
  [[ $(< "$home_dir/.omp/agent/agent.db") == 'local credentials' ]]
)

test_named_skill_install_still_installs_agents() (
  local home_dir

  home_dir=$(mktemp -d)
  trap 'rm -rf "$home_dir"' EXIT

  run_install "$home_dir" herdr

  assert_symlink_target \
    "$home_dir/.config/opencode/AGENTS.md" \
    "$ROOT_DIR/AGENTS.md"
  assert_symlink_target \
    "$home_dir/.config/opencode/skills/herdr" \
    "$ROOT_DIR/skills/herdr"
  [[ ! -e "$home_dir/.config/opencode/skills/agent-config-workflow" ]]
)

test_prune_removes_deleted_skill_links_and_preserves_unmanaged_entries() (
  local home_dir
  local target

  home_dir=$(mktemp -d)
  trap 'rm -rf "$home_dir"' EXIT

  # Reproduce retirement after the source directory has already been deleted.
  for target in .config/opencode/skills .claude/skills .agents/skills .omp/agent/skills; do
    mkdir -p "$home_dir/$target/local-skill"
    printf 'local-only\n' > "$home_dir/$target/local-skill/SKILL.md"
    ln -s "$ROOT_DIR/skills/retired-test-skill" "$home_dir/$target/retired-test-skill"
    ln -s "$home_dir/unmanaged/missing-skill" "$home_dir/$target/foreign-skill"
  done

  run_install "$home_dir" --prune >/dev/null

  for target in .config/opencode/skills .claude/skills .agents/skills .omp/agent/skills; do
    [[ ! -e "$home_dir/$target/retired-test-skill" && ! -L "$home_dir/$target/retired-test-skill" ]] || {
      printf 'expected deleted skill link to be pruned from %s\n' "$target" >&2
      return 1
    }
    [[ $(readlink "$home_dir/$target/foreign-skill") == "$home_dir/unmanaged/missing-skill" ]]
    [[ $(<"$home_dir/$target/local-skill/SKILL.md") == local-only ]]
  done
)

test_managed_files_do_not_reference_legacy_plugin() (
  assert_no_matches 'super''powers' \
    "$ROOT_DIR/AGENTS.md" \
    "$ROOT_DIR/install.sh" \
    "$ROOT_DIR/targets.yaml" \
    "$ROOT_DIR/skills"
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

test_force_replaces_stale_target_root_symlink() (
  local home_dir

  home_dir=$(mktemp -d)
  trap 'rm -rf "$home_dir"' EXIT

  mkdir -p "$home_dir/.claude"
  ln -s "$home_dir/old-skill-registry/skills" "$home_dir/.claude/skills"

  run_install "$home_dir" --force >/dev/null

  assert_symlink_target \
    "$home_dir/.claude/skills" \
    "$ROOT_DIR/skills"
)

main() {
  test_install_all_links_skills_and_agents
  test_named_skill_install_still_installs_agents
  test_prune_removes_deleted_skill_links_and_preserves_unmanaged_entries
  test_existing_unmanaged_agents_file_requires_force
  test_force_replaces_stale_target_root_symlink
  test_managed_files_do_not_reference_legacy_plugin
  printf 'all installer checks passed\n'
}

main "$@"
