#!/usr/bin/env bash
set -euo pipefail

WORKSPACE="/home/alyosha/.openclaw/workspace"
OUT_JSON="${1:-$WORKSPACE/emails_unread_2d.json}"
OUT_TXT="${2:-$WORKSPACE/emails_unread_2d.txt}"

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

AUTH_JSON="$TMPDIR/accounts.json"
gog auth list --json > "$AUTH_JSON"

mapfile -t ACCOUNTS < <(jq -r '.accounts[] | select((.services // []) | index("gmail")) | .email' "$AUTH_JSON")

if [[ ${#ACCOUNTS[@]} -eq 0 ]]; then
  echo "No authenticated Gmail accounts found in gog." >&2
  printf '[]\n' > "$OUT_JSON"
  : > "$OUT_TXT"
  exit 0
fi

RAW_FILES=()

for account in "${ACCOUNTS[@]}"; do
  safe_name=$(echo "$account" | tr '@.' '__')
  raw_file="$TMPDIR/${safe_name}.json"

  # Pull unread messages in last 2 days; include body for synthesis.
  gog gmail messages search 'newer_than:2d label:UNREAD' \
    --json --include-body --account "$account" --max 1000 > "$raw_file"

  RAW_FILES+=("$raw_file")
done

# Build a single normalized array with account attribution.
jq -s '
  [ .[] as $doc
    | ($doc.messages // [])[]
    | . + { account: (.account // $doc.account // "unknown") }
  ]
' "${RAW_FILES[@]}" > "$OUT_JSON"

# Human-readable preview for quick checks.
jq -r '
  .[]
  | "Account: \(.account)\nFrom: \(.from // "")\nSubject: \(.subject // "")\nDate: \(.date // "")\nBody: \((.body // "") | gsub("\\n|\\r"; " ") | .[0:300])\n--------------------"
' "$OUT_JSON" > "$OUT_TXT"

# Mark fetched unread threads as read in each account.
for i in "${!ACCOUNTS[@]}"; do
  account="${ACCOUNTS[$i]}"
  raw_file="${RAW_FILES[$i]}"
  thread_file="$TMPDIR/threads_$i.txt"

  jq -r '.messages[]?.threadId // empty' "$raw_file" | sort -u > "$thread_file"
  if [[ -s "$thread_file" ]]; then
    xargs -r -a "$thread_file" -I {} \
      gog gmail thread modify {} --remove=UNREAD -y --account "$account" >/dev/null
  fi
done

echo "Wrote: $OUT_JSON"
echo "Wrote: $OUT_TXT"
echo "Accounts processed: ${#ACCOUNTS[@]}"