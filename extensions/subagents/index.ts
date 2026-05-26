/**
 * Background subagents extension for Pi.
 *
 * Provides an orchestrator-facing tool that starts child Pi agents in the
 * background, tracks their lifecycle, and surfaces progress in the TUI.
 */

import { spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
type PolicyRole = "primary" | "reviewer" | "tester" | "merger";
type ReviewPolicy = "none" | "after_each" | "after_all";
type TestPolicy = "none" | "after_each" | "after_all";
type MergePolicy = "none" | "manual" | "integrate";
type NotifyPolicy = "silent" | "on_each_done" | "on_all_done" | "on_error";

interface AgentPreset {
  name: string;
  description: string;
  systemPrompt: string;
  tools?: string[];
  model?: string;
  writeAccess: boolean;
  includeUncommitted?: boolean;
}

interface DelegateTask {
  name?: string;
  persona?: string;
  agent: string;
  task: string;
  cwd?: string;
  model?: string;
  tools?: string[];
  writeAccess?: boolean;
  includeUncommitted?: boolean;
}

interface JobRecord {
  id: string;
  groupId: string;
  name: string;
  persona: string;
  agent: string;
  task: string;
  cwd: string;
  status: JobStatus;
  policyRole: PolicyRole;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  branch?: string;
  worktreePath?: string;
  model?: string;
  tools?: string[];
  writeAccess: boolean;
  includeUncommitted: boolean;
  lastEvent?: string;
  summary?: string;
  error?: string;
  turns: number;
  cost: number;
  logPath?: string;
  resultPath?: string;
  proc?: ChildProcess;
  cancel?: () => void;
}

interface GroupRecord {
  id: string;
  createdAt: number;
  reviewPolicy: ReviewPolicy;
  testPolicy: TestPolicy;
  mergePolicy: MergePolicy;
  notify: NotifyPolicy;
  primaryJobIds: string[];
  followUpJobIds: string[];
  afterAllScheduled: boolean;
  notifiedAllDone: boolean;
  personaOrder: string[];
  reservedPersonas: string[];
  defaultModel?: string;
}

const presets: Record<string, AgentPreset> = {
  scout: {
    name: "scout",
    description: "Fast read-only codebase reconnaissance.",
    tools: ["read", "grep", "find", "ls"],
    writeAccess: false,
    systemPrompt: [
      "You are a scout subagent for Pi.",
      "Find relevant files, commands, constraints, and risks for the delegated task.",
      "Do not modify files.",
      "Return a compact handoff summary with paths and concrete findings.",
    ].join("\n"),
  },
  planner: {
    name: "planner",
    description: "Read-only implementation planner.",
    tools: ["read", "grep", "find", "ls"],
    writeAccess: false,
    systemPrompt: [
      "You are a planner subagent for Pi.",
      "Turn the delegated goal into an implementation plan with risks and verification steps.",
      "Do not modify files.",
      "Return a concise plan suitable for an orchestrator to execute or delegate.",
    ].join("\n"),
  },
  worker: {
    name: "worker",
    description: "Write-capable implementation worker.",
    writeAccess: true,
    systemPrompt: [
      "You are a worker subagent for Pi.",
      "Implement exactly the delegated task in your isolated git worktree.",
      "Keep changes focused, run relevant verification when practical, and commit your work.",
      "Return a summary with changed files, tests run, commit hash, and any follow-up needed.",
    ].join("\n"),
  },
  tester: {
    name: "tester",
    description: "Verification and test diagnosis agent.",
    tools: ["read", "grep", "find", "ls", "bash"],
    writeAccess: true,
    includeUncommitted: true,
    systemPrompt: [
      "You are a tester subagent for Pi.",
      "Run tests in your isolated git worktree so shell commands cannot mutate the parent checkout.",
      "Run or inspect relevant verification for the delegated work.",
      "Do not modify files unless explicitly instructed.",
      "Return pass/fail status, commands run, failure diagnostics, and recommended fixes.",
    ].join("\n"),
  },
  reviewer: {
    name: "reviewer",
    description: "Read-only code and requirements reviewer.",
    tools: ["read", "grep", "find", "ls"],
    writeAccess: false,
    systemPrompt: [
      "You are a reviewer subagent for Pi.",
      "Review the delegated job output against the original task, code quality, and risk.",
      "Do not modify files.",
      "Return findings grouped as critical, important, minor, plus an overall recommendation.",
    ].join("\n"),
  },
  "code-reviewer": {
    name: "code-reviewer",
    description: "Heavyweight PR, branch, commit, and risky-change code reviewer.",
    tools: ["read", "grep", "find", "ls", "bash"],
    writeAccess: true,
    includeUncommitted: true,
    systemPrompt: [
      "You are a code-reviewer subagent for Pi.",
      "Perform high-signal code review for PRs, branches, commits, or large/risky code changes in your isolated git worktree.",
      "Do not modify files intentionally, commit, push, merge, or run destructive commands.",
      "Prefer reviewing the actual diff against the correct base; for an open PR, determine its base with gh pr view and review against origin/<base>.",
      "When available, use Pi's /codex-review workflow or codex exec review for non-trivial PRs or when explicitly requested.",
      "Treat Codex output as advisory: verify every accepted finding against the real code path and reject speculative, low-impact, style-only, or over-complicated findings.",
      "Focus on correctness, regressions, security/privacy risk, data loss, concurrency, install/runtime behavior, dependency contracts, and missing tests.",
      "Return critical findings, important findings, minor findings, rejected findings if any, tests/commands inspected or run, and a recommendation: approve, approve after fixes, or block.",
    ].join("\n"),
  },
  merger: {
    name: "merger",
    description: "Integration agent for selected branches.",
    writeAccess: true,
    systemPrompt: [
      "You are a merger subagent for Pi.",
      "Integrate selected subagent branches in an isolated integration worktree only.",
      "Resolve conflicts conservatively, run relevant verification, and commit the integration result.",
      "Return merged branches, conflicts resolved, tests run, and final branch/commit.",
    ].join("\n"),
  },
  generic: {
    name: "generic",
    description: "Configurable fallback subagent.",
    writeAccess: false,
    systemPrompt: [
      "You are a generic subagent for Pi.",
      "Complete the delegated task within the provided constraints.",
      "Return a concise handoff summary for the parent orchestrator.",
    ].join("\n"),
  },
};

const TaskSchema = Type.Object({
  name: Type.Optional(Type.String({ description: "Human-readable job label" })),
  persona: Type.Optional(Type.String({ description: "Optional friendly party member name, e.g. Squall or Rinoa" })),
  agent: Type.String({ description: "Agent preset: scout, planner, worker, tester, reviewer, code-reviewer, merger, or generic" }),
  task: Type.String({ description: "Task to delegate" }),
  cwd: Type.Optional(Type.String({ description: "Working directory for this job" })),
  model: Type.Optional(Type.String({ description: "Optional Pi model selector" })),
  tools: Type.Optional(Type.Array(Type.String(), { description: "Optional tool list override" })),
  writeAccess: Type.Optional(Type.Boolean({ description: "Override preset write access. Write access requires a git worktree." })),
  includeUncommitted: Type.Optional(Type.Boolean({ description: "Apply staged, unstaged, and untracked parent checkout changes into the subagent worktree. Use for local WIP testing/review." })),
});

const DelegateParams = Type.Object({
  tasks: Type.Array(TaskSchema, { minItems: 1, maxItems: 7, description: "Party member jobs to start" }),
  reviewPolicy: Type.Optional(StringEnum(["none", "after_each", "after_all"] as const, { default: "after_all" })),
  testPolicy: Type.Optional(StringEnum(["none", "after_each", "after_all"] as const, { default: "none" })),
  mergePolicy: Type.Optional(StringEnum(["none", "manual", "integrate"] as const, { default: "manual" })),
  notify: Type.Optional(StringEnum(["silent", "on_each_done", "on_all_done", "on_error"] as const, { default: "on_all_done" })),
  cwd: Type.Optional(Type.String({ description: "Default working directory for jobs" })),
});

const CheckParams = Type.Object({
  jobId: Type.Optional(Type.String({ description: "Specific job ID to inspect" })),
  groupId: Type.Optional(Type.String({ description: "Specific group ID to inspect" })),
  includeCompleted: Type.Optional(Type.Boolean({ default: true })),
});

const CancelParams = Type.Object({
  jobId: Type.Optional(Type.String({ description: "Job ID to cancel" })),
  groupId: Type.Optional(Type.String({ description: "Cancel running jobs in this group" })),
  all: Type.Optional(Type.Boolean({ description: "Cancel all running jobs" })),
});

function shortId(): string {
  return Math.random().toString(16).slice(2, 10);
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "job";
}

function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return `${minutes}m${rest.toString().padStart(2, "0")}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h${(minutes % 60).toString().padStart(2, "0")}m`;
}

