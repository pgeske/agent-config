import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export interface CodexReviewOptions {
  base?: string;
  commit?: string;
  uncommitted: boolean;
  prUrl?: string;
  title?: string;
  extraPrompt?: string;
}

interface ParsedPullRequest {
  owner: string;
  repo: string;
  number: string;
  url: string;
}

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_SUMMARY_CHARS = 6000;

export function parseCodexReviewArgs(rawArgs: string): CodexReviewOptions {
  const tokens = tokenizeArgs(rawArgs);
  const options: CodexReviewOptions = { uncommitted: false };
  const promptParts: string[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token === "--base") {
      options.base = requireValue(tokens, ++index, "--base");
    } else if (token.startsWith("--base=")) {
      options.base = token.slice("--base=".length);
    } else if (token === "--commit") {
      options.commit = requireValue(tokens, ++index, "--commit");
    } else if (token.startsWith("--commit=")) {
      options.commit = token.slice("--commit=".length);
    } else if (token === "--title") {
      options.title = requireValue(tokens, ++index, "--title");
    } else if (token.startsWith("--title=")) {
      options.title = token.slice("--title=".length);
    } else if (token === "--uncommitted") {
      options.uncommitted = true;
    } else if (token === "--help" || token === "-h") {
      options.extraPrompt = "__help__";
    } else if (!options.prUrl && parsePullRequest(token)) {
      options.prUrl = token;
    } else {
      promptParts.push(token);
    }
  }

  if (promptParts.length > 0) {
    options.extraPrompt = promptParts.join(" ");
  }

  return options;
}

