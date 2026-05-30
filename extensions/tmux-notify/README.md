# tmux-notify Pi extension

Shows per-window tmux state for Pi sessions.

- `🔄` while the agent is running
- `✅` when the agent finishes successfully
- `❌` when a tool/agent result looks failed
- manual states via `/tmux-notify review` (`👀`) and `/tmux-notify blocked` (`⚠️`)

The extension stores state in tmux window user options (`@pi_notify_*`) and renders the marker in both the status bar and `prefix + k` window chooser.

Clearing policy lives in the `tmux-pi-notify` helper:

- `🔄` stays visible while the agent is running
- `✅` / `❌` clear after `PI_TMUX_NOTIFY_DONE_TTL_SECONDS` (default `8`) if the window is visible then
- `✅` / `❌` on inactive windows persist until that window is selected
- after a window is selected, `✅` / `❌` clear after `PI_TMUX_NOTIFY_VIEWED_TTL_SECONDS` (default `4`)
- delayed clears are id-checked so old timers cannot clear newer notifications