function statusIcon(status: JobStatus): string {
  switch (status) {
    case "queued": return "□";
    case "running": return "~";
    case "completed": return "✓";
    case "failed": return "!";
    case "cancelled": return "-";
  }
}

function statusBadge(status: JobStatus, color?: (name: any, text: string) => string): string {
  const badge = `[${statusIcon(status)}]`;
  if (!color) return badge;
  switch (status) {
    case "queued": return color("dim", badge);
    case "running": return color("warning", badge);
    case "completed": return color("success", badge);
    case "failed": return color("error", badge);
    case "cancelled": return color("muted", badge);
  }
}

const PERSONAS = ["Squall", "Rinoa", "Quistis", "Zell", "Selphie", "Irvine", "Seifer"];

function shuffledPersonas(): string[] {
  const personas = [...PERSONAS];
  for (let i = personas.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [personas[i], personas[j]] = [personas[j], personas[i]];
  }
  return personas;
}

function normalizePersona(persona: string): string {
  return persona.trim().toLowerCase();
}

function assignedPersonaKeys(jobs: Map<string, JobRecord>, groups?: Map<string, GroupRecord>): Set<string> {
  const assigned = new Set(Array.from(jobs.values(), (job) => normalizePersona(job.persona)));
  if (groups) {
    for (const group of groups.values()) {
      for (const persona of group.reservedPersonas) assigned.add(normalizePersona(persona));
    }
  }
  return assigned;
}

