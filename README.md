# Skill Registry

Shared skills and utilities for agents.

## Structure

- `skills/` - Reusable skills and capabilities
- `shared/` - Common utilities and types

## Usage

### Source of truth

Create/edit skills only in this repo:

- `~/projects/skill-registry/skills/<skill-name>`

### Tooling

- Install skills to all configured targets:
  - `./install.sh`
- Install one or more named skills:
  - `./install.sh my-skill another-skill`
- Replace mismatched entries for symlink-based targets:
  - `./install.sh --force`
- Remove stale registry-managed links while installing:
  - `./install.sh --prune`

OpenClaw targets are installed as copied directories, not symlinks, so rerunning `./install.sh` overwrites existing skill copies there automatically.

### Target config

Edit `targets.yaml` for destination directories (OpenClaw/Opencode/Codex).
