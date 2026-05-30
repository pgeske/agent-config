import { execFile } from "node:child_process";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const scriptPath = path.resolve(__dirname, "..", "scripts", "sync.mjs");

function splitArgs(input: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaped = false;

  for (const char of input.trim()) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (escaped) current += "\\";
  if (quote) throw new Error(`Unclosed quote in arguments: ${input}`);
  if (current) args.push(current);
  return args;
}

function runSync(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [scriptPath, ...args], { timeout: 120_000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error([stderr.trim(), stdout.trim(), error.message].filter(Boolean).join("\n")));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("config-sync", {
    description: "Sync personal agent config dotfiles into this machine. Use --dry-run to preview.",
    handler: async (args, ctx) => {
      let parsedArgs: string[];
      try {
        parsedArgs = splitArgs(args);
      } catch (error) {
        ctx.ui.notify((error as Error).message, "error");
        return;
      }

      try {
        const { stdout, stderr } = await runSync(parsedArgs);
        const text = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
        ctx.ui.notify(text || "config sync complete", "info");
      } catch (error) {
        ctx.ui.notify((error as Error).message, "error");
      }
    },
  });
}
