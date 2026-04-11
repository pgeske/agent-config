---
name: twitter
description: Read from and write to X/Twitter using the saved local web session in ~/.config/last30days/.env. Use when the user asks to search Twitter, inspect tweets, threads, profiles, or timelines, or to post, reply, like, repost, bookmark, or follow. Ask for confirmation before any write action.
version: "0.1.0"
author: alyosha
dependencies:
  - node
---

# twitter

Use this skill for X/Twitter tasks.

## When To Use

- Search X/Twitter for posts, threads, mentions, or reactions
- Read a tweet, thread, profile, or recent timeline
- Post a new tweet or reply
- Like, unlike, repost, unretweet, bookmark, unbookmark, follow, or unfollow

## Safety

- Treat posting and all account mutations as external actions
- Ask the user before any write action
- Only pass `--yes` after the user explicitly approves the action
- Never print or commit the saved auth values

## Authentication

- The helper reads `AUTH_TOKEN` and `CT0` from `~/.config/last30days/.env`
- These are local X web session cookies, not a public developer API key
- If auth fails, verify the file still exists and that the X login is still valid

## Commands

```bash
node scripts/twitter.js whoami
node scripts/twitter.js search "from:openai gpt-5" --count 5
node scripts/twitter.js user @elonmusk --count 5
node scripts/twitter.js read https://x.com/elonmusk/status/1234567890
node scripts/twitter.js thread 1234567890
node scripts/twitter.js post "hello world" --yes
node scripts/twitter.js reply 1234567890 "nice thread" --yes
node scripts/twitter.js like 1234567890 --yes
node scripts/twitter.js bookmark 1234567890 --yes
node scripts/twitter.js follow @example --yes
```

## Workflow

1. Use `node scripts/twitter.js ...` for the operation
2. For read actions, summarize the returned JSON for the user
3. For write actions, get approval first, then rerun with `--yes`
4. If the helper returns an auth or query error, report it clearly instead of guessing

## Notes For Agents

- Prefer this skill over direct ad hoc HTTP calls to X/Twitter
- Prefer tweet URLs in user-facing summaries when the author handle is available
- If the user asks for a draft, draft it first and wait before posting
