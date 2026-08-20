---
name: peekaboo
description: Use when native macOS GUI work needs reliable screen capture, accessibility inspection, clicking, typing, scrolling, window management, or visual verification through Peekaboo.
---

# Peekaboo macOS Automation

Use the `peekaboo` MCP server for native macOS applications. Browser-only work should continue to use the `agent-browser` skill.

## Workflow

1. Search the Peekaboo server for the smallest relevant tool surface with `mcp({ search: "...", server: "peekaboo" })`.
2. Observe the target app before acting. Prefer accessibility-backed element identifiers or labels over raw coordinates.
3. Perform the smallest action needed.
4. Observe or verify the resulting state before continuing.
5. Use `mcpScript` for several dependent Peekaboo calls; use `mcp` for a single search, description, or action.

## Safety

- Keep automation local to this Mac; the managed server runs with `--no-remote`.
- Ask before irreversible or consequential UI actions such as purchases, submissions, deletions, publishing, or account changes.
- Never type or expose credentials on the user's behalf. Hand authentication and privacy prompts to the user.
- Avoid coordinate clicks unless accessibility inspection cannot identify the target reliably.

## Fallback

If the MCP server is unavailable, check `peekaboo permissions status` and `peekaboo --version`. Use the CLI directly only when reconnecting the MCP server does not resolve the issue.
