#!/usr/bin/env bash
set -euo pipefail

WORKSPACE="/home/alyosha/.opencode/workspace"
OUT_JSON="${1:-$WORKSPACE/check_email_unread_2d.json}"
OUT_TXT="${2:-$WORKSPACE/check_email_unread_2d.txt}"

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

AUTH_JSON="$TMPDIR/accounts.json"
gog auth list --json > "$AUTH_JSON"

mapfile -t ACCOUNTS < <(jq -r '.accounts[] | select((.services // []) | index("gmail")) | .email' "$AUTH_JSON")

mkdir -p "$WORKSPACE"

if [[ ${#ACCOUNTS[@]} -eq 0 ]]; then
  echo "No authenticated Gmail accounts found in gog." >&2
  printf '[]\n' > "$OUT_JSON"
  : > "$OUT_TXT"
  exit 0
fi

RAW_FILES=()
FAILED_ACCOUNTS=()

for account in "${ACCOUNTS[@]}"; do
  safe_name=$(printf '%s' "$account" | tr '@.' '__')
  search_file="$TMPDIR/${safe_name}.search.json"
  raw_file="$TMPDIR/${safe_name}.json"
  err_file="$TMPDIR/${safe_name}.err"

  if gog gmail messages search 'newer_than:2d label:UNREAD' \
    --json --include-body --account "$account" --max 1000 > "$search_file" 2> "$err_file"; then
    jq --arg account "$account" '{account: $account, messages: (.messages // [])}' "$search_file" > "$raw_file"
    RAW_FILES+=("$raw_file")
    continue
  fi

  FAILED_ACCOUNTS+=("$account")
  printf 'Account error (%s): %s\n' "$account" "$(tr '\n' ' ' < "$err_file")" >&2
done

if [[ ${#RAW_FILES[@]} -eq 0 ]]; then
  printf '[]\n' > "$OUT_JSON"
  : > "$OUT_TXT"
else
  jq -s '
    [ .[] as $doc
      | ($doc.messages // [])[]
      | . + { account: (.account // $doc.account // "unknown") }
    ]
  ' "${RAW_FILES[@]}" > "$OUT_JSON"

  jq -r '
    .[]
    | "Account: \(.account)\nFrom: \(.from // "")\nSubject: \(.subject // "")\nDate: \(.date // "")\nBody: \((.body // "") | gsub("\\n|\\r"; " ") | .[0:300])\n--------------------"
  ' "$OUT_JSON" > "$OUT_TXT"
fi

echo "Wrote: $OUT_JSON"
echo "Wrote: $OUT_TXT"
echo "Accounts processed: ${#ACCOUNTS[@]}"
echo "Accounts failed: ${#FAILED_ACCOUNTS[@]}"

if [[ ${#FAILED_ACCOUNTS[@]} -gt 0 ]]; then
  printf 'Accounts needing gog refresh: %s\n' "${FAILED_ACCOUNTS[*]}" >&2
fi
