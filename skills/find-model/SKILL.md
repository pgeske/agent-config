---
name: find-model
description: Find, validate, and add an OpenClaw model from a model name or model description. Use when a user asks whether a model is supported, wants a new model added to OpenClaw config, or sees model selection fallback behavior. Check local OpenClaw catalog first, run OpenClaw update + gateway restart if missing, and add the model only if it becomes available.
version: "0.1.0"
author: alyosha
dependencies: []
---

# Find Model

Resolve requested model input, verify local support, and add the model to OpenClaw config without changing defaults unless explicitly requested.

## Inputs

Accept one of the following:
- Exact model ref (for example `openrouter/stepfun/step-3.5-flash:free`)
- Partial model name (for example `minimax m2.5`)
- Model description (for example `stepfun flash model on openrouter`)

## Workflow

1. Resolve candidate model refs from the local catalog.
- Run: `openclaw models list --all --plain`
- If input is partial/description, filter with token search (for example `rg -i 'stepfun|flash|m2.5|minimax'`).
- Prefer exact provider/model refs in `provider/model` format.

2. If no candidate is found locally, refresh OpenClaw and retry.
- Run: `openclaw update --yes`
- Run: `openclaw gateway restart`
- Run local catalog check again: `openclaw models list --all --plain`

3. If still not found, stop.
- Tell the user the model is not supported by OpenClaw yet.
- Do not edit config.

4. If found, add model to OpenClaw config catalog.
- Edit `~/.openclaw/openclaw.json` under `agents.defaults.models`.
- Follow the same shape used by existing `openrouter/...` entries:
  - key: full model ref
  - value: object with at least `alias`
- Generate a short alias from model id (lowercase, hyphenated, unique in map).

5. Apply changes safely.
- Do not set as `agents.defaults.model.primary` unless user explicitly asks.
- Do not set as `agents.defaults.subagents.model` unless user explicitly asks.
- Do not alter fallback order unless user explicitly asks.

6. Restart and verify.
- Run: `openclaw gateway restart`
- Run: `openclaw models list`
- Confirm the new model appears as configured and is not marked `missing`.

## Output Requirements

Report:
- Whether the model was found before or only after update
- Exact model ref added
- Alias added
- Verification result from `openclaw models list`
- Whether default/subagent remained unchanged