export function parsePullRequest(value: string): ParsedPullRequest | undefined {
  const urlMatch = value.match(/^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)(?:[/?#].*)?$/);
  if (urlMatch) {
    const [, owner, repo, number] = urlMatch;
    return { owner, repo, number, url: `https://github.com/${owner}/${repo}/pull/${number}` };
  }

  const shorthandMatch = value.match(/^([^/\s#]+)\/([^/\s#]+)#(\d+)$/);
  if (shorthandMatch) {
    const [, owner, repo, number] = shorthandMatch;
    return { owner, repo, number, url: `https://github.com/${owner}/${repo}/pull/${number}` };
  }

  return undefined;
}

export function buildCodexReviewArgs(options: CodexReviewOptions, base?: string): string[] {
  const args = ["exec", "review"];

  if (options.uncommitted) {
    args.push("--uncommitted");
  } else if (options.commit) {
    args.push("--commit", options.commit);
  } else if (base) {
    args.push("--base", base);
  }

  if (options.title) {
    args.push("--title", options.title);
  }

  return args;
}

export default function codexReviewExtension(pi: ExtensionAPI) {
  pi.registerCommand("codex-review", {
    description: "Run Codex CLI review for the current branch, commit, dirty worktree, or a GitHub PR URL",
    handler: async (args: string, ctx: ExtensionContext) => {
      const options = parseCodexReviewArgs(args || "");

      if (options.extraPrompt === "__help__") {
        ctx.ui.notify(helpText(), "info");
        return;
      }

      ctx.ui.setStatus("codex-review", "running Codex review...");

      const startedAt = Date.now();
      const logPath = path.join(os.tmpdir(), `pi-codex-review-${startedAt}.log`);
      const outputPath = path.join(os.tmpdir(), `pi-codex-review-${startedAt}.md`);

      try {
        const review = options.prUrl
          ? await runPullRequestReview(options, ctx, outputPath)
          : await runLocalReview(options, ctx.cwd, outputPath);

        await fs.writeFile(logPath, `${review.stderr}\n${review.stdout}`, "utf8");
        const summary = await readReviewSummary(outputPath, review);
        const elapsed = Math.round((Date.now() - startedAt) / 1000);
        const statusLine = review.code === 0 ? "Codex review clean or completed" : "Codex review reported findings or failed";

        ctx.ui.notify(
          `${statusLine} (${elapsed}s).\n\n${summary}\n\nFull log: ${logPath}`,
          review.code === 0 ? "info" : "warning",
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`Codex review failed: ${message}\n\nLog path: ${logPath}`, "error");
      } finally {
        ctx.ui.setStatus("codex-review", undefined);
      }
    },
  });
}

async function runLocalReview(options: CodexReviewOptions, cwd: string, outputPath: string): Promise<RunResult> {
  const base = options.uncommitted || options.commit ? undefined : options.base || (await detectCurrentPrBase(cwd)) || "origin/main";
  const args = [...buildCodexReviewArgs(options, base), "-o", outputPath];
  if (options.extraPrompt) {
    args.push(options.extraPrompt);
  }
  return runCommand("codex", args, cwd, DEFAULT_TIMEOUT_MS, true);
}

async function runPullRequestReview(options: CodexReviewOptions, ctx: ExtensionContext, outputPath: string): Promise<RunResult> {
  const parsed = parsePullRequest(options.prUrl || "");
  if (!parsed) {
    throw new Error(`Unsupported PR reference: ${options.prUrl}`);
  }

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-codex-review-pr-"));
  const repoDir = path.join(tempRoot, parsed.repo);

  try {
    await runCommand("gh", ["repo", "clone", `${parsed.owner}/${parsed.repo}`, repoDir], ctx.cwd, DEFAULT_TIMEOUT_MS);
    const prInfo = await runCommand(
      "gh",
      ["pr", "view", parsed.number, "--repo", `${parsed.owner}/${parsed.repo}`, "--json", "baseRefName", "--jq", ".baseRefName"],
      repoDir,
      DEFAULT_TIMEOUT_MS,
    );
    const baseRef = prInfo.stdout.trim() || "main";
    await runCommand("gh", ["pr", "checkout", parsed.number], repoDir, DEFAULT_TIMEOUT_MS);
    await runCommand("git", ["fetch", "origin", baseRef], repoDir, DEFAULT_TIMEOUT_MS);

    const reviewOptions = { ...options, prUrl: undefined, base: `origin/${baseRef}`, title: options.title || `PR ${parsed.url}` };
    const args = [...buildCodexReviewArgs(reviewOptions, reviewOptions.base), "-o", outputPath];
    if (options.extraPrompt) {
      args.push(options.extraPrompt);
    }
    return runCommand("codex", args, repoDir, DEFAULT_TIMEOUT_MS, true);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

async function detectCurrentPrBase(cwd: string): Promise<string | undefined> {
  const result = await runCommand(
    "gh",
    ["pr", "view", "--json", "baseRefName", "--jq", ".baseRefName"],
    cwd,
    30_000,
    true,
  );
  const base = result.stdout.trim();
  return result.code === 0 && base ? `origin/${base}` : undefined;
}

async function readReviewSummary(outputPath: string, review: RunResult): Promise<string> {
  let text = "";
  try {
    text = await fs.readFile(outputPath, "utf8");
  } catch {
    text = `${review.stdout}\n${review.stderr}`.trim();
  }

  if (!text.trim()) {
    text = review.code === 0 ? "Codex review exited cleanly with no final message." : "Codex review exited without a final message.";
  }

  return text.length > MAX_SUMMARY_CHARS ? `${text.slice(0, MAX_SUMMARY_CHARS)}\n\n…truncated…` : text;
}

function runCommand(command: string, args: string[], cwd: string, timeoutMs: number, allowFailure = false): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${command} timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const result = { code: code ?? 1, stdout, stderr };
      if (!allowFailure && result.code !== 0) {
        reject(new Error(`${command} ${args.join(" ")} failed with exit ${result.code}: ${stderr || stdout}`));
        return;
      }
      resolve(result);
    });
  });
}

function tokenizeArgs(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;
  let escaping = false;

  for (const char of input) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

function requireValue(tokens: string[], index: number, flag: string): string {
  const value = tokens[index];
  if (!value) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function helpText(): string {
  return [
    "Usage: /codex-review [PR_URL|owner/repo#123] [--base origin/main] [--commit SHA] [--uncommitted] [--title text] [extra review prompt]",
    "",
    "Examples:",
    "  /codex-review",
    "  /codex-review --base origin/main",
    "  /codex-review --uncommitted",
    "  /codex-review --commit HEAD",
    "  /codex-review https://github.com/pgeske/agent-config/pull/7",
  ].join("\n");
}
