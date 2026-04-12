#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
SKILLS_DIR="$ROOT_DIR/skills"
TARGETS_FILE="$ROOT_DIR/targets.yaml"
AGENTS_SOURCE="$ROOT_DIR/AGENTS.md"
AGENTS_TARGET_RAW="~/.config/opencode/AGENTS.md"

usage() {
  cat <<'EOF'
Usage: ./install.sh [--force] [--prune] [skill ...]

Install managed skills and shared agent config.

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

load_targets() {
  local line
  local raw_target

  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ $line =~ ^[[:space:]]*# ]] && continue
    [[ $line =~ ^[[:space:]]*$ ]] && continue

    if [[ $line =~ ^[[:space:]]*-[[:space:]]*(.+)[[:space:]]*$ ]]; then
      raw_target=${BASH_REMATCH[1]}
      if [[ $raw_target == \"*\" ]]; then
        raw_target=${raw_target#\"}
        raw_target=${raw_target%\"}
      fi
      if [[ $raw_target == \'*\' ]]; then
        raw_target=${raw_target#\'}
        raw_target=${raw_target%\'}
      fi
      targets+=("$(expand_path "$raw_target")")
    fi
  done < "$TARGETS_FILE"
}

install_mode_for_target() {
  local target="$1"
  local openclaw_workspace_skills

  openclaw_workspace_skills=$(expand_path "~/.openclaw/workspace/skills")

  if [[ "$target" == "$openclaw_workspace_skills" ]]; then
    printf 'copy\n'
  else
    printf 'symlink\n'
  fi
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

targets=()
load_targets

if [[ ${#targets[@]} -eq 0 ]]; then
  printf 'No install targets configured in %s\n' "$TARGETS_FILE" >&2
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

for target in "${targets[@]}"; do
  printf '\n==> %s\n' "$target"

  install_mode=$(install_mode_for_target "$target")

  resolved_target=""
  if [[ -e "$target" || -L "$target" ]]; then
    resolved_target=$(readlink -f "$target" || true)
  fi

  if [[ "$install_mode" == "symlink" && -L "$target" ]]; then
    if [[ "$resolved_target" == "$skills_root" ]]; then
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
    src="$SKILLS_DIR/$skill"
    dst="$target/$skill"

    if [[ -e "$dst" || -L "$dst" ]]; then
      if [[ "$install_mode" == "symlink" && -L "$dst" ]] && [[ $(readlink -f "$dst" || true) == "$src" ]]; then
        skipped=$((skipped + 1))
        continue
      fi

      if [[ "$install_mode" == "copy" ]]; then
        rm -rf "$dst"
        updated=$((updated + 1))
      elif [[ $force -ne 1 ]]; then
        printf '  ! exists (use --force to replace): %s\n' "$dst"
        skipped=$((skipped + 1))
        continue
      else
        rm -rf "$dst"
        updated=$((updated + 1))
      fi
    else
      created=$((created + 1))
    fi

    if [[ "$install_mode" == "copy" ]]; then
      cp -a "$src" "$dst"
      printf '  copied %s -> %s\n' "$src" "$dst"
    else
      ln -s "$src" "$dst"
      printf '  linked %s -> %s\n' "$dst" "$src"
    fi
  done
done

agents_target=$(expand_path "$AGENTS_TARGET_RAW")

printf '\n==> %s\n' "$agents_target"
if ! install_managed_symlink "$AGENTS_SOURCE" "$agents_target"; then
  exit 1
fi

printf '\nDone. created=%s updated=%s skipped=%s\n' "$created" "$updated" "$skipped"
