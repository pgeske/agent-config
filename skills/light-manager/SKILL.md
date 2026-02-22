---
name: light-manager
description: Manages home lighting using natural language commands by interfacing with the homeassistant skill. Supports turning lights on/off, adjusting brightness, changing colors, applying themes (e.g., "Harry Potter mode"), and querying light status (e.g., "how long has this been on?"). Use when the user wants to control lights via the Home Assistant integration with simple, conversational instructions. The skill interprets the request, executes the appropriate action via homeassistant, and reports the result back to the user with clear confirmation or explanation of any issues.
version: "0.1.0"
author: alyosha
dependencies:
  - homeassistant
---

# Light Manager

## Overview

This skill provides natural language control over your home lighting system through Home Assistant. You can give commands like "turn off all the lights", "dim the living room to 50%", "set the bedroom to blue", or "apply a Harry Potter theme". The skill interprets your intent, translates it into Home Assistant actions via the `homeassistant` skill, executes them, and returns a friendly status message.

**Key features:**
- On/off control for individual lights, groups, or all lights
- Brightness adjustment (percentages or descriptive terms like "dim", "bright")
- Color changes (named colors, hex codes, or descriptive themes)
- Scene/theme application (e.g., holiday-specific, movie-themed)
- Status queries (on/off state, brightness, color, uptime)
- Graceful error handling with clear explanations

## Core Capabilities

### 1. Power Control
Turn lights on or off, either individually, by group, or all at once.

**Examples:**
- "turn off all the lights"
- "switch on the kitchen lights"
- "turn the bedroom lamp off"
- "power on every light in the house"

### 2. Brightness Adjustment
Set brightness levels using percentages (1-100) or descriptive terms.

**Examples:**
- "dim the living room to 30%"
- "set the bedroom lights to maximum brightness"
- "brighten the kitchen a little"
- "make the hallway lights 75%"

### 3. Color Control
Change light colors using color names, hex codes, or descriptive themes.

**Examples:**
- "set the dining room lights to red"
- "change the bedroom color to #FF5733"
- "make the living room blue-ish"
- "turn all lights purple"

### 4. Theme/Scene Application
Apply predefined color and brightness combinations for specific moods or events.

**Built-in themes:** `harry-potter`, ` christmas`, `halloween`, `sunset`, `ocean`, `forest`, `romantic`, `focus`, `relax`, `party`

**Examples:**
- "set the lights to a Harry Potter theme"
- "apply a Christmas scene to the tree lights"
- "make it feel like sunset in here"
- "party mode for the living room"

### 5. Status Queries
Ask questions about light states, including uptime and current settings.

**Examples:**
- "is the kitchen light on?"
- "how long has the bedroom lamp been on?"
- "what brightness is the living room set to?"
- "what color are the hallway lights?"

### 6. Group Control
Target lights by location, type, or custom groups.

**Examples:**
- "turn off all first floor lights"
- "dim all bedroom lights to 40%"
- "set the downstairs lights to blue"
- "brighten the reading lamps"

## How It Works

1. **Interpretation:** The skill parses your natural language request to determine intent (power, brightness, color, theme, or query) and target (which light(s) to affect).
2. **Translation:** It maps your intent to the appropriate Home Assistant service call (e.g., `light.turn_on`, `light.turn_off`, etc.) with parameters.
3. **Execution:** The `homeassistant` skill is invoked to perform the action on your Home Assistant instance.
4. **Response:** The skill formulates a friendly confirmation message summarizing what happened, or explains why an action failed (e.g., light not found, unsupported feature, connection issue).

## Handling Ambiguity

If your request is ambiguous, the skill will:
- Ask clarifying questions when critical information is missing
- Make reasonable assumptions for common cases (e.g., "turn off the lights" → all lights)
- Default to safe actions (e.g., "dim" → -20% from current level)

## Limitations

The skill can only control what Home Assistant exposes:
- Must have lights properly configured in Home Assistant with entity IDs
- Some advanced features (color temperature, effects) depend on your light capabilities
- Theme availability depends on your Home Assistant scenes/automations

## Notes for Implementation

- Always use the `homeassistant` skill to execute actions; do not call Home Assistant APIs directly.
- Preserve the user's original phrasing where appropriate in responses for naturalness.
- For failures, provide actionable feedback (e.g., "I couldn't find a light called 'bedroom lamp'. Available lights: bedroom_main, bedroom_lamp").
- When querying uptime, use Home Assistant's `sensor` entities or history if available.

## Resources

### references/colors.md
Common color names mapped to RGB/HSV values for convenience.

### references/themes.md
Predefined theme configurations (color palettes, brightness levels) for seasonal or mood lighting.

### scripts/translate.py (optional)
Utility for converting natural language brightness descriptors ("a little", "quite bright") to percentages.

