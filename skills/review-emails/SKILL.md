---
name: review-emails
description: Review the last 2 days of unread Gmail across all authenticated gog accounts, mark those emails as read, and produce one concise, actionable cross-account summary (not per-email). Use when the user asks for an inbox catch-up, email digest, important/actionable highlights, or a quick "what matters" summary.
version: "0.1.0"
author: alyosha
dependencies:
  - gog (gmail)
---

# review-emails

Run a fast inbox sweep across every gog-authenticated Gmail account, clear unread status, and return one high-signal summary.

## Workflow

1. Run:

```bash
/home/alyosha/.openclaw/workspace/skills/review-emails/scripts/fetch_and_mark_unread_2d.sh
```

This script will:
- discover all gog-authenticated accounts with Gmail access
- fetch `newer_than:2d label:UNREAD` messages (with body)
- write combined output to:
  - `/home/alyosha/.openclaw/workspace/emails_unread_2d.json`
  - `/home/alyosha/.openclaw/workspace/emails_unread_2d.txt`
- mark matched threads as read in each account

2. Read `emails_unread_2d.json` and synthesize the content.

3. Reply with a single consolidated summary.

## Output requirements

- Do **not** summarize every individual email.
- Focus on important + actionable items first.
- Briefly mention or omit low-value noise (promos, newsletters, etc.).
- Use emojis where they improve scanning.
- Keep it concise.

Use this structure:

- `⚡ action items` (most urgent first)
- `💸 money / bills`
- `📦 logistics / travel / deliveries`
- `💼 work / career / admin`
- `📰 low-priority roundup` (brief)

If a section has nothing meaningful, omit it.
If there are no unread emails in the last 2 days, say so clearly.

## Guardrails

- Never send email or draft replies unless explicitly asked.
- Only mark as read (already handled by script).
- Treat summary as cross-account by default unless user asks to split by account.