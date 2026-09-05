#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { pruneExtensionLinks } from "./prune-extension-links.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");

const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");

function usage() {
  return `Usage: node scripts/sync.mjs [options]\n\nSync this agent-config repo into a machine profile. Safe to rerun.\n\nOptions:\n  --dry-run                 Print planned actions without changing files\n  --home <path>             Home directory to sync into (default: current user home)\n  --config-home <path>      XDG config dir (default: $XDG_CONFIG_HOME or <home>/.config)\n  --pi-agent-dir <path>     Pi agent dir (default: $PI_CODING_AGENT_DIR or <home>/.pi/agent)\n  --mode <auto|symlink|copy>  Install mode (default: auto; copy on Windows, symlink elsewhere)\n  --no-backup               Replace existing targets without writing .bak-* backups\n  --help                    Show this help\n`;
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    home: os.homedir(),
    configHome: undefined,
    piAgentDir: undefined,
    mode: "auto",
    backup: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--no-backup":
        options.backup = false;
        break;
      case "--home":
        options.home = requireValue(argv, ++i, arg);
        break;
      case "--config-home":
        options.configHome = requireValue(argv, ++i, arg);
        break;
      case "--pi-agent-dir":
        options.piAgentDir = requireValue(argv, ++i, arg);
        break;
      case "--mode":
        options.mode = requireValue(argv, ++i, arg);
        if (!["auto", "symlink", "copy"].includes(options.mode)) {
          throw new Error(`Invalid --mode: ${options.mode}`);
        }
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  const currentHome = path.resolve(os.homedir());
  options.home = resolveUserPath(options.home, currentHome);
  options.configHome = resolveUserPath(options.configHome ?? process.env.XDG_CONFIG_HOME ?? path.join(options.home, ".config"), options.home);
  options.localAppData = resolveUserPath(defaultLocalAppData(options.home, currentHome), options.home);
  options.piAgentDir = resolveUserPath(options.piAgentDir ?? process.env.PI_CODING_AGENT_DIR ?? path.join(options.home, ".pi", "agent"), options.home);
  if (options.mode === "auto") options.mode = process.platform === "win32" ? "copy" : "symlink";
  return options;
}

function defaultLocalAppData(home, currentHome) {
  if (process.platform === "win32" && pathsEqual(home, currentHome) && process.env.LOCALAPPDATA) {
    return process.env.LOCALAPPDATA;
  }
  return path.join(home, "AppData", "Local");
}

function pathsEqual(left, right) {
  const resolvedLeft = path.resolve(left);
  const resolvedRight = path.resolve(right);
  if (process.platform === "win32") return resolvedLeft.toLowerCase() === resolvedRight.toLowerCase();
  return resolvedLeft === resolvedRight;
}

