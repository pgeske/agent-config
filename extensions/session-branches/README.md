# Session Branches

Parallel Pi conversation branches in tmux with explicit context merges back into the active parent session.

## Commands

### `/branch`

```text
/branch [--with-context] [--new-window] [--name "topic"] [--cwd "path"] [--prompt "task"] [--model "provider/model"] [--thinking "level"]
```

Creates a fresh Pi session and launches it in tmux. The parent fork point is the current leaf when idle or the latest settled agent response when the parent is working. Intermediate tool-loop turns from the active run are never included. The fork point is retained for merging even when the new branch does not inherit its conversation.

- The first same-window branch opens to the right of the parent pane.
- Later same-window branches stack on the right, newest on top.
- `--new-window` creates a named tmux window instead.
- `--with-context` seeds the branch with the parent conversation through the fork point.
- `--name` sets the Pi session name directly. When it is omitted, Pi opens a centered, themed name input; Enter creates the branch and Escape cancels.
- `--cwd` launches the branch in another existing directory, such as a dedicated Git worktree. The default is the parent's working directory.
- `--prompt` submits an initial task after the branch starts.
- `--model` overrides the child Pi model (for example `provider/model`). Omit to inherit the parent's model.
- `--thinking` overrides the child Pi thinking level. Omit to inherit the parent's thinking level.
- Prompt text may also be written positionally, for example `/branch investigate this failure`.

Session depth is unlimited. `--new-window` starts a new window-local layout root at any depth. Within one tmux window, only its root Pi pane may create child panes; a pane child must use `--new-window` to branch further. Pi's threaded session selector uses each branch's immediate `parentSession`, so nested branches appear as a recursive session tree.

### `/detach`

Available only in a branch. Moves the current branch pane out of its shared tmux window and into a new named window without restarting Pi or changing the conversation. The detached branch becomes the layout root of its new window, so it can create its own same-window child branch.

The command refuses to move a branch that has live children. It also fails when the branch is already the only pane in its window.

### `/merge`

Available only in a branch. It summarizes conversation entries created after the explicit fork marker, injects the handoff into the active parent as a native Pi custom message, and closes the branch after the parent acknowledges it.

The parent must still be running on the same Pi session and must be idle. A branch with live children cannot merge until those children are merged or discarded. If the parent used `/tree` after the fork, the summary is appended to its current active path and the parent receives a warning. If summarization or delivery fails, the branch stays open.

### `/discard`

Available only in a branch. It confirms and then closes the branch without sending a handoff. A branch with live children cannot be discarded. The branch session file is retained for recovery.

## Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+N` | Name and create a branch in a new tmux window |
| `Ctrl+Shift+N` | Name and create a branch in the current tmux window |
| `Ctrl+Shift+M` | Merge the current branch into its parent |

The merge shortcut is meaningful only inside a branch. Modified-key shortcuts require a terminal and tmux configured for the extended keyboard protocol; the shared tmux configuration enables `extended-keys` with `csi-u`.

## Agent tools

The extension also exposes model-callable tools so the active agent can delegate without trying to type slash commands into its own TUI:

- `branch` accepts one or more `{ name, prompt, cwd?, withContext?, newWindow?, model?, thinkingLevel? }` tasks and launches them sequentially. A single call can safely create several sibling branches without racing tmux layout updates. `model` and `thinkingLevel` override the child Pi model and thinking level; omit them to inherit the parent's.
- `merge_branch` is available inside a branch so its agent can summarize the completed work to the parent and close itself.

The tool preserves the command defaults: branches start fresh in same-window panes. Each task can opt into parent context, a new window, or another existing working directory.

## Parent delivery

Every active session owns a permission-restricted Unix socket under the system temporary directory so it can receive merges from immediate children. `/merge` uses that socket rather than `tmux send-keys`, so multiline summaries cannot corrupt the parent's editor. The parent validates the session and fork metadata before calling `pi.sendMessage()`.

## Filesystem caveat

Conversation sessions are isolated, but working directories are shared unless a branch is given `--cwd` (or a tool task supplies `cwd`). Use separate Git worktrees for concurrent file-modifying branches.

## Requirements

- Interactive Pi mode
- tmux
- A persisted Pi session
- Same-window branching requires the window to contain only the parent pane and panes created by this extension. Ambiguous layouts are rejected rather than modified.
