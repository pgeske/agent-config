---
name: check-email
description: Check unread Gmail across all authenticated gog accounts and return a concise inbox summary without changing read state. Use when the user asks to check email, review unread messages, or get a quick inbox scan.
version: "0.1.0"
author: alyosha
dependencies:
  - gog (gmail)
---

# check-email

Run a read-only inbox check across every gog-authenticated Gmail account and return a concise, actionable summary.

## Workflow

1. Run:

```bash
/home/alyosha/.opencode/skills/check-email/scripts/fetch_unread_2d.sh
```

This script will:
- discover all gog-authenticated accounts with Gmail access
- fetch `newer_than:2d label:UNREAD` messages with body content
- write combined output to:
  - `/home/alyosha/.opencode/workspace/check_email_unread_2d.json`
  - `/home/alyosha/.opencode/workspace/check_email_unread_2d.txt`
- leave message state unchanged
- continue past per-account auth failures and report which account needs attention

2. Read `check_email_unread_2d.json` and synthesize the content.

3. Reply with one concise inbox summary.

## Output requirements

- Focus on urgent and actionable items first.
- Keep it cross-account by default unless the user asks for a split by account.
- Mention the account only when it matters for actionability or avoiding confusion.
- Skip detailed per-email recitation unless the user asks.
- If nothing unread is found in the last 2 days, say so clearly.

Use this structure when it fits:

- `action items`
- `money / bills`
- `logistics / appointments / deliveries`
- `admin / other important`
- `low-priority roundup`

Omit empty sections.

## Guardrails

- Never send, draft, archive, delete, or mark messages read unless explicitly asked.
- Use gog CLI only for the inbox check.
- Treat the result as cross-account by default because the user has multiple accounts.
- If the script reports `Accounts needing gog refresh`, tell the user which account failed and suggest `gog auth refresh --account <email>`.
