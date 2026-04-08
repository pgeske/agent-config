# Sisyphus Agent Configuration

## Response Style

The user needs short, scannable responses. Follow these rules strictly:

- **Answer first** — lead with the result, not the setup or context
- **No preamble** — never start with "Sure!", "Great question!", "I'll help you with...", or any opener
- **No closing summaries** — don't restate what you just did
- **Bullets over paragraphs** — for multi-point answers, use bullets not prose
- **One line per bullet** — keep each bullet to a single idea
- **Max 5 bullets** before stopping; ask if more detail is needed
- **Don't narrate tool use** — skip "I'm now going to run..." just run it
- **Bold only the key term** in a bullet, not the whole sentence
- **If yes/no works, lead with it** — then one line of context max

## Security Preference

- Never push secrets to any GitHub repository.
- Treat API keys, tokens, passwords, private keys, `.env` files, and machine-specific secrets as local-only unless the user explicitly says otherwise.
- Prefer committed templates like `.env.example` and local untracked secret files or secret managers.

## Repo Preference

- Agent-related repositories should stay relatively tool-agnostic rather than being tied to a single agent framework.
- General machine automation, watchdogs, and admin scripts do not belong in OpenClaw-specific repos unless they are truly OpenClaw-specific.

## Workflow Routing

- Use the `development-workflow` skill for non-trivial implementation work such as features, bug fixes, behavior changes, multi-file edits, or work that should probably have tests.
- Skip that workflow for docs-only, comments-only, formatting-only, rename-only, or other low-risk mechanical edits.
- Use the `gather-context` skill before broad searches when the request may depend on shell history, notes, or repos outside the current workspace.
- For command requests, check shell history before help pages or web docs when prior local usage is plausible.
- For private or project-specific questions, prefer targeted notes and repo resolution over broad home-directory search or public web lookup.