function availablePersonas(group: GroupRecord, jobs: Map<string, JobRecord>, groups?: Map<string, GroupRecord>): string[] {
  const assigned = assignedPersonaKeys(jobs, groups);
  const personas = group.personaOrder.length > 0 ? group.personaOrder : PERSONAS;
  return personas.filter((persona) => !assigned.has(normalizePersona(persona)));
}

function allocateBuiltinPersona(group: GroupRecord, jobs: Map<string, JobRecord>, groups: Map<string, GroupRecord>): string | undefined {
  return group.reservedPersonas.shift() ?? availablePersonas(group, jobs, groups)[0];
}

function validateExplicitPersonas(tasks: DelegateTask[], jobs: Map<string, JobRecord>, groups?: Map<string, GroupRecord>): string | undefined {
  const assigned = assignedPersonaKeys(jobs, groups);
  const requested = new Set<string>();
  for (const task of tasks) {
    if (!task.persona) continue;
    const key = normalizePersona(task.persona);
    if (requested.has(key)) return `Party member ${task.persona} is duplicated in this request. Party member names must be unique until cleared with /subagents clear.`;
    if (assigned.has(key)) return `Party member ${task.persona} is already assigned to an uncleared job. Run /subagents clear to free completed party members.`;
    requested.add(key);
  }
  return undefined;
}

function policyFollowUpPersonaCount(primaryTaskCount: number, group: GroupRecord): number {
  if (primaryTaskCount === 0) return 0;
  let count = 0;
  if (group.reviewPolicy === "after_each") count += primaryTaskCount;
  else if (group.reviewPolicy === "after_all") count += 1;
  if (group.testPolicy === "after_each") count += primaryTaskCount;
  else if (group.testPolicy === "after_all") count += 1;
  if (group.mergePolicy === "integrate") count += 1;
  return count;
}

function planTaskPersonas(tasks: DelegateTask[], group: GroupRecord, jobs: Map<string, JobRecord>, groups: Map<string, GroupRecord>): { personas: string[]; reservedPersonas: string[]; error?: string } {
  const explicitError = validateExplicitPersonas(tasks, jobs, groups);
  if (explicitError) return { personas: [], reservedPersonas: [], error: explicitError };

  const explicit = new Set(tasks.filter((task) => task.persona).map((task) => normalizePersona(task.persona!)));
  const available = availablePersonas(group, jobs, groups).filter((persona) => !explicit.has(normalizePersona(persona)));
  const implicitCount = tasks.filter((task) => !task.persona).length;
  const reservedFollowUps = policyFollowUpPersonaCount(tasks.length, group);
  const neededCount = implicitCount + reservedFollowUps;
  if (neededCount > available.length) {
    const allAssigned = available.length === 0;
    const followUpNote = reservedFollowUps > 0 ? ` including ${reservedFollowUps} reserved for policy follow-up party members` : "";
    const reason = allAssigned
      ? "All built-in party members are assigned"
      : `Insufficient built-in party members are available (${available.length} available, ${neededCount} needed${followUpNote})`;
    return { personas: [], reservedPersonas: [], error: `${reason}. Run /subagents clear to free completed party members before delegating more party members.` };
  }

  let implicitIndex = 0;
  const personas = tasks.map((task) => task.persona ? task.persona.trim() : available[implicitIndex++]);
  return {
    personas,
    reservedPersonas: available.slice(implicitIndex, implicitIndex + reservedFollowUps),
  };
}

