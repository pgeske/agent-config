import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, lstat, mkdir, writeFile, readdir, readlink, symlink } from "node:fs/promises";
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
      modelThinkingLevels: { "anthropic/personal-model": "high" },
      externalEditor: "nvim",
      compaction: { enabled: false, reserveTokens: 1000, keepRecentTokens: 2000 },
      packages: ["npm:existing-package", "npm:pi-web-access@0.13.0"],
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
    assert.deepEqual(settings.modelThinkingLevels, { "anthropic/personal-model": "high" });
    assert.equal(settings.externalEditor, "nvim");
    assert.equal("compaction" in settings, false);
    assert.equal(settings.tuiMode, "fullscreen");
    assert.equal(settings.theme, "catppuccin-frappe");
    assert.deepEqual(settings.packages, [
      "npm:existing-package",
      { source: "npm:pi-web-access@0.13.0", skills: [] },
      "npm:pi-mcp-adapter@2.21.2",
    ]);
    assert.equal(await readFile(join(piAgentDir, "themes", "catppuccin-frappe.json"), "utf8"), await readFile(join(repoRoot, "dotfiles", "pi", "themes", "catppuccin-frappe.json"), "utf8"));
    assert.equal(await readFile(join(piAgentDir, "keybindings.json"), "utf8"), await readFile(join(repoRoot, "dotfiles", "pi", "keybindings.json"), "utf8"));
    assert.equal(await readFile(join(home, ".pi", "web-search.json"), "utf8"), await readFile(join(repoRoot, "dotfiles", "pi", "web-search.json"), "utf8"));
    if (process.platform === "darwin") {
      assert.equal(await readFile(join(home, ".config", "mcp", "mcp.json"), "utf8"), await readFile(join(repoRoot, "dotfiles", "mcp", "mcp.json"), "utf8"));
    }
    assert.equal(await readFile(join(home, ".tmux.conf.local"), "utf8"), await readFile(join(repoRoot, "dotfiles", "tmux", "tmux.conf.local"), "utf8"));
    const nvimTarget = process.platform === "win32"
      ? join(home, "AppData", "Local", "nvim")
      : join(home, ".config", "nvim");
    assert.equal(await readFile(join(nvimTarget, "init.lua"), "utf8"), await readFile(join(repoRoot, "dotfiles", "nvim", "init.lua"), "utf8"));
    assert.equal(await readFile(join(home, ".config", "ghostty", "config"), "utf8"), await readFile(join(repoRoot, "dotfiles", "ghostty", "config"), "utf8"));
    assert.equal(await readFile(join(home, ".config", "herdr", "config.toml"), "utf8"), await readFile(join(repoRoot, "dotfiles", "herdr", "config.toml"), "utf8"));
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
    if (process.platform === "darwin") {
      const mcpConfig = await lstat(join(home, ".config", "mcp", "mcp.json"));
      assert.equal(mcpConfig.isSymbolicLink(), true);
    }
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("config sync backs up only Herdr config and previews retired link removal", { skip: process.platform === "win32" }, async () => {
  const home = await mkdtemp(join(tmpdir(), "agent-config-herdr-"));
  try {
    const herdr = join(home, ".config", "herdr");
    const piAgentDir = join(home, ".pi", "agent");
    const extensions = join(piAgentDir, "extensions");
    await mkdir(herdr, { recursive: true });
    await mkdir(extensions, { recursive: true });
    await writeFile(join(herdr, "config.toml"), "user config");
    await writeFile(join(herdr, "session.json"), "user session state");
    await symlink(join(repoRoot, "extensions", "fast-compaction"), join(extensions, "fast-compaction"));
    await symlink(join(home, "third-party"), join(extensions, "session-branches"));
    await writeFile(join(extensions, "herdr-agent-state.ts"), "official integration");
    const args = ["--home", home, "--config-home", join(home, ".config"), "--pi-agent-dir", piAgentDir, "--mode", "symlink"];

    const dryRun = await runSync([...args, "--dry-run"]);
    assert.match(dryRun.stdout, /would remove owned dangling link/);
    assert.equal((await lstat(join(extensions, "fast-compaction"))).isSymbolicLink(), true);
    assert.equal(await readFile(join(herdr, "config.toml"), "utf8"), "user config");
    assert.deepEqual((await readdir(herdr)).sort(), ["config.toml", "session.json"]);

    await runSync(args);
    await assert.rejects(() => lstat(join(extensions, "fast-compaction")), /ENOENT/);
    assert.equal(await readlink(join(extensions, "session-branches")), join(home, "third-party"));
    assert.equal(await readFile(join(extensions, "herdr-agent-state.ts"), "utf8"), "official integration");
    assert.equal(await readlink(join(herdr, "config.toml")), join(repoRoot, "dotfiles", "herdr", "config.toml"));
    const backups = (await readdir(herdr)).filter((name) => name.startsWith("config.toml.bak-"));
    assert.equal(backups.length, 1);
    assert.equal(await readFile(join(herdr, backups[0]!), "utf8"), "user config");
    assert.equal(await readFile(join(herdr, "session.json"), "utf8"), "user session state");

    const second = await runSync(args);
    assert.match(second.stdout, /= Herdr config/);
    assert.doesNotMatch(second.stdout, /Retired Pi extension link/);
    assert.equal((await readdir(herdr)).length, 3);
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
