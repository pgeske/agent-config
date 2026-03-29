# agent-browser local verification

Date: 2026-03-29

## Local CLI version

- `agent-browser --version` -> `agent-browser 0.23.0`

## Install and bootstrap status

- `agent-browser install` completed successfully.
- Output reported Chrome `147.0.7727.24` already installed.
- CLI warned that Linux environments may require `agent-browser install --with-deps` if launch fails.

## Re-verified command and flag subset

Verified with `agent-browser <command> --help`:

- `open`
- `wait`
- `snapshot`
- `screenshot`
- `click`
- `fill`
- `type`
- `press`
- `keyboard`
- `get`
- `find`
- `close`
- `tab`
- `session`
- `stream`
- `dashboard`
- `inspect`
- `record`
- `console`
- `errors`
- `highlight`
- `install`
- `auth`
- `state`

Verified in top-level `agent-browser --help` output:

- `--session`
- `--json`
- `--headed`
- `--profile`
- `--session-name`

## Smoke test results

### Remote page smoke

Command sequence:

```bash
agent-browser --session skill-registry-smoke open https://example.com && \
agent-browser --session skill-registry-smoke wait --load networkidle && \
agent-browser --session skill-registry-smoke get title && \
agent-browser --session skill-registry-smoke snapshot -i && \
agent-browser --session skill-registry-smoke screenshot && \
agent-browser --session skill-registry-smoke close
```

Result:

- Passed.
- Page title returned `Example Domain`.
- Snapshot returned interactive content, including link ref `e2`.
- Screenshot saved successfully under `~/.agent-browser/tmp/screenshots/`.
- Session closed cleanly.
- This verifies navigation, load waiting, title retrieval, snapshot output, screenshot capture, and session teardown on a real page.

### Deterministic local interaction smoke

Fixture setup wrote `/tmp/agent-browser-smoke.html` with a text input, a submit button, and a status node updated by button click.

Command sequence:

```bash
agent-browser --session skill-registry-local-smoke open file:///tmp/agent-browser-smoke.html && \
agent-browser --session skill-registry-local-smoke fill "#name" "Alyosha" && \
agent-browser --session skill-registry-local-smoke click "#submit" && \
agent-browser --session skill-registry-local-smoke get text "#status" && \
agent-browser --session skill-registry-local-smoke close
```

Result:

- Passed.
- `fill "#name" "Alyosha"` succeeded.
- `click "#submit"` succeeded.
- `get text "#status"` returned `Status: hello, Alyosha`.
- Session closed cleanly.
- This is the verified local evidence for input interaction; the remote smoke above does not itself prove fill/click behavior.

## Headed-mode and XRDP viability

Command attempted:

```bash
agent-browser --headed --session skill-registry-headed open https://example.com && \
agent-browser --session skill-registry-headed get title && \
agent-browser --session skill-registry-headed close
```

Result:

- Failed in this environment.
- Chrome exited early because no X server or `$DISPLAY` was available.
- `env | rg '^(DISPLAY|WAYLAND_DISPLAY|XRDP)'` returned no matching variables.
- Current conclusion: headed mode is not locally viable in this shell unless it is run inside a desktop/XRDP session or another environment that provides a working display server.

## Install footprint clarification

- `~/.opencode/skills` is itself a root symlink to `~/projects/skill-registry/skills` in this environment.
- Because that target already resolves to the registry skills root, `install.sh` intentionally skips per-skill creation there instead of creating nested child symlinks under `~/.opencode/skills`.
- As a result, `~/.opencode/skills/agent-browser` appears as a normal directory path while still resolving directly to the canonical registry copy.

Evidence gathered:

```bash
ls -ld ~/.opencode/skills ~/.opencode/skills/agent-browser ~/projects/skill-registry/skills/agent-browser
readlink -f ~/.opencode/skills
readlink -f ~/.opencode/skills/agent-browser
readlink -f ~/projects/skill-registry/skills/agent-browser
```

Observed result:

- `~/.opencode/skills -> /home/alyosha/projects/skill-registry/skills`
- `readlink -f ~/.opencode/skills/agent-browser` -> `/home/alyosha/projects/skill-registry/skills/agent-browser`
- `readlink -f ~/projects/skill-registry/skills/agent-browser` -> `/home/alyosha/projects/skill-registry/skills/agent-browser`
- Conclusion: the apparent plain directory under `~/.opencode/skills` is the expected view through the root symlink, not a copied or separately installed per-skill directory.

## Final footprint verification

- `~/.openclaw/workspace/skills/agent-browser` remains the copy-based target type.
- `~/.opencode/skills/agent-browser` resolves through the root symlinked target to the canonical registry directory.
- `~/.config/opencode/skills/agent-browser` remains an explicit per-skill symlink target.
- `~/.codex/skills/agent-browser` remains an explicit per-skill symlink target.
- Outcome: all targets still match the expected registry-managed footprint, and no reinstall was required for this clarification-only update.
