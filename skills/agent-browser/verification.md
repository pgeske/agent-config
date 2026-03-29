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

Fixture setup refreshed `/tmp/agent-browser-smoke.html` with title `Agent Browser Smoke`, selectors `#name`, `#submit`, and `#status`, and a button handler that updates the status text to `Status: hello, <name>`.

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

## Headed-mode default and XRDP/LXQt verification

This machine's documented default browser path is now headed mode on the XRDP/LXQt desktop at `DISPLAY=:10`.

Final headed-default interaction smoke command:

```bash
DISPLAY=:10 agent-browser --headed --session final-headed-default open file:///tmp/agent-browser-smoke.html && \
DISPLAY=:10 agent-browser --session final-headed-default fill "#name" "Alyosha" && \
DISPLAY=:10 agent-browser --session final-headed-default click "#submit" && \
DISPLAY=:10 agent-browser --session final-headed-default get text "#status" && \
DISPLAY=:10 agent-browser --session final-headed-default close
```

Result:

- Passed on `DISPLAY=:10`.
- Headed mode is the documented default on this machine.
- `DISPLAY=:10` is the documented preferred XRDP/LXQt display for headed launches on this machine.
- The actual observed `get text "#status"` output was `Status: hello, Alyosha`.
- Session closed cleanly.

Fallback policy:

- If `DISPLAY=:10` is unavailable, agents should report that failure explicitly.
- Agents should only try another display after that display has been verified to work.
- Headless mode is documented as the fallback path when no verified headed display is available.

Verification commands run and observed returns:

```text
node -e 'const fs=require("fs"); const html=fs.readFileSync("/tmp/agent-browser-smoke.html","utf8"); const out={exists:fs.existsSync("/tmp/agent-browser-smoke.html"), title:/<title>([^<]*)<\/title>/i.test(html)&&RegExp.$1==="Agent Browser Smoke", name:/id="name"/.test(html), submit:/id="submit"/.test(html), status:/id="status"/.test(html)}; console.log(JSON.stringify(out, null, 2));'
```

- Returned:

```json
{
  "exists": true,
  "title": true,
  "name": true,
  "submit": true,
  "status": true
}
```

- This fixture check was recorded before the headed run and preserves the concrete smoke-fixture evidence that the local page still matched the expected title and selectors.

```text
read /tmp/agent-browser-smoke.html
```

- Confirmed title `Agent Browser Smoke` and selectors `#name`, `#submit`, and `#status` are still present in `/tmp/agent-browser-smoke.html`.

```text
DISPLAY=:10 agent-browser --headed --session final-headed-default open file:///tmp/agent-browser-smoke.html
```

- Returned page title line `Agent Browser Smoke` and URL `file:///tmp/agent-browser-smoke.html`.

```text
DISPLAY=:10 agent-browser --session final-headed-default fill "#name" "Alyosha"
```

- Returned `Done`.

```text
DISPLAY=:10 agent-browser --session final-headed-default click "#submit"
```

- Returned `Done`.

```text
DISPLAY=:10 agent-browser --session final-headed-default get text "#status"
```

- Returned `Status: hello, Alyosha`.

```text
DISPLAY=:10 agent-browser --session final-headed-default close
```

- Returned `Browser closed`.

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
