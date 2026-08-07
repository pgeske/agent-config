import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, lstat, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const syncScript = join(repoRoot, "scripts", "sync.mjs");
const experimentalInstallScript = join(repoRoot, "scripts", "install-experimental-pi.mjs");

async function runSync(args: string[], env: NodeJS.ProcessEnv = {}) {
  return execFileAsync(process.execPath, [syncScript, ...args], { cwd: repoRoot, env: { ...process.env, ...env } });
}

test("config sync dry-run does not write into the target home", async () => {
  const home = await mkdtemp(join(tmpdir(), "agent-config-sync-dry-"));
  try {
    const { stdout } = await runSync(["--dry-run", "--home", home, "--config-home", join(home, ".config"), "--pi-agent-dir", join(home, ".pi", "agent"), "--mode", "copy"]);

    assert.match(stdout, /Dry run \(copy\)/);
    assert.match(stdout, /Pi AGENTS\.md/);
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
    const piAgentDir = join(home, ".pi", "agent");
    await mkdir(piAgentDir, { recursive: true });
    await writeFile(join(piAgentDir, "settings.json"), JSON.stringify({
      defaultProvider: "anthropic",
      defaultModel: "personal-model",
      packages: ["npm:existing-package"],
    }));
    const args = ["--home", home, "--config-home", join(home, ".config"), "--pi-agent-dir", piAgentDir, "--mode", "copy"];
    const first = await runSync(args, env);

    assert.match(first.stdout, /Sync complete \(copy\)/);
    assert.match(first.stdout, /\+ Pi AGENTS\.md/);
    assert.match(first.stdout, /~ Pi settings overlay/);
    assert.equal(await readFile(join(piAgentDir, "AGENTS.md"), "utf8"), await readFile(join(repoRoot, "AGENTS.md"), "utf8"));
    const settings = JSON.parse(await readFile(join(piAgentDir, "settings.json"), "utf8"));
    assert.equal(settings.defaultProvider, "anthropic");
    assert.equal(settings.defaultModel, "personal-model");
    assert.equal(settings.uiMode, "fullscreen");
    assert.deepEqual(settings.packages, ["npm:existing-package", "npm:pi-web-access@0.13.0"]);
    assert.equal(await readFile(join(piAgentDir, "keybindings.json"), "utf8"), await readFile(join(repoRoot, "dotfiles", "pi", "keybindings.json"), "utf8"));
    assert.equal(await readFile(join(home, ".pi", "web-search.json"), "utf8"), await readFile(join(repoRoot, "dotfiles", "pi", "web-search.json"), "utf8"));
    assert.equal(await readFile(join(home, ".tmux.conf.local"), "utf8"), await readFile(join(repoRoot, "dotfiles", "tmux", "tmux.conf.local"), "utf8"));
    const nvimTarget = process.platform === "win32"
      ? join(home, "AppData", "Local", "nvim")
      : join(home, ".config", "nvim");
    assert.equal(await readFile(join(nvimTarget, "init.lua"), "utf8"), await readFile(join(repoRoot, "dotfiles", "nvim", "init.lua"), "utf8"));
    assert.equal(await readFile(join(home, ".config", "ghostty", "config"), "utf8"), await readFile(join(repoRoot, "dotfiles", "ghostty", "config"), "utf8"));
    if (process.platform !== "win32") {
      assert.equal(await readFile(join(piAgentDir, "bin", "pi"), "utf8"), await readFile(join(repoRoot, "dotfiles", "pi", "bin", "pi"), "utf8"));
    }

    const second = await runSync(args, env);
    assert.match(second.stdout, /= Pi AGENTS\.md/);
    assert.match(second.stdout, /= Pi settings overlay/);
    assert.match(second.stdout, /= Neovim config/);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("config sync symlinks managed dotfiles on non-Windows platforms", { skip: process.platform === "win32" }, async () => {
  const home = await mkdtemp(join(tmpdir(), "agent-config-sync-link-"));
  try {
    await runSync(["--home", home, "--config-home", join(home, ".config"), "--pi-agent-dir", join(home, ".pi", "agent"), "--mode", "symlink"]);

    const tmux = await lstat(join(home, ".tmux.conf"));
    const nvim = await lstat(join(home, ".config", "nvim"));
    const settings = await lstat(join(home, ".pi", "agent", "settings.json"));
    const launcher = await lstat(join(home, ".pi", "agent", "bin", "pi"));
    assert.equal(tmux.isSymbolicLink(), true);
    assert.equal(nvim.isSymbolicLink(), true);
    assert.equal(settings.isFile(), true);
    assert.equal(launcher.isSymbolicLink(), true);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("experimental Pi install dry-run does not create a checkout", async () => {
  const home = await mkdtemp(join(tmpdir(), "agent-config-experimental-dry-"));
  const checkout = join(home, ".pi", "experimental", "pi-test");
  try {
    const { stdout } = await execFileAsync(process.execPath, [
      experimentalInstallScript,
      "--dry-run",
      "--home", home,
      "--checkout", checkout,
    ], { cwd: repoRoot });

    assert.match(stdout, /git.*fetch/);
    assert.match(stdout, /npm.*run.*build/);
    await assert.rejects(() => lstat(checkout), /ENOENT/);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
