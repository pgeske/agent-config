#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
SKILLS_DIR="$ROOT_DIR/skills"
TARGETS_FILE="$ROOT_DIR/targets.yaml"
AGENTS_SOURCE="$ROOT_DIR/AGENTS.md"

usage() {
  cat <<'EOF'
Usage: ./install.sh [--force] [--prune] [skill ...]

Install managed skills and shared AGENTS.md into supported agents.

Options:
  --force  Replace existing files or directories for symlink-based targets
  --prune  Remove stale registry-managed links not in the selected set
  --help   Show this help message
EOF
}

expand_path() {
  local path="$1"

  case "$path" in
    \~)
      printf '%s\n' "$HOME"
      ;;
    \~/*)
      printf '%s/%s\n' "$HOME" "${path:2}"
      ;;
    *)
      printf '%s\n' "$path"
      ;;
  esac
}

normalize_target() {
  local raw_target="$1"

  if [[ $raw_target == \"*\" ]]; then
    raw_target=${raw_target#\"}
    raw_target=${raw_target%\"}
  fi
  if [[ $raw_target == \'*\' ]]; then
    raw_target=${raw_target#\'}
    raw_target=${raw_target%\'}
  fi

  expand_path "$raw_target"
}

load_targets() {
  local line
  local raw_target
  local current_section=""

  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ $line =~ ^[[:space:]]*# ]] && continue
    [[ $line =~ ^[[:space:]]*$ ]] && continue

    if [[ $line =~ ^([a-z_]+):[[:space:]]*$ ]]; then
      case "${BASH_REMATCH[1]}" in
        targets|skill_targets) current_section="skill_targets" ;;
        agents_targets) current_section="agents_targets" ;;
        *) current_section="" ;;
      esac
      continue
    fi

    if [[ $line =~ ^[[:space:]]*-[[:space:]]*(.+)[[:space:]]*$ ]]; then
      raw_target=$(normalize_target "${BASH_REMATCH[1]}")
      case "$current_section" in
        skill_targets) skill_targets+=("$raw_target") ;;
        agents_targets) agents_targets+=("$raw_target") ;;
      esac
    fi
  done < "$TARGETS_FILE"
}

force=0
prune=0
skills=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force)
      force=1
      ;;
    --prune)
      prune=1
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    --)
      shift
      skills+=("$@")
      break
      ;;
    -*)
      printf 'Unknown option: %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
    *)
      skills+=("$1")
      ;;
  esac
  shift
done

if [[ ! -d "$SKILLS_DIR" ]]; then
  printf 'Missing skills directory: %s\n' "$SKILLS_DIR" >&2
  exit 1
fi

if [[ ! -f "$TARGETS_FILE" ]]; then
  printf 'Missing target config: %s\n' "$TARGETS_FILE" >&2
  exit 1
fi

skill_targets=()
agents_targets=()
load_targets

if [[ ${#skill_targets[@]} -eq 0 ]]; then
  printf 'No skill targets configured in %s\n' "$TARGETS_FILE" >&2
  exit 1
fi

if [[ ${#agents_targets[@]} -eq 0 ]]; then
  printf 'No AGENTS targets configured in %s\n' "$TARGETS_FILE" >&2
  exit 1
fi

if [[ ${#skills[@]} -eq 0 ]]; then
  shopt -s nullglob
  for skill_dir in "$SKILLS_DIR"/*; do
    [[ -d "$skill_dir" ]] || continue
    [[ -f "$skill_dir/SKILL.md" ]] || continue
    skills+=("$(basename "$skill_dir")")
  done
  shopt -u nullglob
fi

if [[ ${#skills[@]} -eq 0 ]]; then
  printf 'No skills found in %s\n' "$SKILLS_DIR" >&2
  exit 1
fi

for skill in "${skills[@]}"; do
  if [[ ! -f "$SKILLS_DIR/$skill/SKILL.md" ]]; then
    printf 'Unknown skill: %s\n' "$skill" >&2
    exit 2
  fi
done

contains_skill() {
  local needle="$1"
  local skill
  for skill in "${skills[@]}"; do
    if [[ "$skill" == "$needle" ]]; then
      return 0
    fi
  done
  return 1
}

install_managed_symlink() {
  local src="$1"
  local dst="$2"

  mkdir -p "$(dirname "$dst")"

  if [[ -e "$dst" || -L "$dst" ]]; then
    if [[ -L "$dst" ]] && [[ $(readlink -f "$dst" || true) == "$src" ]]; then
      skipped=$((skipped + 1))
      return 0
    fi

    if [[ $force -ne 1 ]]; then
      printf '  ! exists (use --force to replace): %s\n' "$dst"
      return 2
    fi

    rm -rf "$dst"
    updated=$((updated + 1))
  else
    created=$((created + 1))
  fi

  ln -s "$src" "$dst"
  printf '  linked %s -> %s\n' "$dst" "$src"
}

if [[ ! -f "$AGENTS_SOURCE" ]]; then
  printf 'Missing shared AGENTS.md: %s\n' "$AGENTS_SOURCE" >&2
  exit 1
fi

created=0
updated=0
skipped=0
skills_root=$(readlink -f "$SKILLS_DIR")

printf 'Installing %s skill(s): %s\n' "${#skills[@]}" "$(printf '%s ' "${skills[@]}")"

for target in "${skill_targets[@]}"; do
  printf '\n==> %s\n' "$target"

  if [[ -L "$target" ]]; then
    if [[ $(readlink -f "$target" || true) == "$skills_root" ]]; then
      printf '  = target already points to registry skills (%s -> %s); skipping\n' "$target" "$skills_root"
      skipped=$((skipped + ${#skills[@]}))
      continue
    fi

    if [[ $force -eq 1 ]]; then
      rm -rf "$target"
      ln -s "$skills_root" "$target"
      printf '  linked %s -> %s\n' "$target" "$skills_root"
      updated=$((updated + 1))
      continue
    fi
  fi

  mkdir -p "$target"

  if [[ $prune -eq 1 ]]; then
    shopt -s nullglob
    for child in "$target"/*; do
      name=$(basename "$child")
      if [[ "$name" == .* ]] || contains_skill "$name"; then
        continue
      fi

      if [[ -L "$child" ]]; then
        resolved_child=$(readlink -f "$child" || true)
        if [[ "$resolved_child" == "$skills_root"/* ]]; then
          rm -f "$child"
          printf '  pruned stale link: %s\n' "$child"
        fi
      fi
    done
    shopt -u nullglob
  fi

  for skill in "${skills[@]}"; do
    # A conflicting unmanaged skill is reported and left alone; --force replaces it.
    install_managed_symlink "$SKILLS_DIR/$skill" "$target/$skill" || skipped=$((skipped + 1))
  done
done

for agents_target in "${agents_targets[@]}"; do
  printf '\n==> %s\n' "$agents_target"
  if ! install_managed_symlink "$AGENTS_SOURCE" "$agents_target"; then
    exit 1
  fi
done

printf '\nDone. created=%s updated=%s skipped=%s\n' "$created" "$updated" "$skipped"
