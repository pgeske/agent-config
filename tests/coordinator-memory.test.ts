import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const script = resolve("skills/coordinator-memory/scripts/notes_root.py");

// Fake HOME keeps setup and error-path checks away from the user's real notes.
function fixture(t: { after: (fn: () => void) => void }) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "coordinator-memory-")));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const config = join(home, ".config/coordinator-memory/config.json");
  function configure(value: unknown) {
    mkdirSync(resolve(config, ".."), { recursive: true });
    writeFileSync(config, JSON.stringify(value));
  }
  function run(root = "", args: string[] = []) {
    return spawnSync("python3", [script, ...args], {
      env: { ...process.env, HOME: home, COORDINATOR_NOTES_DIR: root },
      encoding: "utf8",
    });
  }
  return { home, configure, run };
}

test("missing config fails without creating notes", (t) => {
  const { home, run } = fixture(t);
  const result = run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /No notes directory configured/);
  assert.equal(existsSync(join(home, ".config")), false);
});

test("local config expands home; resolution is read-only", (t) => {
  const { home, configure, run } = fixture(t);
  configure({ notes_dir: "~/notes with spaces/coordinator" });
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  const data = JSON.parse(result.stdout);
  assert.equal(data.root, join(home, "notes with spaces/coordinator"));
  assert.equal(data.exists, false);
  assert.equal(existsSync(data.root), false);
});

test("environment overrides config; init preserves existing notes", (t) => {
  const { home, configure, run } = fixture(t);
  configure({ notes_dir: "~/unused" });
  const root = join(home, "chosen");
  assert.equal(run(root, ["--init"]).status, 0);
  assert.ok(existsSync(join(root, "daily")));
  assert.ok(existsSync(join(root, "workers")));
  writeFileSync(join(root, "briefing.md"), "Existing priorities\n");
  assert.equal(run(root, ["--init"]).status, 0);
  assert.equal(readFileSync(join(root, "briefing.md"), "utf8"), "Existing priorities\n");
  assert.equal(existsSync(join(home, "unused")), false);
});

test("bad configuration fails clearly", (t) => {
  const { home, configure, run } = fixture(t);
  for (const value of [[], {}, { notes_dir: 3 }, { notes_dir: "relative/path" }]) {
    configure(value);
    assert.equal(run().status, 1);
  }
  const file = join(home, "not-a-directory");
  writeFileSync(file, "data");
  assert.match(run(file).stderr, /is a file/);
});

test("command shortcuts reference installed skills and accept guidance", () => {
  for (const [command, skill] of [
    ["catch-up", "coordinator-memory"],
    ["wrap-up", "coordinator-memory"],
    ["worker-handoff", "worker-handoff"],
  ]) {
    const text = readFileSync(`commands/${command}.md`, "utf8");
    assert.ok(text.includes(`\`${skill}\``));
    assert.ok(text.includes("$ARGUMENTS"));
    assert.ok(existsSync(`skills/${skill}/SKILL.md`));
  }
});
