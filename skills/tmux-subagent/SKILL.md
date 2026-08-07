---
name: tmux-subagent
description: Use when the user asks to spin up, open, start, close, rename, or manage a subagent/agent as a Pi session in tmux, either in the same window/pane layout or in a new tmux window.
---

# tmux Subagent Workflow

Use this when Philip asks to "spin up a subagent", "open a Pi session", "start an agent in this window", "open a new window for this", "close that subagent", or similar.

Pi does not need a custom subagent extension for this workflow. A "subagent" means a separate interactive `pi` process running inside tmux.

## Core Safety Rule

Always target tmux panes/windows by stable tmux IDs, never by the implicit current pane/window after the user request has been received.

Philip may switch tmux windows while you are acting. Commands like `tmux split-window` or `tmux kill-pane` without `-t` can affect the wrong place.

At the start of any tmux subagent operation, capture the current Pi pane from `TMUX_PANE` and resolve the window from that pane. Do **not** use unqualified `tmux display-message`; in tool execution contexts with multiple clients/windows it can resolve against the wrong client and split the wrong window.

```bash
target_pane="${TMUX_PANE:?TMUX_PANE is not set; cannot safely target current Pi pane}"
target_window=$(tmux display-message -p -t "$target_pane" '#{window_id}')
```

Optionally verify the captured target before splitting:

```bash
tmux display-message -p -t "$target_pane" 'target window=#{window_index} #{window_id} pane=#{pane_id}'
```

Then use those IDs in later commands, e.g. `tmux split-window -t "$target_pane" ...`, `tmux new-window ...`, `tmux kill-pane -t "$pane_id"`, `tmux rename-window -t "$window_id" ...`.

If acting on an existing subagent from prior context, use the pane/window ID or exact window name captured when it was created. If you do not know the stable ID, inspect with `tmux list-panes -a` or `tmux list-windows` and ask if ambiguous.

## Naming and working directory

Use human-readable, topic-oriented names whenever enough context exists.

- New tmux windows: use concise names like `config-port`, `auth-investigation`, or `interview-process`.
- New Pi sessions: pass `--name "Human readable topic"` with the same topic in title case or short prose.
- Start new subagent Pi sessions from the home directory (`cd ~`) by default, unless Philip explicitly asks for a specific project, repository, or worktree directory.
- Avoid opaque names based only on channel IDs, timestamps, ticket IDs, or URLs unless no better topic is known.

Example:

```bash
tmux new-window -n auth-investigation "cd ~ && pi --name 'Authentication investigation' '...prompt...'"
```

## Same-window subagent layout

When Philip asks for a subagent "in this window", "in the same window", "on the right", or similar:

1. Capture the active `target_window` and `target_pane` immediately.
2. If the window has one pane, split the active pane to the right.
3. If there is already a right-side subagent area, split that right-side pane vertically so subagents stack top/bottom on the right.
4. Start `pi --name ...` in the new pane with the task prompt.
5. Return the pane ID and short topic name.

Use explicit targets. Do not rely on whatever tmux window is active after the command begins.

A practical implementation pattern:

```bash
target_pane="${TMUX_PANE:?TMUX_PANE is not set; cannot safely target current Pi pane}"
target_window=$(tmux display-message -p -t "$target_pane" '#{window_id}')
# Inspect panes in the captured window.
tmux list-panes -t "$target_window" -F '#{pane_id} #{pane_left} #{pane_top} #{pane_width} #{pane_height} #{pane_current_command}'
```

For the first subagent in a single-pane window:

```bash
tmux split-window -h -t "$target_pane" "cd ~ && pi --name '<Topic>' '<prompt>'"
```

For additional subagents, target an existing right-side pane and split vertically:

```bash
tmux split-window -v -t "$right_pane_id" "cd ~ && pi --name '<Topic>' '<prompt>'"
```

If you cannot reliably identify the right-side pane from `pane_left`, ask or use a new window instead of risking the wrong pane.

## New-window subagent layout

When Philip asks for a subagent "in a new window" or the task is large enough to deserve its own workspace:

1. Capture context if needed, but create a new tmux window with a human-readable topic name.
2. Start `pi --name '<Topic>'` in that window.
3. Include all relevant task context in the initial prompt.
4. State the window name in the response.

Example:

```bash
tmux new-window -n config-port "cd ~ && pi --name 'Agent config port' --thinking off '...task...'"
```

Use a project directory only when Philip explicitly asks for that working directory or the task requires a pre-created worktree path.

## Sending follow-up prompts to an existing subagent

When sending text to an already-running Pi subagent pane, do not paste raw multi-line text and press Enter. In the Pi TUI, pasted newlines can be interpreted as separate submitted turns, causing partial prompts, aborted operations, or many unintended generations.

Prefer one of these safe patterns:

1. **Best for detailed follow-ups:** write the full prompt to a temp file, then send a single-line instruction asking the subagent to read that file.

```bash
prompt_file=$(mktemp /tmp/pi-subagent-prompt.XXXXXX.txt)
cat > "$prompt_file" <<'EOF'
<long detailed prompt here>
EOF
tmux set-buffer "Please read $prompt_file and execute it as one follow-up task."
tmux paste-buffer -t "$pane_id"
tmux send-keys -t "$pane_id" Enter
```

2. **Best for short follow-ups:** collapse the prompt to a single line before pasting.

```bash
tmux set-buffer "One concise follow-up instruction with no literal newlines."
tmux paste-buffer -t "$pane_id"
tmux send-keys -t "$pane_id" Enter
```

Only use raw multi-line paste when you have verified the target interface accepts bracketed paste as a single unsent input block.

## Checking subagent status

Use one `tmux capture-pane` or Pi/Trajectory status check and report what is visible. Do not wait by chaining `sleep` with repeated pane captures, and do not poll a subagent until it finishes unless Philip explicitly asks. Prefer the completion notification mechanism when available; otherwise leave the subagent running and let Philip request another check.

## Closing or renaming subagents

When asked to close or rename a subagent/window:

- Use a stable pane/window ID or exact window name from the relevant session, not the current active target.
- If the user refers by window number, it is acceptable to use that number once, but prefer resolving it first with `tmux list-windows`.
- If ambiguous, ask before killing panes/windows.

Examples:

```bash
tmux rename-window -t '%6' auth-investigation
# or, after resolving pane id:
tmux kill-pane -t '%23'
```

## External side effects

Subagent Pi sessions inherit normal user preferences:

- Do not send messages, post reviews, merge changes, or trigger deployments unless explicitly asked in that moment.
- Create drafts when a response is requested but immediate sending is not explicitly authorized.
- Use read-only investigation unless the user asks for changes.

## Response style

When writing the initial prompt for a subagent:

- Ask it to print its final concise result in the subagent session, not only write a file.
- Use `/tmp` result files only as backup/artifacts, not as the sole deliverable.
- If a result file is useful, ask for both: a short on-screen summary and the file path.

After starting a subagent, respond briefly with:

- tmux window or pane name/ID
- Pi session human-readable name, if set
- one-line description of the assigned task

When reporting completed subagent work back to Philip, read the result and summarize it directly in chat. Do not require Philip to open `/tmp` or other local files unless he explicitly asks for a file-only handoff.
