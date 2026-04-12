#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)

test_history_search_matches_zsh_entries() (
  local tmpdir
  local output

  tmpdir=$(mktemp -d)
  trap 'rm -rf "$tmpdir"' EXIT

  cat > "$tmpdir/.zsh_history" <<'EOF'
: 1:0;git status
: 2:0;gh repo list --limit 100 --json name
plain command
EOF

  output="$tmpdir/history.json"
  python3 "$ROOT_DIR/skills/gather-context/scripts/history_search.py" \
    "repo list" \
    --history-file "$tmpdir/.zsh_history" \
    --json > "$output"

  python3 - "$output" <<'PY'
import json
import sys

data = json.load(open(sys.argv[1], encoding="utf-8"))
assert len(data) == 1, data
assert data[0]["command"] == "gh repo list --limit 100 --json name", data
assert data[0]["path"].endswith(".zsh_history"), data
PY
)

test_notes_search_prefers_notes_root_and_skips_internal_dirs() (
  local tmpdir
  local output

  tmpdir=$(mktemp -d)
  trap 'rm -rf "$tmpdir"' EXIT

  mkdir -p "$tmpdir/notes/.obsidian"
  cat > "$tmpdir/notes/work.md" <<'EOF'
# Work
Tags: #project #notes

Task reconciler follow-up notes.
EOF

  cat > "$tmpdir/notes/.obsidian/ignored.md" <<'EOF'
Task reconciler should not be read from internal metadata.
EOF

  output="$tmpdir/notes.json"
  HOME="$tmpdir" python3 "$ROOT_DIR/skills/gather-context/scripts/notes_search.py" \
    "task reconciler" \
    --json > "$output"

  python3 - "$output" <<'PY'
import json
import sys

data = json.load(open(sys.argv[1], encoding="utf-8"))
assert len(data) == 1, data
assert data[0]["path"].endswith("notes/work.md"), data
assert ".obsidian" not in data[0]["path"], data
PY
)

test_notes_search_matches_filename_title_and_tags() (
  local tmpdir
  local output

  tmpdir=$(mktemp -d)
  trap 'rm -rf "$tmpdir"' EXIT

  mkdir -p "$tmpdir/notes/memos"
  cat > "$tmpdir/notes/memos/task-reconciler-plan.md" <<'EOF'
# Unrelated
Tags: #other

No direct body mention here.
EOF

  cat > "$tmpdir/notes/memos/work-log.md" <<'EOF'
# Task Reconciler Follow-up
Tags: #work #ops

Body does not need the exact phrase again.
EOF

  output="$tmpdir/notes.json"
  HOME="$tmpdir" python3 "$ROOT_DIR/skills/gather-context/scripts/notes_search.py" \
    "task reconciler" \
    --json > "$output"

  python3 - "$output" <<'PY'
import json
import sys

data = json.load(open(sys.argv[1], encoding="utf-8"))
assert len(data) >= 2, data
top = data[0]
paths = [item["path"] for item in data]
assert top["path"].endswith("notes/memos/work-log.md"), data
assert top["match_type"] == "title", data
assert any(path.endswith("notes/memos/task-reconciler-plan.md") for path in paths), data
assert any(
    item["path"].endswith("notes/memos/task-reconciler-plan.md") and item["match_type"] == "filename"
    for item in data
), data
PY
)

test_notes_search_matches_frontmatter_aliases() (
  local tmpdir
  local output

  tmpdir=$(mktemp -d)
  trap 'rm -rf "$tmpdir"' EXIT

  mkdir -p "$tmpdir/notes"
  cat > "$tmpdir/notes/task-doc.md" <<'EOF'
---
aliases:
  - Thursday recap
tags:
  - work
---

# Daily Review

Body unrelated.
EOF

  output="$tmpdir/notes.json"
  HOME="$tmpdir" python3 "$ROOT_DIR/skills/gather-context/scripts/notes_search.py" \
    "thursday recap" \
    --json > "$output"

  python3 - "$output" <<'PY'
import json
import sys

data = json.load(open(sys.argv[1], encoding="utf-8"))
assert len(data) == 1, data
assert data[0]["match_type"] == "alias", data
assert data[0]["path"].endswith("notes/task-doc.md"), data
PY
)

test_resolve_repo_prefers_local_match_and_keeps_github_context() (
  local tmpdir
  local output

  tmpdir=$(mktemp -d)
  trap 'rm -rf "$tmpdir"' EXIT

  mkdir -p "$tmpdir/projects/alygo" "$tmpdir/bin"

  cat > "$tmpdir/bin/gh" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' '[{"name":"alygo","nameWithOwner":"pgeske/alygo","isPrivate":true,"url":"https://github.com/pgeske/alygo"}]'
EOF
  chmod +x "$tmpdir/bin/gh"

  output="$tmpdir/repo.json"
  python3 "$ROOT_DIR/skills/gather-context/scripts/resolve_repo.py" \
    "alygo" \
    --projects-root "$tmpdir/projects" \
    --gh-bin "$tmpdir/bin/gh" \
    --json > "$output"

  python3 - "$output" <<'PY'
import json
import sys

data = json.load(open(sys.argv[1], encoding="utf-8"))
best = data["best_match"]
assert best["source"] == "local", data
assert best["local_path"].endswith("projects/alygo"), data
assert best["github_url"] == "https://github.com/pgeske/alygo", data
PY
)

main() {
  test_history_search_matches_zsh_entries
  test_notes_search_prefers_notes_root_and_skips_internal_dirs
  test_notes_search_matches_filename_title_and_tags
  test_notes_search_matches_frontmatter_aliases
  test_resolve_repo_prefers_local_match_and_keeps_github_context
  printf 'gather-context checks passed\n'
}

main "$@"
