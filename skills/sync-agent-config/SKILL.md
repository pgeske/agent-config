---
name: sync-agent-config
description: Reconcile portable changes from a work agent setup into the personal pgeske agent-config repository without copying employer-specific configuration, secrets, internal services, or chat integrations. Use when asked to sync, mirror, or port the work agentic setup to the personal setup.
---

# Sync Agent Config

Port reusable agent, Pi, terminal, and editor improvements from the work setup into the personal setup. This is a deliberate reconciliation, not a blind directory copy.

## Resolve the repositories safely

- The personal destination is the checkout whose origin is `pgeske/agent-config`. It normally lives at `~/agent-config` on a personal machine and may live elsewhere on another machine.
- The work source is a separate checkout whose origin is the designated work agent-config repository. Do not infer it from a fixed path or publish its private remote identity.
- Resolve both checkouts by inspecting their Git remotes. Never treat one checkout as both source and destination.
- If no work checkout is available locally, report that local staged, unstaged, and untracked work changes cannot be included. Access a private remote only when the user explicitly requested the cross-environment sync and the appropriate work identity is already available.
- Use the personal GitHub identity for destination operations. Use a work identity only for the explicitly requested source inspection; never mix credentials between repositories.

Load and follow `agent-config-workflow` before editing either repository.

## Gather the complete source state

1. Resolve and verify distinct source and destination checkouts from their remotes before reading or editing them.
2. Inspect both repository statuses, default branches, recent logs, and diffs in parallel.
3. Fetch both origins. Base destination work on the latest personal default branch, not a stale local branch.
4. Preserve any personal working-tree changes before updating its default branch. Reconcile them explicitly afterward; do not overwrite them.
5. Find the last personal sync and inspect work changes after its recorded safe baseline or timestamp.
6. When a local work checkout is available, include work changes that are committed, staged, unstaged, or untracked. A work change does not need to be pushed before it can be considered for the personal setup.
7. Inspect only this safe machine-local allowlist when recent setup changes may not be represented in the work repository:
   - `~/.tmux.conf` and `~/.tmux.conf.local`
   - `~/.config/ghostty/config`
   - Pi launchers, keybindings, settings, and themes
8. Never read or copy machine-local authentication, model catalogs, MCP server definitions, OAuth records, caches, sessions, webhook files, or environment files merely to discover sync candidates.

## Classify every candidate

### Port or adapt

- Generic coding, review, testing, Git, tmux, and subagent workflows
- Reusable Pi extensions, commands, skills, themes, keybindings, and UI fixes
- Portable tmux, Ghostty, Neovim, bootstrap, and dependency updates
- Generic bug fixes present only in the work tree

Adapt rather than copy when the work implementation assumes an internal model/provider, work-only path, work GitHub identity, or organization-specific tool. Prefer configuration, the active model, or a personal equivalent over an internal default.

### Preserve the personal implementation

If both repositories independently solve the same problem, compare simplicity, portability, maintenance cost, and behavior. Keep the personal implementation when it is better; otherwise replace or combine it cleanly. Do not retain compatibility for an unpublished discarded implementation.

### Exclude

- Employer, organization, team, ticketing, incident, deployment, service, cluster, identity, and internal repository instructions
- Internal domains, endpoints, model gateways, MCP servers, account routing, and authentication flows
- Work chat rules, write guards, workflow hooks, channel details, and notification integrations
- Employer-specific skills, commands, dashboards, release tooling, and cloud configuration
- Credentials, tokens, API keys, private keys, OAuth state, webhook URLs, copied auth headers, and machine-local secret files

When uncertain, leave the candidate out and report it instead of weakening the boundary.

## Reconcile and validate

1. Create a personal branch prefixed with `pgeske/` from the latest personal default branch.
2. Apply portable changes in cohesive batches. Keep personal-only features and intentional remote changes intact.
3. Update docs, installers, lockfiles, and tests alongside behavior changes.
4. Review the full personal diff for work-only names, domains, paths, account identities, internal package names, and secret-like values. Use targeted searches without printing any discovered secret value.
5. Run `git diff --check`, the repository typecheck, and its full test suite once at the final checkpoint.
6. Use a fake home when validating installers or sync scripts. Do not install the personal profile over the active work profile.
7. Create signed commits and verify their signatures before pushing.
8. Switch GitHub CLI to the personal identity, push the personal branch, and open a PR when the user requested the sync. Do not merge without explicit permission.
9. Record only a safe source baseline in the public commit or PR. Keep private repository identities and other non-public source metadata in the private completion report instead.

## Completion report

Report:

- what was ported unchanged;
- what was adapted for personal use;
- which conflicts kept the personal implementation and why;
- what was deliberately excluded;
- validation results, commit signatures, branch, and PR;
- any source changes that remain uncommitted or unpushed;
- whether the source checkout was unavailable, preventing inspection of local-only work changes.
