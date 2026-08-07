# tmux-notify Pi extension

Shows per-window tmux state for Pi sessions.

- `🔄` while any Pi pane in the tmux window is running
- `✅` when the agent finishes

The extension stores per-pane state in tmux pane user options (`@pi_notify_*`) and publishes the aggregate window marker to tmux window user options. The aggregate marker renders in both the status bar and `prefix + k` window chooser.

Only two automatic states are currently supported: running/loading and done. Agent completion always marks done; the extension does not infer failures from tool results or agent end events.

Clearing policy lives in the `tmux-pi-notify` helper:

- `🔄` stays visible while any Pi pane in the tmux window is running
- `✅` clears after `PI_TMUX_NOTIFY_DONE_TTL_SECONDS` (default `8`) if the window is visible then
- `✅` on inactive windows persists until that window is selected
- after a window is selected, `✅` clears after `PI_TMUX_NOTIFY_VIEWED_TTL_SECONDS` (default `4`)
- delayed clears are id-checked so old timers cannot clear newer notifications
