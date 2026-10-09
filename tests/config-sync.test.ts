import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, lstat, mkdir, writeFile, readdir, readlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const syncScript = join(repoRoot, "scripts", "sync.mjs");

async function runSync(args: string[], env: NodeJS.ProcessEnv = {}) {
  return execFileAsync(process.execPath, [syncScript, ...args], { cwd: repoRoot, env: { ...process.env, ...env } });
}

test("config sync dry-run does not write into the target home", async () => {
  const home = await mkdtemp(join(tmpdir(), "agent-config-sync-dry-"));
  try {
    const { stdout } = await runSync(["--dry-run", "--home", home, "--config-home", join(home, ".config"), "--mode", "copy"]);

    assert.match(stdout, /Dry run \(copy\)/);
    assert.match(stdout, /\+ tmux config/);
    await assert.rejects(() => lstat(join(home, ".tmux.conf")), /ENOENT/);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("config sync targets LOCALAPPDATA for Neovim on Windows", { skip: process.platform !== "win32" }, async () => {
  const localAppData = await mkdtemp(join(tmpdir(), "agent-config-sync-localappdata-"));
  try {
    const { stdout } = await runSync(["--dry-run", "--mode", "copy"], { LOCALAPPDATA: localAppData });

    assert.match(stdout, new RegExp(`Neovim config: ${escapeRegExp(join(localAppData, "nvim"))}`));
  } finally {
    await rm(localAppData, { recursive: true, force: true });
  }
});

function escapeRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("config sync copies managed dotfiles into a fake home", async () => {
  const home = await mkdtemp(join(tmpdir(), "agent-config-sync-copy-"));
  try {
    const env = { LOCALAPPDATA: join(home, "AppData", "Local") };
    const args = ["--home", home, "--config-home", join(home, ".config"), "--mode", "copy"];
    const first = await runSync(args, env);

    assert.match(first.stdout, /Sync complete \(copy\)/);
    assert.equal(await readFile(join(home, ".tmux.conf.local"), "utf8"), await readFile(join(repoRoot, "dotfiles", "tmux", "tmux.conf.local"), "utf8"));
    const nvimTarget = process.platform === "win32"
      ? join(home, "AppData", "Local", "nvim")
      : join(home, ".config", "nvim");
    assert.equal(await readFile(join(nvimTarget, "init.lua"), "utf8"), await readFile(join(repoRoot, "dotfiles", "nvim", "init.lua"), "utf8"));
    assert.equal(await readFile(join(home, ".config", "ghostty", "config"), "utf8"), await readFile(join(repoRoot, "dotfiles", "ghostty", "config"), "utf8"));
    assert.equal(await readFile(join(home, ".config", "herdr", "config.toml"), "utf8"), await readFile(join(repoRoot, "dotfiles", "herdr", "config.toml"), "utf8"));
    if (process.platform !== "win32") {
      assert.equal(await readFile(join(home, ".local", "bin", "omp"), "utf8"), await readFile(join(repoRoot, "dotfiles", "omp", "bin", "omp"), "utf8"));
    }

    const second = await runSync(args, env);
    assert.match(second.stdout, /= Neovim config/);
    assert.match(second.stdout, /= Herdr config/);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("config sync symlinks managed dotfiles on non-Windows platforms", { skip: process.platform === "win32" }, async () => {
  const home = await mkdtemp(join(tmpdir(), "agent-config-sync-link-"));
  try {
    await runSync(["--home", home, "--config-home", join(home, ".config"), "--mode", "symlink"]);

    assert.equal((await lstat(join(home, ".tmux.conf"))).isSymbolicLink(), true);
    assert.equal((await lstat(join(home, ".config", "nvim"))).isSymbolicLink(), true);
    assert.equal((await lstat(join(home, ".local", "bin", "omp"))).isSymbolicLink(), true);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("config sync backs up only the replaced Herdr config", { skip: process.platform === "win32" }, async () => {
  const home = await mkdtemp(join(tmpdir(), "agent-config-herdr-"));
  try {
    const herdr = join(home, ".config", "herdr");
    await mkdir(herdr, { recursive: true });
    await writeFile(join(herdr, "config.toml"), "user config");
    await writeFile(join(herdr, "session.json"), "user session state");
    const args = ["--home", home, "--config-home", join(home, ".config"), "--mode", "symlink"];

    await runSync([...args, "--dry-run"]);
    assert.equal(await readFile(join(herdr, "config.toml"), "utf8"), "user config");
    assert.deepEqual((await readdir(herdr)).sort(), ["config.toml", "session.json"]);

    await runSync(args);
    assert.equal(await readlink(join(herdr, "config.toml")), join(repoRoot, "dotfiles", "herdr", "config.toml"));
    const backups = (await readdir(herdr)).filter((name) => name.startsWith("config.toml.bak-"));
    assert.equal(backups.length, 1);
    assert.equal(await readFile(join(herdr, backups[0]!), "utf8"), "user config");
    assert.equal(await readFile(join(herdr, "session.json"), "utf8"), "user session state");

    const second = await runSync(args);
    assert.match(second.stdout, /= Herdr config/);
    assert.equal((await readdir(herdr)).length, 3);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
