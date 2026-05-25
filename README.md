# Agent Config

Shared agent configuration, reusable skills, and Pi extensions.

## Structure

- `AGENTS.md` - Shared instructions source installed into configured AGENTS targets
- `skills/` - Reusable skills and capabilities
- `extensions/` - Reusable Pi extensions, as either `*.ts` files or directories with `index.ts`

## Usage

### Source of truth

Create and edit shared agent config only in this repo:

- `~/projects/agent-config/AGENTS.md`
- `~/projects/agent-config/skills/<skill-name>`
- `~/projects/agent-config/extensions/<extension-name>`

### Tooling

- Install managed config, all skills, and Pi extensions:
  - `./install.sh`
- Install managed config, Pi extensions, plus one or more named skills:
  - `./install.sh my-skill another-skill`
- Replace mismatched managed targets:
  - `./install.sh --force`
- Remove stale agent-config-managed skill links while installing:
  - `./install.sh --prune`

OpenClaw skill targets are installed as copied directories, not symlinks, so rerunning `./install.sh` overwrites existing skill copies there automatically.

Pi extension dependencies are managed by the root `package.json`; run `npm install` in this repo after cloning or updating extension dependencies. If `npm test` or `npm run typecheck` cannot find `tsx`, install dependencies first with `npm install`.

MCP bridge secrets belong in environment variables or local untracked config such as `~/.pi/agent/mcp.json`; use `.env.example` as a template only.

### Target config

Edit `targets.yaml` for skill destination directories and Pi extension destinations. Shared AGENTS targets are managed directly by `install.sh`.