function neovimConfigTarget(options, platform = process.platform) {
  if (platform === "win32") return path.join(options.localAppData, "nvim");
  return path.join(options.configHome, "nvim");
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function resolveUserPath(input, home) {
  if (input === "~") return home;
  if (input.startsWith("~/")) return path.join(home, input.slice(2));
  return path.resolve(input);
}

function managedItems(options) {
  const items = [
    {
      label: "Herdr config",
      type: "file",
      source: path.join(repoRoot, "dotfiles", "herdr", "config.toml"),
      target: path.join(options.configHome, "herdr", "config.toml"),
    },
    {
      label: "Pi AGENTS.md",
      type: "file",
      source: path.join(repoRoot, "AGENTS.md"),
      target: path.join(options.piAgentDir, "AGENTS.md"),
    },
    {
      label: "Pi settings overlay",
      type: "json-merge",
      source: path.join(repoRoot, "dotfiles", "pi", "settings.json"),
      target: path.join(options.piAgentDir, "settings.json"),
    },
    {
      label: "Pi themes",
      type: "dir",
      source: path.join(repoRoot, "dotfiles", "pi", "themes"),
      target: path.join(options.piAgentDir, "themes"),
    },
    {
      label: "Pi keybindings",
      type: "file",
      source: path.join(repoRoot, "dotfiles", "pi", "keybindings.json"),
      target: path.join(options.piAgentDir, "keybindings.json"),
    },
    {
      label: "Pi web-search config",
      type: "file",
      source: path.join(repoRoot, "dotfiles", "pi", "web-search.json"),
      target: path.join(options.home, ".pi", "web-search.json"),
    },
    {
      label: "tmux config",
      type: "file",
      source: path.join(repoRoot, "dotfiles", "tmux", "tmux.conf"),
      target: path.join(options.home, ".tmux.conf"),
    },
    {
      label: "tmux local config",
      type: "file",
      source: path.join(repoRoot, "dotfiles", "tmux", "tmux.conf.local"),
      target: path.join(options.home, ".tmux.conf.local"),
    },
    {
      label: "Neovim config",
      type: "dir",
      source: path.join(repoRoot, "dotfiles", "nvim"),
      target: neovimConfigTarget(options),
    },
    {
      label: "Ghostty config",
      type: "file",
      source: path.join(repoRoot, "dotfiles", "ghostty", "config"),
      target: path.join(options.configHome, "ghostty", "config"),
      optional: true,
    },
  ];

  if (process.platform === "darwin") {
    items.push({
      label: "Shared MCP config",
      type: "file",
      source: path.join(repoRoot, "dotfiles", "mcp", "mcp.json"),
      target: path.join(options.configHome, "mcp", "mcp.json"),
    });
  }

  if (process.platform !== "win32") {
    items.push(
      {
        label: "Zsh config",
        type: "file",
        source: path.join(repoRoot, "dotfiles", "zsh", "zshrc"),
        target: path.join(options.home, ".zshrc"),
      },
      {
        label: "Filmstream deploy launcher",
        type: "file",
        source: path.join(repoRoot, "dotfiles", "bin", "deploy-filmstream"),
        target: path.join(options.home, ".local", "bin", "deploy-filmstream"),
      },
      {
        label: "Pi launcher",
        type: "file",
        source: path.join(repoRoot, "dotfiles", "pi", "bin", "pi"),
        target: path.join(options.piAgentDir, "bin", "pi"),
      },
      {
        label: "Stable Pi launcher",
        type: "file",
        source: path.join(repoRoot, "dotfiles", "pi", "bin", "pi-stable"),
        target: path.join(options.piAgentDir, "bin", "pi-stable"),
      },
      {
        label: "Experimental Pi launcher",
        type: "file",
        source: path.join(repoRoot, "dotfiles", "pi", "bin", "pi-experimental"),
        target: path.join(options.home, ".local", "bin", "pi-experimental"),
      },
    );
  }

  return items;
}

async function pathExists(p) {
  try {
    await fs.lstat(p);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function realpathMaybe(p) {
  try {
    return await fs.realpath(p);
  } catch {
    return null;
  }
}

async function fileBytesEqual(a, b) {
  try {
    const [left, right] = await Promise.all([fs.readFile(a), fs.readFile(b)]);
    return left.equals(right);
  } catch {
    return false;
  }
}

async function directoryEqual(a, b) {
  const [aEntries, bEntries] = await Promise.all([safeReaddir(a), safeReaddir(b)]);
  const aNames = aEntries.map((entry) => entry.name).sort();
  const bNames = bEntries.map((entry) => entry.name).sort();
  if (aNames.length !== bNames.length || aNames.some((name, i) => name !== bNames[i])) return false;

  for (const entry of aEntries) {
    const left = path.join(a, entry.name);
    const right = path.join(b, entry.name);
    if (entry.isDirectory()) {
      const rightStat = await safeLstat(right);
      if (!rightStat?.isDirectory()) return false;
      if (!(await directoryEqual(left, right))) return false;
    } else if (entry.isFile()) {
      const rightStat = await safeLstat(right);
      if (!rightStat?.isFile()) return false;
      if (!(await fileBytesEqual(left, right))) return false;
    }
  }
  return true;
}

async function safeReaddir(p) {
  try {
    return await fs.readdir(p, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function safeLstat(p) {
  try {
    return await fs.lstat(p);
  } catch {
    return null;
  }
}

async function readJson(target) {
  try {
    return JSON.parse(await fs.readFile(target, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read JSON from ${target}: ${error.message}`);
  }
}

function mergeJson(current, overlay, parentKey = "") {
  if (Array.isArray(current) && Array.isArray(overlay)) {
    const merged = [...current];
    for (const value of overlay) {
      if (parentKey === "packages" && value && typeof value === "object" && typeof value.source === "string") {
        const existingIndexes = merged
          .map((existing, index) => existing === value.source || existing?.source === value.source ? index : -1)
          .filter((index) => index >= 0);
        if (existingIndexes.length > 0) {
          merged[existingIndexes[0]] = value;
          for (let index = existingIndexes.length - 1; index > 0; index -= 1) {
            merged.splice(existingIndexes[index], 1);
          }
          continue;
        }
      }
      if (!merged.some((existing) => isDeepStrictEqual(existing, value))) merged.push(value);
    }
    return merged;
  }
  if (current && overlay && typeof current === "object" && typeof overlay === "object" && !Array.isArray(current) && !Array.isArray(overlay)) {
    const merged = { ...current };
    for (const [key, value] of Object.entries(overlay)) {
      merged[key] = key in current ? mergeJson(current[key], value, key) : value;
    }
    return merged;
  }
  return overlay;
}

// Keep unrelated local choices while returning compaction to native defaults.
function mergePiSettings(current, overlay) {
  const settings = mergeJson(current, overlay);
  delete settings.compaction;
  return settings;
}

async function targetIsCurrent(item, mode) {
  const targetStat = await safeLstat(item.target);
  if (!targetStat) return false;

  if (item.type === "json-merge") {
    const [current, overlay] = await Promise.all([readJson(item.target), readJson(item.source)]);
    return isDeepStrictEqual(current, mergePiSettings(current, overlay));
  }

  if (mode === "symlink") {
    if (!targetStat.isSymbolicLink()) return false;
    const [targetReal, sourceReal] = await Promise.all([realpathMaybe(item.target), realpathMaybe(item.source)]);
    return Boolean(targetReal && sourceReal && targetReal === sourceReal);
  }

  if (item.type === "file") return targetStat.isFile() && (await fileBytesEqual(item.source, item.target));
  if (item.type === "dir") return targetStat.isDirectory() && (await directoryEqual(item.source, item.target));
  return false;
}

async function backupTarget(target) {
  const backup = `${target}.bak-${timestamp}`;
  let candidate = backup;
  let counter = 2;
  while (await pathExists(candidate)) {
    candidate = `${backup}-${counter}`;
    counter += 1;
  }
  await fs.rename(target, candidate);
  return candidate;
}

async function replaceTarget(item, options) {
  const exists = await pathExists(item.target);
  const mergedJson = item.type === "json-merge"
    ? mergePiSettings(exists ? await readJson(item.target) : {}, await readJson(item.source))
    : null;
  let backupPath = null;

  if (exists) {
    if (options.backup) {
      backupPath = await backupTarget(item.target);
    } else {
      await fs.rm(item.target, { recursive: true, force: true });
    }
  }

  await fs.mkdir(path.dirname(item.target), { recursive: true });
  if (item.type === "json-merge") {
    await fs.writeFile(item.target, `${JSON.stringify(mergedJson, null, 2)}\n`);
  } else if (options.mode === "copy") {
    if (item.type === "dir") {
      await fs.cp(item.source, item.target, { recursive: true, force: true, errorOnExist: false });
    } else {
      await fs.copyFile(item.source, item.target);
    }
  } else {
    const symlinkType = item.type === "dir" ? (process.platform === "win32" ? "junction" : "dir") : "file";
    await fs.symlink(item.source, item.target, symlinkType);
  }

  return backupPath;
}

async function sync(options) {
  const items = managedItems(options);
  const results = [];
  const staleLinks = await pruneExtensionLinks(
    path.join(repoRoot, "extensions"), path.join(options.piAgentDir, "extensions"), options,
  );
  for (const target of staleLinks) {
    results.push({
      item: { label: "Retired Pi extension link", target },
      action: "remove",
      detail: options.dryRun ? "would remove owned dangling link" : "removed owned dangling link",
    });
  }

  for (const item of items) {
    if (!(await pathExists(item.source))) {
      if (item.optional) {
        results.push({ item, action: "skip", detail: "source missing" });
        continue;
      }
      throw new Error(`Missing source for ${item.label}: ${item.source}`);
    }

    if (await targetIsCurrent(item, options.mode)) {
      results.push({ item, action: "ok", detail: "up to date" });
      continue;
    }

    const exists = await pathExists(item.target);
    const action = exists ? "replace" : "create";
    if (options.dryRun) {
      const method = item.type === "json-merge" ? "merge" : options.mode;
      results.push({ item, action, detail: `${method}${exists && options.backup ? ", backup first" : ""}` });
      continue;
    }

    const backupPath = await replaceTarget(item, options);
    results.push({ item, action, detail: backupPath ? `${options.mode}; backup: ${backupPath}` : options.mode });
  }

  return results;
}

function renderResults(results, options) {
  const lines = [];
  lines.push(`${options.dryRun ? "Dry run" : "Sync complete"} (${options.mode})`);
  for (const result of results) {
    const prefix = { ok: "=", create: "+", replace: "~", skip: "-", remove: "-" }[result.action] ?? "?";
    lines.push(`${prefix} ${result.item.label}: ${result.item.target} (${result.detail})`);
  }
  return lines.join("\n");
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    console.log(usage());
    return;
  }

  const results = await sync(options);
  console.log(renderResults(results, options));
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

export { managedItems, neovimConfigTarget, parseArgs, renderResults, sync };