function extractText(message: any): string {
  if (!message || message.role !== "assistant" || !Array.isArray(message.content)) return "";
  return message.content.filter((part: any) => part?.type === "text").map((part: any) => part.text).join("\n").trim();
}

function getPiInvocation(args: string[]): { command: string; args: string[] } {
  const currentScript = process.argv[1];
  const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
  if (currentScript && !isBunVirtualScript && fs.existsSync(currentScript)) {
    return { command: process.execPath, args: [currentScript, ...args] };
  }

  const execName = path.basename(process.execPath).toLowerCase();
  const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
  if (!isGenericRuntime) return { command: process.execPath, args };
  return { command: "pi", args };
}

async function runCommand(command: string, args: string[], cwd: string, stdin?: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, { cwd, stdio: [stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    if (stdin !== undefined) proc.stdin?.end(stdin);
    proc.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
    proc.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
    proc.on("error", (error) => resolve({ code: 1, stdout, stderr: error.message }));
    proc.on("close", (code) => resolve({ code: code ?? 0, stdout, stderr }));
  });
}

async function gitOutput(cwd: string, args: string[]): Promise<string> {
  const result = await runCommand("git", args, cwd);
  if (result.code !== 0) throw new Error(result.stderr || result.stdout || `git ${args.join(" ")} failed`);
  return result.stdout.trim();
}

async function createWorktree(cwd: string, job: JobRecord): Promise<void> {
  const repoRoot = await gitOutput(cwd, ["rev-parse", "--show-toplevel"]);
  const sessionSlug = slug(path.basename(repoRoot));
  const jobSlug = slug(job.name);
  const worktreeRoot = path.join(os.homedir(), ".pi", "agent", "subagents", "worktrees");
  await fs.promises.mkdir(worktreeRoot, { recursive: true });

  job.branch = `subagents/${sessionSlug}/${job.id}-${jobSlug}`;
  job.worktreePath = path.join(worktreeRoot, `${job.id}-${jobSlug}`);
  await gitOutput(repoRoot, ["worktree", "add", job.worktreePath, "-b", job.branch, "HEAD"]);

  if (job.includeUncommitted) {
    job.lastEvent = "copying uncommitted changes";
    await copyUncommittedChanges(repoRoot, job.worktreePath);
  }
}

async function copyUncommittedChanges(repoRoot: string, worktreePath: string): Promise<void> {
  await applyGitDiff(repoRoot, worktreePath, ["diff", "--binary", "--staged"], true);
  await applyGitDiff(repoRoot, worktreePath, ["diff", "--binary"], false);
  await copyUntrackedFiles(repoRoot, worktreePath);
}

async function applyGitDiff(repoRoot: string, worktreePath: string, args: string[], staged: boolean): Promise<void> {
  const diffResult = await runCommand("git", args, repoRoot);
  if (diffResult.code !== 0) throw new Error(diffResult.stderr || diffResult.stdout || `git ${args.join(" ")} failed`);
  if (diffResult.stdout.length === 0) return;

  const applyArgs = staged ? ["apply", "--index", "--3way", "-"] : ["apply", "--3way", "-"];
  const apply = await runCommand("git", applyArgs, worktreePath, diffResult.stdout);
  if (apply.code !== 0) throw new Error(apply.stderr || apply.stdout || `git apply ${args.join(" ")} failed`);
}

async function copyUntrackedFiles(repoRoot: string, worktreePath: string): Promise<void> {
  const output = await gitOutput(repoRoot, ["ls-files", "--others", "--exclude-standard", "-z"]);
  if (!output) return;

  for (const relativePath of output.split("\0").filter(Boolean)) {
    const source = path.join(repoRoot, relativePath);
    const destination = path.join(worktreePath, relativePath);
    const stat = await fs.promises.lstat(source);
    if (!stat.isFile()) continue;
    await fs.promises.mkdir(path.dirname(destination), { recursive: true });
    await fs.promises.copyFile(source, destination);
  }
}

async function writePromptFile(job: JobRecord, preset: AgentPreset): Promise<{ dir: string; file: string }> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-subagent-prompt-"));
  const file = path.join(dir, `${job.id}.md`);
  const worktreeNote = job.writeAccess
    ? `\nYou are running in an isolated worktree. Branch: ${job.branch}. Worktree: ${job.worktreePath}.${job.includeUncommitted ? " Staged, unstaged, and untracked parent changes were copied into this worktree." : ""} Commit finished code changes before reporting completion.\n`
    : "\nThis is a read-only job. Do not modify files.\n";
  const prompt = `${preset.systemPrompt}\n${worktreeNote}\nYour parent orchestrator expects a concise final summary.`;
  await fs.promises.writeFile(file, prompt, { encoding: "utf8", mode: 0o600 });
  return { dir, file };
}

