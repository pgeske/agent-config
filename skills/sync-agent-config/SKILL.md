---
name: sync-agent-config
description: Reconcile portable changes from the work agent setup in ~/agent-config into the personal pgeske agent-config repository without copying employer-specific configuration, secrets, internal services, or Slack integrations. Use when asked to sync, mirror, or port the work agentic setup to the personal setup.
---

# Sync Agent Config

Port reusable agent, Pi, terminal, and editor improvements from the work setup into the personal setup. This is a deliberate reconciliation, not a blind directory copy.

## Repositories

- Work source: `~/agent-config` (`pgeske-dd/agent-config`)
- Personal destination: `~/repositories/agent-config` (`pgeske/agent-config`)
- Use `pgeske-dd` only for work-repository GitHub operations and `pgeske` only for personal-repository GitHub operations.

Load and follow `agent-config-workflow` before editing either repository.

## Gather the complete source state

1. Inspect both repository statuses, remotes, default branches, recent logs, and diffs in parallel.
2. Fetch both origins. Base destination work on the latest personal default branch, not a stale local branch.
3. Preserve any personal working-tree changes before updating its default branch. Reconcile them explicitly afterward; do not overwrite them.
4. Find the last personal sync commit and inspect work commits after its recorded source commit or timestamp.
5. Include work changes that are committed, staged, unstaged, or untracked. A work change does not need to be pushed before it can be considered for the personal setup.
6. Inspect only this safe machine-local allowlist when recent setup changes may not be represented in the work repository:
   - `~/.tmux.conf` and `~/.tmux.conf.local`
   - `~/.config/ghostty/config`
   - Pi launchers, keybindings, settings, and themes
7. Never read or copy machine-local authentication, model catalogs, MCP server definitions, OAuth records, caches, sessions, webhook files, or environment files merely to discover sync candidates.

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

- Datadog, DataDog, `ddoghq`, team, Jira-project, incident, deployment, service, cluster, identity, and internal repository instructions
- Internal domains, endpoints, model gateways, MCP servers, account routing, and authentication flows
- Slack MCP rules, Slack write guards, Slack workflow hooks, channel details, and notification integrations
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
8. Switch GitHub CLI to `pgeske`, push the personal branch, and open a PR when the user requested the sync. Do not merge without explicit permission.
9. Record the work source commit in the personal commit or PR body so the next sync has a clear baseline. Note that the work working tree was also inspected when applicable.

## Completion report

Report:

- what was ported unchanged;
- what was adapted for personal use;
- which conflicts kept the personal implementation and why;
- what was deliberately excluded;
- validation results, commit signatures, branch, and PR;
- any source changes that remain uncommitted or unpushed.
