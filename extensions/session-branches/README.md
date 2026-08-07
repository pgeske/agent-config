# Session Branches

Parallel Pi conversation branches in tmux with explicit context merges back into the active parent session.

## Commands

### `/branch`

```text
/branch [--fresh] [--new-window] [--name "topic"] [--prompt "task"]
```

Creates a separate Pi session and launches it in tmux. When the parent is idle, it branches from the current leaf. When the parent agent is working, the request executes after the next tool call finishes and branches from the last completed turn, excluding the active partial turn and its tool calls. If the active run ends without another tool call, the branch starts at agent completion.

- The first same-window branch opens to the right of the parent pane.
- Later same-window branches stack on the right, newest on top.
- `--new-window` creates a named tmux window instead.
- `--fresh` starts without inherited conversation history.
- `--name` sets the Pi session name. The default is `<parent>-branch-<n>`.
- `--prompt` submits an initial task after the branch starts.
- Prompt text may also be written positionally, for example `/branch --fresh investigate this failure`.

Session depth is unlimited. `--new-window` starts a new window-local layout root at any depth. Within one tmux window, only its root Pi pane may create child panes; a pane child must use `--new-window` to branch further. Pi's threaded session selector uses each branch's immediate `parentSession`, so nested branches appear as a recursive session tree.

### `/detach`

Available only in a branch. Moves the current branch pane out of its shared tmux window and into a new named window without restarting Pi or changing the conversation. The detached branch becomes the layout root of its new window, so it can create its own same-window child branch.

The command refuses to move a branch that has live children. It also fails when the branch is already the only pane in its window.

### `/merge`

Available only in a branch. It summarizes conversation entries created after the explicit fork marker, injects the handoff into the active parent as a native Pi custom message, and closes the branch after the parent acknowledges it.

The parent must still be running on the same Pi session and must be idle. A branch with live children cannot merge until those children are merged or discarded. If the parent used `/tree` after the fork, the summary is appended to its current active path and the parent receives a warning. If summarization or delivery fails, the branch stays open.

### `/discard`

Available only in a branch. It confirms and then closes the branch without sending a handoff. A branch with live children cannot be discarded. The branch session file is retained for recovery.

## Parent delivery

Every active session owns a permission-restricted Unix socket under the system temporary directory so it can receive merges from immediate children. `/merge` uses that socket rather than `tmux send-keys`, so multiline summaries cannot corrupt the parent's editor. The parent validates the session and fork metadata before calling `pi.sendMessage()`.

## Filesystem caveat

This extension isolates Pi conversation sessions, not working directories. Parent and branch processes use the same current working directory and can interfere if they edit the same files concurrently. Use branches for research or coordinated work, or create a separate Git worktree manually when file isolation is required.

## Requirements

- Interactive Pi mode
- tmux
- A persisted Pi session
- Same-window branching requires the window to contain only the parent pane and panes created by this extension. Ambiguous layouts are rejected rather than modified.
