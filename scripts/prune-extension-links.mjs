#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Remove only dangling, same-named links owned by this checkout. Never user files.
export async function pruneExtensionLinks(source, target, { dryRun = false } = {}) {
  source = await fs.realpath(source);
  let targetStat;
  try {
    targetStat = await fs.lstat(target);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  // Do not traverse a linked root into another installation or the source repo.
  if (!targetStat.isDirectory()) return [];

  const removed = [];
  for (const child of await fs.readdir(target, { withFileTypes: true })) {
    if (!child.isSymbolicLink()) continue;
    const link = path.join(target, child.name);
    const linkedPath = path.resolve(target, await fs.readlink(link));
    if (linkedPath !== path.join(source, child.name)) continue;
    try {
      await fs.stat(linkedPath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      if (!dryRun) await fs.unlink(link);
      removed.push(link);
    }
  }
  return removed;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const link of await pruneExtensionLinks(process.argv[2], process.argv[3])) {
    console.log(`Removed stale managed extension link: ${link}`);
  }
}
