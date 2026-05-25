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

  assert_symlink_target \
    "$home_dir/.pi/agent/AGENTS.md" \
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

test_install_all_installs_pi_extensions() (
  local home_dir

  home_dir=$(mktemp -d)
  trap 'rm -rf "$home_dir"' EXIT

  run_install "$home_dir"

  assert_symlink_target \
    "$home_dir/.pi/agent/extensions/subagents" \
    "$ROOT_DIR/extensions/subagents"

  assert_symlink_target \
    "$home_dir/.pi/agent/extensions/mcp-bridge" \
    "$ROOT_DIR/extensions/mcp-bridge"

  assert_symlink_target \
    "$home_dir/.pi/agent/extensions/excalidraw.ts" \
    "$ROOT_DIR/extensions/excalidraw.ts"

  assert_symlink_target \
    "$home_dir/.pi/agent/extensions/codex-review.ts" \
    "$ROOT_DIR/extensions/codex-review.ts"

  if [[ -d "$ROOT_DIR/node_modules" ]]; then
    assert_symlink_target \
      "$home_dir/.pi/agent/extensions/node_modules" \
      "$ROOT_DIR/node_modules"

    node -e "require.resolve('@modelcontextprotocol/sdk/client/index.js', { paths: [process.argv[1]] })" \
      "$home_dir/.pi/agent/extensions/mcp-bridge"
  fi
)

test_extension_conflict_requires_force() (
  local home_dir
  local output

  home_dir=$(mktemp -d)
  trap 'rm -rf "$home_dir"' EXIT

  mkdir -p "$home_dir/.pi/agent/extensions/subagents"
  printf 'local-only\n' > "$home_dir/.pi/agent/extensions/subagents/index.ts"

  if output=$(run_install "$home_dir" 2>&1); then
    printf 'expected install to fail without --force\n' >&2
    return 1
  fi

  case "$output" in
    *"exists (use --force to replace): $home_dir/.pi/agent/extensions/subagents"*)
      ;;
    *)
      printf 'unexpected error output:\n%s\n' "$output" >&2
      return 1
      ;;
  esac

  run_install "$home_dir" --force >/dev/null

  assert_symlink_target \
    "$home_dir/.pi/agent/extensions/subagents" \
    "$ROOT_DIR/extensions/subagents"
)

test_extension_file_conflict_requires_force() (
  local home_dir
  local output

  home_dir=$(mktemp -d)
  trap 'rm -rf "$home_dir"' EXIT

  mkdir -p "$home_dir/.pi/agent/extensions"
  printf 'local-only\n' > "$home_dir/.pi/agent/extensions/excalidraw.ts"

  if output=$(run_install "$home_dir" 2>&1); then
    printf 'expected install to fail without --force\n' >&2
    return 1
  fi

  case "$output" in
    *"exists (use --force to replace): $home_dir/.pi/agent/extensions/excalidraw.ts"*)
      ;;
    *)
      printf 'unexpected error output:\n%s\n' "$output" >&2
      return 1
      ;;
  esac

  run_install "$home_dir" --force >/dev/null

  assert_symlink_target \
    "$home_dir/.pi/agent/extensions/excalidraw.ts" \
    "$ROOT_DIR/extensions/excalidraw.ts"
)

test_extension_target_root_symlink_requires_force() (
  local home_dir
  local output

  home_dir=$(mktemp -d)
  trap 'rm -rf "$home_dir"' EXIT

  mkdir -p "$home_dir/.pi/agent" "$home_dir/extension-target"
  ln -s "$home_dir/extension-target" "$home_dir/.pi/agent/extensions"

  if output=$(run_install "$home_dir" 2>&1); then
    printf 'expected install to fail without --force\n' >&2
    return 1
  fi

  case "$output" in
    *"target root is a symlink (use --force to replace): $home_dir/.pi/agent/extensions"*)
      ;;
    *)
      printf 'unexpected error output:\n%s\n' "$output" >&2
      return 1
      ;;
  esac

  run_install "$home_dir" --force >/dev/null

  [[ -d "$home_dir/.pi/agent/extensions" && ! -L "$home_dir/.pi/agent/extensions" ]] || {
    printf 'expected extension target root to be a real directory\n' >&2
    return 1
  }

  assert_symlink_target \
    "$home_dir/.pi/agent/extensions/subagents" \
    "$ROOT_DIR/extensions/subagents"
)

test_prune_removes_stale_extension_links() (
  local home_dir

  home_dir=$(mktemp -d)
  trap 'rm -rf "$home_dir" "$ROOT_DIR/extensions/.stale-test"' EXIT

  mkdir -p "$home_dir/.pi/agent/extensions" "$ROOT_DIR/extensions/.stale-test/old-extension"
  touch "$ROOT_DIR/extensions/.stale-test/old-extension/index.ts"
  ln -s "$ROOT_DIR/extensions/.stale-test/old-extension" "$home_dir/.pi/agent/extensions/old-extension"

  run_install "$home_dir" --prune >/dev/null

  [[ ! -e "$home_dir/.pi/agent/extensions/old-extension" && ! -L "$home_dir/.pi/agent/extensions/old-extension" ]] || {
    printf 'expected stale extension link to be pruned\n' >&2
    return 1
  }
)

test_managed_files_do_not_reference_legacy_plugin() (
  assert_no_matches 'super''powers' \
    "$ROOT_DIR/AGENTS.md" \
    "$ROOT_DIR/install.sh" \
    "$ROOT_DIR/targets.yaml" \
    "$ROOT_DIR/skills" \
    "$ROOT_DIR/extensions"
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
  test_install_all_installs_pi_extensions
  test_extension_conflict_requires_force
  test_extension_file_conflict_requires_force
  test_extension_target_root_symlink_requires_force
  test_prune_removes_stale_extension_links
  test_existing_unmanaged_agents_file_requires_force
  test_force_replaces_stale_target_root_symlink
  test_managed_files_do_not_reference_legacy_plugin
  printf 'all installer checks passed\n'
}

main "$@"