function summarizeJob(job: JobRecord): string {
  const elapsed = job.finishedAt && job.startedAt ? ` (${formatDuration(job.finishedAt - job.startedAt)})` : "";
  const parts = [`${statusBadge(job.status)} ${job.persona} / ${job.agent} / ${job.name} [${job.id}] ${job.status}${elapsed}`];
  if (job.branch) parts.push(`branch: ${job.branch}`);
  if (job.worktreePath) parts.push(`worktree: ${job.worktreePath}`);
  if (job.summary) parts.push(`summary: ${job.summary}`);
  if (job.error) parts.push(`error: ${job.error}`);
  return parts.join("\n");
}

function toolText(content: string): Array<{ type: "text"; text: string }> {
  return [{ type: "text", text: content }];
}

export default function (pi: ExtensionAPI) {
  const jobs = new Map<string, JobRecord>();
  const groups = new Map<string, GroupRecord>();
  let latestCtx: ExtensionContext | undefined;
  let latestGroupId: string | undefined;

  const isActiveJob = (job: JobRecord) => job.status === "queued" || job.status === "running";

  const parseCommandArgs = (args: unknown): string[] => {
    if (Array.isArray(args)) return args.map(String);
    if (typeof args === "string") return args.trim().split(/\s+/).filter(Boolean);
    return [];
  };

  const clearInactiveJobs = (): number => {
    let cleared = 0;
    for (const [id, job] of jobs) {
      if (isActiveJob(job)) continue;
      jobs.delete(id);
      cleared += 1;
    }
    for (const [id, group] of groups) {
      const groupJobs = Array.from(jobs.values()).filter((job) => job.groupId === id);
      if (groupJobs.length === 0) groups.delete(id);
      else {
        group.primaryJobIds = group.primaryJobIds.filter((jobId) => jobs.has(jobId));
        group.followUpJobIds = group.followUpJobIds.filter((jobId) => jobs.has(jobId));
      }
    }
    if (latestGroupId && !groups.has(latestGroupId)) latestGroupId = undefined;
    updateDashboard();
    return cleared;
  };

  const updateDashboard = () => {
    if (!latestCtx?.hasUI) return;

    const visibleJobs = Array.from(jobs.values())
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(-8);

    if (visibleJobs.length === 0) {
      latestCtx.ui.setWidget("subagents", undefined);
      return;
    }

    const lines = ["Party"];
    const now = Date.now();
    for (const job of visibleJobs) {
      const elapsed = job.startedAt
        ? formatDuration((job.finishedAt ?? now) - job.startedAt)
        : "queued";
      const event = job.lastEvent ? ` — ${job.lastEvent}` : "";
      const color = latestCtx.ui.theme.fg.bind(latestCtx.ui.theme);
      const badge = statusBadge(job.status, color);
      const persona = job.persona.padEnd(10).slice(0, 10);
      const role = job.agent.padEnd(8).slice(0, 8);
      const label = job.name.padEnd(28).slice(0, 28);
      lines.push(`${badge} ${persona} ${role} ${label} ${elapsed}${event}`);
    }
    latestCtx.ui.setWidget("subagents", lines, { placement: "aboveEditor" });
  };

  const persistJob = (job: JobRecord) => {
    const { proc, cancel, ...data } = job;
    pi.appendEntry("subagents/job", data);
  };

  const maybeNotify = (group: GroupRecord, job: JobRecord) => {
    if (group.notify === "silent") return;
    if (group.notify === "on_error" && job.status !== "failed") return;
    if (group.notify === "on_each_done" || (group.notify === "on_error" && job.status === "failed")) {
      latestCtx?.ui.notify(`Party member ${job.name} ${job.status}.`, job.status === "failed" ? "error" : "info");
      pi.sendMessage({ customType: "subagents", content: summarizeJob(job), display: false, details: { jobId: job.id, groupId: group.id } }, { deliverAs: "nextTurn" });
    }
  };

  const maybeNotifyAllDone = (group: GroupRecord) => {
    if (group.notifiedAllDone || group.notify !== "on_all_done") return;
    const groupJobs = Array.from(jobs.values()).filter((job) => job.groupId === group.id);
    if (groupJobs.some((job) => job.status === "queued" || job.status === "running")) return;
    group.notifiedAllDone = true;
    const summary = groupJobs.map(summarizeJob).join("\n\n");
    latestCtx?.ui.notify(`Party ${group.id} finished.`, "info");
    pi.sendMessage({ customType: "subagents", content: `Party ${group.id} finished.\n\n${summary}`, display: false, details: { groupId: group.id } }, { deliverAs: "nextTurn" });
  };

  const startJob = async (job: JobRecord, preset: AgentPreset) => {
    if (job.status === "cancelled") {
      job.lastEvent = "cancelled before start";
      persistJob(job);
      updateDashboard();
      return;
    }

    job.status = "running";
    job.startedAt = Date.now();
    updateDashboard();

    let promptDir: string | undefined;
    let promptFile: string | undefined;

    try {
      if (job.writeAccess) {
        job.lastEvent = "creating worktree";
        updateDashboard();
        await createWorktree(job.cwd, job);
      }

      const prompt = await writePromptFile(job, preset);
      promptDir = prompt.dir;
      promptFile = prompt.file;

      const args = ["--mode", "json", "-p", "--no-session", "--append-system-prompt", promptFile];
      if (job.model) args.push("--model", job.model);
      if (job.tools?.length) args.push("--tools", job.tools.join(","));
      args.push(`Task: ${job.task}`);

      const runCwd = job.worktreePath ?? job.cwd;
      await fs.promises.mkdir(path.join(os.homedir(), ".pi", "agent", "subagents", "logs"), { recursive: true });
      job.logPath = path.join(os.homedir(), ".pi", "agent", "subagents", "logs", `${job.id}.jsonl`);
      job.resultPath = path.join(os.homedir(), ".pi", "agent", "subagents", "logs", `${job.id}.summary.md`);

      const invocation = getPiInvocation(args);
      job.lastEvent = "starting child pi";
      updateDashboard();

      await new Promise<void>((resolve) => {
        const proc = spawn(invocation.command, invocation.args, { cwd: runCwd, stdio: ["ignore", "pipe", "pipe"] });
        job.proc = proc;
        job.cancel = () => {
          job.status = "cancelled";
          job.error = "Cancelled by parent session";
          proc.kill("SIGTERM");
          setTimeout(() => { if (!proc.killed) proc.kill("SIGKILL"); }, 5000).unref?.();
        };

        let buffer = "";
        let stderr = "";
        const logStream = fs.createWriteStream(job.logPath!, { flags: "a" });

        const processLine = (line: string) => {
          if (!line.trim()) return;
          logStream.write(`${line}\n`);
          let event: any;
          try { event = JSON.parse(line); } catch { return; }
          if (event.type === "tool_execution_start") {
            job.lastEvent = `tool: ${event.toolName}`;
          } else if (event.type === "message_end" && event.message) {
            if (event.message.role === "assistant") {
              job.turns += 1;
              if (event.message.usage?.cost?.total) job.cost += event.message.usage.cost.total;
              const text = extractText(event.message);
              if (text) job.summary = text;
              if (event.message.stopReason === "error") {
                job.status = "failed";
                job.error = event.message.errorMessage || "Assistant error";
              }
            }
          } else if (event.type === "agent_end") {
            job.lastEvent = "agent finished";
          } else if (event.type === "extension_error") {
            job.lastEvent = "extension error";
          }
          updateDashboard();
        };

        proc.stdout.on("data", (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) processLine(line);
        });
        proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
        proc.on("error", (error) => {
          job.status = "failed";
          job.error = error.message;
        });
        proc.on("close", async (code) => {
          if (buffer.trim()) processLine(buffer);
          logStream.end();
          if (job.status !== "cancelled" && job.status !== "failed") {
            if ((code ?? 0) === 0) job.status = "completed";
            else {
              job.status = "failed";
              job.error = stderr || `child pi exited with code ${code}`;
            }
          }
          job.finishedAt = Date.now();
          job.lastEvent = job.status;
          if (job.summary) await fs.promises.writeFile(job.resultPath!, job.summary, "utf8").catch(() => {});
          persistJob(job);
          const group = groups.get(job.groupId);
          if (group) {
            maybeNotify(group, job);
            schedulePolicyFollowUps(group, job).catch((error) => {
              job.error = error instanceof Error ? error.message : String(error);
            });
            maybeNotifyAllDone(group);
          }
          updateDashboard();
          resolve();
        });
      });
    } catch (error) {
      job.status = "failed";
      job.error = error instanceof Error ? error.message : String(error);
      job.finishedAt = Date.now();
      persistJob(job);
      const group = groups.get(job.groupId);
      if (group) maybeNotify(group, job);
      updateDashboard();
    } finally {
      if (promptFile) fs.promises.unlink(promptFile).catch(() => {});
      if (promptDir) fs.promises.rmdir(promptDir).catch(() => {});
    }
  };

  const scheduleJob = (group: GroupRecord, input: DelegateTask, role: PolicyRole) => {
    const preset = presets[input.agent] ?? presets.generic;
    const id = shortId();
    const writeAccess = input.writeAccess ?? preset.writeAccess;
    const persona = input.persona ?? allocateBuiltinPersona(group, jobs, groups);
    if (!persona) throw new Error("All built-in party members are assigned. Run /subagents clear to free completed party members before delegating more party members.");
    const explicitError = input.persona ? validateExplicitPersonas([input], jobs, groups) : undefined;
    if (explicitError) throw new Error(explicitError);
    const job: JobRecord = {
      id,
      groupId: group.id,
      name: input.name ?? `${preset.name}-${id}`,
      persona,
      agent: preset.name,
      task: input.task,
      cwd: path.resolve(input.cwd ?? process.cwd()),
      status: "queued",
      policyRole: role,
      createdAt: Date.now(),
      model: input.model ?? preset.model ?? group.defaultModel,
      tools: input.tools ?? preset.tools,
      writeAccess,
      includeUncommitted: input.includeUncommitted ?? preset.includeUncommitted ?? false,
      turns: 0,
      cost: 0,
    };
    jobs.set(id, job);
    if (role === "primary") group.primaryJobIds.push(id);
    else group.followUpJobIds.push(id);
    setImmediate(() => startJob(job, preset));
    updateDashboard();
    return job;
  };

  async function schedulePolicyFollowUps(group: GroupRecord, finishedJob: JobRecord) {
    if (finishedJob.policyRole !== "primary" || finishedJob.status !== "completed") {
      maybeNotifyAllDone(group);
      return;
    }

    if (group.reviewPolicy === "after_each") {
      scheduleJob(group, {
        name: `Review ${finishedJob.name}`,
        agent: "reviewer",
        cwd: finishedJob.worktreePath ?? finishedJob.cwd,
        task: `Review this completed subagent job.\n\n${summarizeJob(finishedJob)}`,
      }, "reviewer");
    }

    if (group.testPolicy === "after_each") {
      scheduleJob(group, {
        name: `Test ${finishedJob.name}`,
        agent: "tester",
        cwd: finishedJob.worktreePath ?? finishedJob.cwd,
        task: `Verify this completed subagent job.\n\n${summarizeJob(finishedJob)}`,
      }, "tester");
    }

    if (group.afterAllScheduled) {
      maybeNotifyAllDone(group);
      return;
    }

    const primaryJobs = group.primaryJobIds.map((id) => jobs.get(id)).filter((job): job is JobRecord => Boolean(job));
    if (primaryJobs.some((job) => job.status === "queued" || job.status === "running")) return;
    group.afterAllScheduled = true;
    const completed = primaryJobs.filter((job) => job.status === "completed");
    const digest = primaryJobs.map(summarizeJob).join("\n\n---\n\n");

    if (completed.length > 0 && group.reviewPolicy === "after_all") {
      scheduleJob(group, {
        name: `Review group ${group.id}`,
        agent: "reviewer",
        cwd: completed[0].cwd,
        task: `Review this subagent group as a whole. Focus on whether the delegated work satisfies the user's goal and identify integration risks.\n\n${digest}`,
      }, "reviewer");
    }

    if (completed.length > 0 && group.testPolicy === "after_all") {
      scheduleJob(group, {
        name: `Test group ${group.id}`,
        agent: "tester",
        cwd: completed[0].cwd,
        task: `Assess verification for this subagent group and recommend or run appropriate tests.\n\n${digest}`,
      }, "tester");
    }

    if (completed.length > 0 && group.mergePolicy === "integrate") {
      scheduleJob(group, {
        name: `Manual integration plan ${group.id}`,
        agent: "planner",
        cwd: completed[0].cwd,
        task: `The user requested integration, but automatic merge execution is deferred in v1. Produce a manual integration plan for these branches/worktrees.\n\n${digest}`,
      }, "merger");
    }

    maybeNotifyAllDone(group);
  }

  pi.on("session_start", (_event, ctx) => {
    latestCtx = ctx;
    updateDashboard();
  });

  pi.on("input", (_event, ctx) => {
    latestCtx = ctx;
    updateDashboard();
  });

  pi.registerCommand("subagents", {
    description: "Show party member jobs, or clear completed jobs with: subagents clear",
    handler: async (args, ctx) => {
      latestCtx = ctx;
      const [action] = parseCommandArgs(args);
      if (action === "clear") {
        const cleared = clearInactiveJobs();
        ctx.ui.notify(`Cleared ${cleared} inactive party member job(s).`, "info");
        return;
      }
      const all = Array.from(jobs.values()).sort((a, b) => b.createdAt - a.createdAt);
      if (all.length === 0) {
        ctx.ui.notify("No party member jobs yet. Use /subagents clear to clear completed jobs.", "info");
        return;
      }
      ctx.ui.notify(`${all.slice(0, 10).map(summarizeJob).join("\n\n")}\n\nUse /subagents clear to clear completed jobs.`, "info");
    },
  });

  pi.registerTool({
    name: "delegate_subagents",
    label: "Delegate Party",
    description: "Start background Pi party members for delegated tasks. Returns job IDs immediately; use check_subagents for progress.",
    promptSnippet: "Start background party members for parallel or delegated work.",
    promptGuidelines: [
      "Use delegate_subagents when the user asks to delegate, parallelize, or run background party members.",
      "Use check_subagents to inspect party member progress before claiming delegated work is done.",
    ],
    parameters: DelegateParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      latestCtx = ctx;
      const currentModel = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;
      const group: GroupRecord = {
        id: shortId(),
        createdAt: Date.now(),
        reviewPolicy: params.reviewPolicy ?? "after_all",
        testPolicy: params.testPolicy ?? "none",
        mergePolicy: params.mergePolicy ?? "manual",
        notify: params.notify ?? "on_all_done",
        primaryJobIds: [],
        followUpJobIds: [],
        afterAllScheduled: false,
        notifiedAllDone: false,
        personaOrder: shuffledPersonas(),
        reservedPersonas: [],
        defaultModel: currentModel,
      };
      const personaPlan = planTaskPersonas(params.tasks, group, jobs, groups);
      if (personaPlan.error) {
        return {
          content: toolText(personaPlan.error),
          details: { started: false, reason: personaPlan.error },
          terminate: true,
        };
      }

      group.reservedPersonas = personaPlan.reservedPersonas;
      groups.set(group.id, group);
      latestGroupId = group.id;

      const integrateNote = group.mergePolicy === "integrate"
        ? "\n\nNote: mergePolicy=integrate creates integration guidance in v1; it does not automatically merge into the parent branch."
        : "";

      const started = params.tasks.map((task: DelegateTask, index: number) => scheduleJob(group, { ...task, persona: personaPlan.personas[index], cwd: task.cwd ?? params.cwd ?? ctx.cwd }, "primary"));
      const summary = started.map((job) => `- ${job.name}: ${job.id}${job.writeAccess ? ` (${job.branch ?? "worktree pending"})` : ""}`).join("\n");
      return {
        content: toolText(`Started party ${group.id}.\n\n${summary}\n\nUse check_subagents to inspect progress.${integrateNote}`),
        details: { groupId: group.id, jobIds: started.map((job) => job.id) },
        terminate: true,
      };
    },
  });

  pi.registerTool({
    name: "check_subagents",
    label: "Check Party",
    description: "Check party member status, summaries, branches, and log paths.",
    promptSnippet: "Inspect party member progress and results.",
    parameters: CheckParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      latestCtx = ctx;
      let selected = Array.from(jobs.values());
      if (params.jobId) selected = selected.filter((job) => job.id === params.jobId);
      if (params.groupId) selected = selected.filter((job) => job.groupId === params.groupId);
      if (params.includeCompleted === false) selected = selected.filter(isActiveJob);
      selected.sort((a, b) => a.createdAt - b.createdAt);
      if (selected.length === 0) return { content: toolText("No matching party member jobs."), details: { jobs: [] } };
      return {
        content: toolText(selected.map(summarizeJob).join("\n\n---\n\n")),
        details: { jobs: selected.map(({ proc, cancel, ...job }) => job) },
      };
    },
  });

  pi.registerTool({
    name: "cancel_subagent",
    label: "Cancel Party Member",
    description: "Cancel one party member, a party, or all running party member jobs.",
    parameters: CancelParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      latestCtx = ctx;
      let selected = Array.from(jobs.values()).filter(isActiveJob);
      if (params.jobId) selected = selected.filter((job) => job.id === params.jobId);
      if (params.groupId) selected = selected.filter((job) => job.groupId === params.groupId);
      if (!params.all && !params.jobId && !params.groupId) {
        return { content: toolText("Provide jobId, groupId, or all: true."), details: { cancelled: [] } };
      }
      for (const job of selected) {
        job.cancel?.();
        if (job.status === "queued") job.status = "cancelled";
        job.finishedAt = Date.now();
      }
      updateDashboard();
      return { content: toolText(`Cancelled ${selected.length} party member job(s).`), details: { cancelled: selected.map((job) => job.id) } };
    },
  });
}
