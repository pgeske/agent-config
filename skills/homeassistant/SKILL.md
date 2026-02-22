---
name: homeassistant
description: Control Home Assistant with natural language. Use when the user wants to interact with lights, switches, climate, media, covers, or any HA entity. Accepts fuzzy commands like "turn on the living room light" or "set the bedroom to 72 degrees". First tries HA's built-in conversation API; if that fails, falls back to custom entity resolution by querying states and services. Always reports what happened or why it couldn't.
version: "0.1.0"
author: alyosha
dependencies: []
---

# Home Assistant Control (hactl)

Execute natural language actions in Home Assistant via its REST API.

## Overview

This skill takes a fuzzy natural language command (e.g., "turn off the kitchen lights", "set the thermostat to 70", "open the blinds") and translates it into a Home Assistant service call. It prefers HA's native `/api/conversation/process` endpoint for intent recognition, then falls back to custom resolution if needed.

## Prerequisites

Environment variables:

- `HOME_ASSISTANT_URL` (e.g., `http://localhost:8123`)
- `HOME_ASSISTANT_TOKEN` (long-lived token or OAuth bearer)

Alternatively, command-line args:
- `--ha-url`
- `--token`

## Usage

```bash
python3 scripts/hactl.py "turn on the living room lamp"
python3 scripts/hactl.py "set the bedroom to 68 degrees"
python3 scripts/hactl.py "play some jazz on the kitchen speaker"
```

## How It Works

1) **Try conversation API**  
   POST `/api/conversation/process` with `{"text": "<command>"}`.  
   If it returns a successful response with `response.speech.plain.speech`, that means HA understood and executed.

2) **Fallback: custom resolution**  
   - Fetch entities: GET `/api/states` → build `{friendly_name: entity_id}` map (per area/device class)
   - Fetch services: GET `/api/services` → know available domains/actions (light.turn_on, climate.set_temperature, etc.)
   - Parse command to identify:
     * Target entity (by fuzzy friendly_name match)
     * Action/service (turn on/off, toggle, set, adjust, open, close, play, pause, etc.)
     * Parameters (brightness %, temperature, media content, source, etc.)
   - Call the appropriate service via POST `/api/services/<domain>/<service>` with `{"entity_id": "...", ...params}`

3) **Report**  
   Success: "✅ turned on living room lamp (light.living_room_lamp)"  
   Failure: "❌ couldn't find an entity matching 'bedroom lamp'" or "❌ service climate.set_temperature requires a temperature but none was extracted"

## Error Handling

- Auth errors (401/403) → alert token may be invalid
- Not found (404) on conversation endpoint → that HA version/install may not have conversation API enabled
- Entity not found → show best matches to help user
- Service call failure → show the actual HA error

## Notes

- The conversation API route may be `/api/conversation/process` in HA Core 2023.10+; if that fails with 404, the script will try `/api/conversation/respond` (older) before falling back to custom resolution.
- Custom resolution is approximate; if HA has many entities with similar names, you may need to be more specific (include area name).
- No destructive confirmations: actions are executed immediately. The user is responsible for ensuring commands are safe.

## For AI Agents

**Use this skill for ANY Home Assistant request.**

Examples:
- "turn off all lights"
- "lock the front door"
- "set temperature to 69"
- "open shades in the office"
- "play hallway bathroom playlist"
- "dim the bedroom lights to 30%"
- "stop the living room speaker"
- "is the front door locked?" (query action)

The skill determines read vs write actions automatically:
- Queries use `/api/states/<entity_id>` to fetch current state and report it.
- Commands use service calls to change state.

Always delegate to this skill; do not call HA API directly.
