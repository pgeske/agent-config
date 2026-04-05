# Agent Config

Shared agent configuration and reusable skills.

## Structure

- `AGENTS.md` - Shared instructions source installed into `~/.config/opencode/AGENTS.md`
- `skills/` - Reusable skills and capabilities

## Usage

### Source of truth

Create and edit shared agent config only in this repo:

- `~/projects/agent-config/AGENTS.md`
- `~/projects/agent-config/skills/<skill-name>`

### Tooling

- Install managed config and all skills:
  - `./install.sh`
- Install managed config plus one or more named skills:
  - `./install.sh my-skill another-skill`
- Replace mismatched managed targets:
  - `./install.sh --force`
- Remove stale agent-config-managed skill links while installing:
  - `./install.sh --prune`

OpenClaw skill targets are installed as copied directories, not symlinks, so rerunning `./install.sh` overwrites existing skill copies there automatically.

### Target config

Edit `targets.yaml` for skill destination directories. The shared OpenCode `AGENTS.md` target is managed directly by `install.sh`.
