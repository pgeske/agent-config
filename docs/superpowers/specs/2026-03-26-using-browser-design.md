---
title: Design for a general-purpose visible browser skill
date: 2026-03-26
status: approved-in-chat
---

# Design for a general-purpose visible browser skill

## Context

The skill registry already contains `browser-testing`, which is oriented toward testing web applications, media playback, screenshots, and GUI troubleshooting. The desired behavior here is broader: when a task requires a real browser window rather than read-only page retrieval, the agent should open a non-headless browser and work through that browser-first workflow.

At the same time, `webfetch` should remain the default for pure read-only retrieval, summarization, and content inspection where no visible browser session is needed.

## Goals

- Add a skill for general-purpose browser usage with a visible browser window.
- Keep `browser-testing` focused on testing web applications and media behavior.
- Make the trigger easy to discover from natural-language requests such as "open this site", "log in", "click around", or "check what is on the page".
- Standardize a reliable non-headless Chromium launch flow, including display selection and launch verification.
- Avoid silent failures caused by Chromium reusing an existing session on the wrong display.

## Non-goals

- Replace `webfetch` for read-only retrieval.
- Turn the new skill into a full browser automation framework.
- Rework unrelated registry structure or existing skills beyond what is needed to clarify browser responsibilities.

## Approaches considered

### 1. Recommended: add a new general-purpose browser skill and keep `browser-testing` narrow

This keeps discovery clean. Testing-oriented tasks continue to load `browser-testing`, while general visible-browser tasks load a dedicated skill. This is the lowest-risk option because it preserves existing behavior and creates clearer trigger language for future agent sessions.

### 2. Expand `browser-testing` to cover all browser use

This reduces the number of skills, but it blurs two distinct triggers: testing a web application versus using a visible browser for general browsing tasks. That ambiguity makes discovery and correct application worse.

### 3. Replace `browser-testing` with one unified browser skill

This could be clean in the long term, but it creates more churn now and increases the chance of regressions for current browser-testing use cases.

## Recommended design

### Skill split

- Keep `browser-testing` focused on test scenarios: local or remote web-app testing, media playback verification, screenshots, layout or rendering debugging, and display troubleshooting for testing contexts.
- Add a new skill named `using-browser` for general-purpose visible-browser work.
- Treat `webfetch` as the read-only counterpart: if the task can be fully satisfied by passive page retrieval, use `webfetch`; if it implies opening, interacting with, or observing a real browser window, use `using-browser`.

### Trigger rules for `using-browser`

The `using-browser` skill should be discoverable from intent, not from site type. It should apply when requests imply a live visible browser session, for example:

- "open this site"
- "go to this page"
- "log in"
- "click around"
- "check what is on the page" when the user expects a live visible page rather than a passive fetch
- "use the browser"
- any other task where the user expects a real UI session rather than a text fetch

It should explicitly instruct the agent:

- Use `webfetch` only for pure read-only retrieval.
- Use `using-browser` whenever the user asks to open a site, observe the real UI, or perform browser interaction.
- If the request is ambiguous, prefer `webfetch` for passive inspection and `using-browser` when the wording implies a visible browser window or live interaction.
- Prefer a visible browser even for simple tasks if the user explicitly asked for the browser to be opened.

### Launch workflow

The core default should be non-headless Chromium launched in the background, with verification after launch.

The workflow should include:

1. Resolve a browser binary (`chromium`, `google-chrome`, or equivalent).
2. Determine the display:
   - prefer the current `DISPLAY` if it works
   - otherwise inspect `/tmp/.X11-unix/`
   - when multiple displays exist, do not assume the first one is the user-visible session without verification
3. Launch Chromium non-headless with standard flags such as `--window-size`, `--no-first-run`, and `--no-default-browser-check`.
4. Background the process so the terminal remains usable.
5. Verify that the process exists and inspect logs if the browser does not appear.
6. Report back the chosen browser, display, and PID.

### Isolation and reuse

Chromium may attach to an existing browser session instead of opening a new visible window on the intended display. The skill should document a fallback path:

- first try a normal launch
- if Chromium reports that it opened in an existing session, or the user cannot see the window, relaunch with `--new-window` and an isolated `--user-data-dir`
- keep the isolated-profile pattern lightweight and temporary so it is easy to discard

### Troubleshooting expectations

The new skill should include compact troubleshooting for the cases most likely to matter in general browser use:

- browser started but user cannot see it
- multiple X displays exist
- Chromium reused the wrong running session
- non-fatal GPU or DBus errors appear in logs
- browser binary is missing

This should be slimmer than `browser-testing`; the emphasis is practical launch reliability, not deep web-app test guidance.

### Changes to `browser-testing`

`browser-testing` should stay available, but it can be trimmed so its description and opening sections clearly emphasize testing-specific triggers. The new skill should absorb the general-purpose visible-browser guidance so the testing skill does not become the catch-all browser entry point.

Likely changes:

- keep testing and media-validation instructions
- remove or shorten general-purpose wording that suggests it is for all browser usage
- add a "see also" reference to `using-browser` for general visible-browser tasks

## Testing strategy for the skill work

Because this is a skill-authoring task, validation should follow the existing skill-writing discipline:

- capture a baseline failure mode that motivated the change: the agent used a non-headless browser but picked the wrong display and did not reliably confirm where it opened
- create or update skills only after documenting that baseline
- test the new skill against scenarios that mention opening a real browser, not merely fetching a page
- verify that `browser-testing` still matches testing-oriented requests and that `using-browser` matches general browsing requests

## Implementation notes

Planned implementation should happen in `~/projects/skill-registry/skills/using-browser/SKILL.md`, with any minimal helper or reference files only if they materially improve reliability. After creation, install through `~/projects/skill-registry/install.sh using-browser`, and if `browser-testing` is adjusted, reinstall that skill as well.

## Open questions resolved in chat

- `webfetch` remains reserved for pure read-only retrieval.
- `browser-testing` should remain testing-oriented rather than becoming the general browser skill.
- A new general-purpose visible-browser skill is the preferred direction.
