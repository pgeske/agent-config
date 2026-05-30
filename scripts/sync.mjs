#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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

  options.home = resolveUserPath(options.home, os.homedir());
  options.configHome = resolveUserPath(options.configHome ?? process.env.XDG_CONFIG_HOME ?? path.join(options.home, ".config"), options.home);
  options.piAgentDir = resolveUserPath(options.piAgentDir ?? process.env.PI_CODING_AGENT_DIR ?? path.join(options.home, ".pi", "agent"), options.home);
  if (options.mode === "auto") options.mode = process.platform === "win32" ? "copy" : "symlink";
  return options;
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
  return [
    {
      label: "Pi AGENTS.md",
      type: "file",
      source: path.join(repoRoot, "AGENTS.md"),
      target: path.join(options.piAgentDir, "AGENTS.md"),
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
      target: path.join(options.configHome, "nvim"),
    },
    {
      label: "Ghostty config",
      type: "file",
      source: path.join(repoRoot, "dotfiles", "ghostty", "config"),
      target: path.join(options.configHome, "ghostty", "config"),
      optional: true,
    },
  ];
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

async function targetIsCurrent(item, mode) {
  const targetStat = await safeLstat(item.target);
  if (!targetStat) return false;

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
  let backupPath = null;

  if (exists) {
    if (options.backup) {
      backupPath = await backupTarget(item.target);
    } else {
      await fs.rm(item.target, { recursive: true, force: true });
    }
  }

  await fs.mkdir(path.dirname(item.target), { recursive: true });
  if (options.mode === "copy") {
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
      results.push({ item, action, detail: `${options.mode}${exists && options.backup ? ", backup first" : ""}` });
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
    const prefix = { ok: "=", create: "+", replace: "~", skip: "-" }[result.action] ?? "?";
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

export { managedItems, parseArgs, renderResults, sync };
