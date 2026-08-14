# Fast compaction

Replaces Pi's default text compaction with a thinking level of `off`. It uses the active session model by default, so the extension remains portable across personal providers.

Set both `PI_FAST_COMPACTION_PROVIDER` and `PI_FAST_COMPACTION_MODEL` to use a separate model from the local Pi model catalog. Provider credentials remain in Pi's machine-local authentication store.

The extension keeps Pi's normal summary format, recent-message retention, split-turn handling, usage accounting, and structured file-operation details. It removes cumulative `<read-files>` and `<modified-files>` blocks from both the previous rolling summary and the new model-visible summary so months of unrelated paths do not consume context.

Pi's existing output ceiling remains unchanged. If the selected model is unavailable, authentication cannot be resolved, or custom compaction fails, the extension warns and falls back to Pi's default compaction.
