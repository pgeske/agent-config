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

test_named_development_workflow_stack_installs_skills() (
  local home_dir

  home_dir=$(mktemp -d)
  trap 'rm -rf "$home_dir"' EXIT

  run_install "$home_dir" \
    development-workflow \
    requirements-clarity \
    git-worktree \
    tdd-red-green-refactor \
    final-code-review

  assert_symlink_target \
    "$home_dir/.config/opencode/skills/development-workflow" \
    "$ROOT_DIR/skills/development-workflow"

  assert_symlink_target \
    "$home_dir/.config/opencode/skills/requirements-clarity" \
    "$ROOT_DIR/skills/requirements-clarity"

  assert_symlink_target \
    "$home_dir/.config/opencode/skills/git-worktree" \
    "$ROOT_DIR/skills/git-worktree"

  assert_symlink_target \
    "$home_dir/.config/opencode/skills/tdd-red-green-refactor" \
    "$ROOT_DIR/skills/tdd-red-green-refactor"

  assert_symlink_target \
    "$home_dir/.config/opencode/skills/final-code-review" \
    "$ROOT_DIR/skills/final-code-review"
)

test_named_gather_context_install_still_installs_agents() (
  local home_dir

  home_dir=$(mktemp -d)
  trap 'rm -rf "$home_dir"' EXIT

  run_install "$home_dir" gather-context

  assert_symlink_target \
    "$home_dir/.config/opencode/AGENTS.md" \
    "$ROOT_DIR/AGENTS.md"

  assert_symlink_target \
    "$home_dir/.config/opencode/skills/gather-context" \
    "$ROOT_DIR/skills/gather-context"
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

  mkdir -p "$home_dir/.opencode"
  ln -s "$home_dir/old-skill-registry/skills" "$home_dir/.opencode/skills"

  run_install "$home_dir" --force >/dev/null

  assert_symlink_target \
    "$home_dir/.opencode/skills" \
    "$ROOT_DIR/skills"
 )

main() {
  test_install_all_creates_opencode_agents_symlink
  test_named_skill_install_still_installs_agents
  test_named_development_workflow_stack_installs_skills
  test_named_gather_context_install_still_installs_agents
  test_existing_unmanaged_agents_file_requires_force
  test_force_replaces_stale_target_root_symlink
  test_managed_files_do_not_reference_legacy_plugin
  printf 'all installer checks passed\n'
}

main "$@"
