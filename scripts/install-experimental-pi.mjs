#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const defaultCommit = "28657a2ffa6dbeccba74c166682e7a7ee547f5b4";
const defaultRepository = "https://github.com/badlogic/pi-mono.git";

function usage() {
  return `Usage: node scripts/install-experimental-pi.mjs [options]\n\nBuild the pinned experimental Pi used for fullscreen mode.\n\nOptions:\n  --dry-run           Print commands without changing files\n  --force             Re-fetch and rebuild an existing checkout\n  --home <path>       Home directory (default: current user home)\n  --checkout <path>   Checkout directory\n  --repo <url>        Pi git repository\n  --commit <sha>      Pi commit to build\n  --help              Show this help\n`;
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    force: false,
    home: os.homedir(),
    checkout: undefined,
    repository: defaultRepository,
    commit: defaultCommit,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      const next = argv[++i];
      if (!next || next.startsWith("--")) throw new Error(`${arg} requires a value`);
      return next;
    };
    switch (arg) {
      case "--dry-run": options.dryRun = true; break;
      case "--force": options.force = true; break;
      case "--home": options.home = value(); break;
      case "--checkout": options.checkout = value(); break;
      case "--repo": options.repository = value(); break;
      case "--commit": options.commit = value(); break;
      case "--help": case "-h": options.help = true; break;
      default: throw new Error(`Unknown option: ${arg}`);
    }
  }

  options.home = resolveUserPath(options.home, os.homedir());
  options.checkout = resolveUserPath(
    options.checkout ?? path.join(options.home, ".pi", "experimental", `pi-main-${options.commit.slice(0, 7)}`),
    options.home,
  );
  return options;
}

function resolveUserPath(input, home) {
  if (input === "~") return home;
  if (input.startsWith("~/")) return path.join(home, input.slice(2));
  return path.resolve(input);
}

async function exists(target) {
  try {
    await fs.lstat(target);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function run(command, args, options) {
  const rendered = [command, ...args].map((part) => JSON.stringify(part)).join(" ");
  console.log(`> ${rendered}`);
  if (options.dryRun) return "";

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, stdio: options.capture ? ["ignore", "pipe", "inherit"] : "inherit" });
    let stdout = "";
    child.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function gitHead(checkout, options) {
  if (!(await exists(path.join(checkout, ".git")))) return null;
  return run("git", ["-C", checkout, "rev-parse", "HEAD"], { ...options, dryRun: false, capture: true });
}

async function install(options) {
  const checkoutExists = await exists(options.checkout);
  let head = checkoutExists ? await gitHead(options.checkout, options) : null;

  if (checkoutExists && !head) {
    if (!options.force) throw new Error(`${options.checkout} exists but is not a git checkout; use --force to replace it`);
    console.log(`> remove ${JSON.stringify(options.checkout)}`);
    if (!options.dryRun) await fs.rm(options.checkout, { recursive: true, force: true });
    head = null;
  }

  if (!head) {
    console.log(`> create ${JSON.stringify(options.checkout)}`);
    if (!options.dryRun) await fs.mkdir(options.checkout, { recursive: true });
    await run("git", ["init", options.checkout], options);
    await run("git", ["-C", options.checkout, "remote", "add", "origin", options.repository], options);
  }

  if (head !== options.commit || options.force) {
    await run("git", ["-C", options.checkout, "fetch", "--depth=1", "origin", options.commit], options);
    await run("git", ["-C", options.checkout, "checkout", "--detach", "FETCH_HEAD"], options);
  }

  const cli = path.join(options.checkout, "packages", "coding-agent", "dist", "cli.js");
  if (!options.force && head === options.commit && await exists(cli)) {
    console.log(`Experimental Pi is already built at ${options.checkout}`);
    return;
  }

  await run("npm", ["ci", "--ignore-scripts"], { ...options, cwd: options.checkout });
  await run("npm", ["run", "build"], { ...options, cwd: options.checkout });
  if (!options.dryRun) await fs.writeFile(path.join(options.checkout, "BUILD_COMMIT"), `${options.commit}\n`);
  console.log(`Experimental Pi ${options.dryRun ? "would be built" : "built"} at ${options.checkout}`);
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
  await install(options);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
