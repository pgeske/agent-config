import { existsSync } from "node:fs";
import { basename } from "node:path";
import type { BranchMetadata } from "./core.ts";

const TMUX_TIMEOUT_MS = 5_000;
const PANE_ID_PATTERN = /^%\d+$/;

export interface ExecResult {
	stdout: string;
	stderr: string;
	code: number;
	killed?: boolean;
}

export type ExecCommand = (
	command: string,
	args: string[],
	options?: { timeout?: number },
) => Promise<ExecResult>;

export interface TmuxContext {
	sessionId: string;
	windowId: string;
	paneId: string;
}

export interface LaunchBranchOptions {
	exec: ExecCommand;
	tmux: TmuxContext;
	parentSessionId: string;
	branchSessionId: string;
	branchSessionFile: string;
	branchName: string;
	depth: number;
	windowDepth: number;
	windowRootSessionId: string;
	cwd: string;
	promptFile?: string;
	model?: string;
	thinkingLevel?: string;
	newWindow: boolean;
	windowName: string;
	createdAt: string;
}

interface PaneInfo {
	paneId: string;
	left: number;
	top: number;
	branchParentSessionId?: string;
}

export interface ActiveChildBranch {
	paneId: string;
	branchSessionId: string;
	branchName: string;
}

export interface PaneBranchPlacement {
	windowDepth: number;
	windowRootSessionId: string;
}

export interface DetachedPane {
	windowId: string;
	paneId: string;
}

function commandError(action: string, result: ExecResult): Error {
	const detail = result.stderr.trim() || result.stdout.trim() || `exit code ${result.code}`;
	return new Error(`${action} failed: ${detail}`);
}

export async function getTmuxContext(exec: ExecCommand, paneId: string | undefined): Promise<TmuxContext> {
	if (!process.env.TMUX || !paneId || !PANE_ID_PATTERN.test(paneId)) {
		throw new Error("Session branching requires an interactive Pi process running inside tmux");
	}

	const result = await exec(
		"tmux",
		["display-message", "-p", "-t", paneId, "#{session_id}\t#{window_id}\t#{pane_id}"],
		{ timeout: TMUX_TIMEOUT_MS },
	);
	if (result.code !== 0) throw commandError("Resolving the current tmux pane", result);
	const [sessionId, windowId, resolvedPaneId] = result.stdout.trim().split("\t");
	if (!sessionId || !windowId || resolvedPaneId !== paneId) {
		throw new Error("tmux returned incomplete context for the current Pi pane");
	}
	return { sessionId, windowId, paneId: resolvedPaneId };
}

export async function readPaneBranchPlacement(
	exec: ExecCommand,
	paneId: string,
	branchSessionId: string,
): Promise<PaneBranchPlacement | undefined> {
	const result = await exec(
		"tmux",
		[
			"display-message",
			"-p",
			"-t",
			paneId,
			"#{@pi_branch_session}\t#{@pi_branch_window_depth}\t#{@pi_branch_window_root_session}",
		],
		{ timeout: TMUX_TIMEOUT_MS },
	);
	if (result.code !== 0) throw commandError("Reading branch pane placement", result);
	const [storedBranchSessionId, windowDepthValue, windowRootSessionId] = result.stdout.trimEnd().split("\t");
	if (!storedBranchSessionId || storedBranchSessionId !== branchSessionId) return undefined;
	const windowDepth = Number(windowDepthValue);
	if (!Number.isInteger(windowDepth) || windowDepth < 0 || !windowRootSessionId) {
		throw new Error(`Branch pane ${paneId} has invalid window placement metadata`);
	}
	return { windowDepth, windowRootSessionId };
}

function parsePaneList(output: string): PaneInfo[] {
	if (!output.trim()) return [];
	return output.trimEnd().split("\n").map((line) => {
		const [paneId, left, top, branchParentSessionId] = line.split("\t");
		if (!PANE_ID_PATTERN.test(paneId) || !Number.isFinite(Number(left)) || !Number.isFinite(Number(top))) {
			throw new Error(`tmux returned an invalid pane record: ${line}`);
		}
		return {
			paneId,
			left: Number(left),
			top: Number(top),
			branchParentSessionId: branchParentSessionId || undefined,
		};
	});
}

async function listWindowPanes(exec: ExecCommand, windowId: string): Promise<PaneInfo[]> {
	const result = await exec(
		"tmux",
		[
			"list-panes",
			"-t",
			windowId,
			"-F",
			"#{pane_id}\t#{pane_left}\t#{pane_top}\t#{@pi_branch_parent_session}",
		],
		{ timeout: TMUX_TIMEOUT_MS },
	);
	if (result.code !== 0) throw commandError("Inspecting the tmux window", result);
	return parsePaneList(result.stdout);
}

export async function detachPaneToWindow(
	exec: ExecCommand,
	tmux: TmuxContext,
	windowName: string,
): Promise<DetachedPane> {
	const panes = await listWindowPanes(exec, tmux.windowId);
	if (!panes.some((pane) => pane.paneId === tmux.paneId)) {
		throw new Error(`Pane ${tmux.paneId} is no longer in the captured tmux window`);
	}
	if (panes.length === 1) {
		throw new Error("The current pane is already the only pane in its tmux window");
	}

	const result = await exec(
		"tmux",
		[
			"break-pane",
			"-s",
			tmux.paneId,
			"-t",
			`${tmux.sessionId}:`,
			"-n",
			windowName,
			"-P",
			"-F",
			"#{window_id}\t#{pane_id}",
		],
		{ timeout: TMUX_TIMEOUT_MS },
	);
	if (result.code !== 0) throw commandError("Detaching the branch pane", result);
	const [windowId, paneId] = result.stdout.trim().split("\t");
	if (!windowId || !PANE_ID_PATTERN.test(paneId) || paneId !== tmux.paneId) {
		throw new Error(`tmux returned invalid detached pane details: ${result.stdout.trim() || "(empty output)"}`);
	}
	return { windowId, paneId };
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function currentPiInvocation(args: string[]): { command: string; args: string[] } {
	const currentScript = process.argv[1];
	const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
	if (currentScript && !isBunVirtualScript && existsSync(currentScript)) {
		return { command: process.execPath, args: [currentScript, ...args] };
	}

	const executableName = basename(process.execPath).toLowerCase();
	if (!/^(node|bun)(\.exe)?$/.test(executableName)) {
		return { command: process.execPath, args };
	}
	return { command: "pi", args };
}

export function buildPiShellCommand(options: {
	cwd: string;
	sessionFile: string;
	promptFile?: string;
	model?: string;
	thinkingLevel?: string;
	launchChannel: string;
}): string {
	const args = ["--session", options.sessionFile];
	if (options.model) args.push("--model", options.model);
	if (options.thinkingLevel) args.push("--thinking", options.thinkingLevel);
	const invocation = currentPiInvocation(args);
	const piCommand = [invocation.command, ...invocation.args].map(shellQuote).join(" ");
	const promptCommand = options.promptFile
		? `branch_prompt=$(cat ${shellQuote(options.promptFile)}) && rm -f ${shellQuote(options.promptFile)} && exec ${piCommand} "$branch_prompt"`
		: `exec ${piCommand}`;
	return `cd ${shellQuote(options.cwd)} && tmux wait-for ${shellQuote(options.launchChannel)} && ${promptCommand}`;
}

async function setPaneOptions(exec: ExecCommand, paneId: string, paneOptions: Array<[string, string]>): Promise<void> {
	for (const [name, value] of paneOptions) {
		const result = await exec("tmux", ["set-option", "-p", "-t", paneId, name, value], {
			timeout: TMUX_TIMEOUT_MS,
		});
		if (result.code !== 0) throw commandError(`Tagging branch pane ${paneId}`, result);
	}
}

// Rebalance the surviving split tree after this pane exits so branch stacks do
// not retain the uneven sizes created by tmux's incremental split history.
async function setPaneExitLayoutHook(exec: ExecCommand, paneId: string): Promise<void> {
	const result = await exec(
		"tmux",
		["set-hook", "-p", "-t", paneId, "pane-exited", 'select-layout -E -t "#{window_id}"'],
		{ timeout: TMUX_TIMEOUT_MS },
	);
	if (result.code !== 0) throw commandError(`Configuring layout cleanup for branch pane ${paneId}`, result);
}

async function setPaneMetadata(options: LaunchBranchOptions, paneId: string): Promise<void> {
	const paneOptions: Array<[string, string]> = [
		["@pi_branch_parent_session", options.parentSessionId],
		["@pi_branch_session", options.branchSessionId],
		["@pi_branch_name", options.branchName],
		["@pi_branch_depth", String(options.depth)],
		["@pi_branch_window_depth", String(options.windowDepth)],
		["@pi_branch_window_root_session", options.windowRootSessionId],
		["@pi_branch_created_at", options.createdAt],
	];
	await setPaneOptions(options.exec, paneId, paneOptions);
	await setPaneExitLayoutHook(options.exec, paneId);
}

export async function syncCurrentPaneBranchMetadata(
	exec: ExecCommand,
	paneId: string,
	sessionId: string,
	sessionName: string | undefined,
	metadata: BranchMetadata | undefined,
): Promise<void> {
	const optionNames = [
		"@pi_branch_parent_session",
		"@pi_branch_session",
		"@pi_branch_name",
		"@pi_branch_depth",
		"@pi_branch_window_depth",
		"@pi_branch_window_root_session",
		"@pi_branch_created_at",
	];
	if (!metadata) {
		for (const name of optionNames) {
			await exec("tmux", ["set-option", "-p", "-q", "-u", "-t", paneId, name], { timeout: TMUX_TIMEOUT_MS });
		}
		return;
	}
	await setPaneOptions(exec, paneId, [
		["@pi_branch_parent_session", metadata.parentSessionId],
		["@pi_branch_session", sessionId],
		["@pi_branch_name", sessionName ?? metadata.branchName],
		["@pi_branch_depth", String(metadata.depth)],
		["@pi_branch_window_depth", String(metadata.windowDepth)],
		["@pi_branch_window_root_session", metadata.windowRootSessionId],
		["@pi_branch_created_at", metadata.createdAt],
	]);
	await setPaneExitLayoutHook(exec, paneId);
}

export async function listActiveChildBranches(
	exec: ExecCommand,
	parentSessionId: string,
): Promise<ActiveChildBranch[]> {
	const result = await exec(
		"tmux",
		[
			"list-panes",
			"-a",
			"-F",
			"#{session_id}\t#{pane_id}\t#{pane_dead}\t#{@pi_branch_parent_session}\t#{@pi_branch_session}\t#{@pi_branch_name}",
		],
		{ timeout: TMUX_TIMEOUT_MS },
	);
	if (result.code !== 0) throw commandError("Inspecting active child branches", result);
	if (!result.stdout.trim()) return [];
	return result.stdout
		.trimEnd()
		.split("\n")
		.map((line) => line.split("\t"))
		.filter(
			([_sessionId, _paneId, paneDead, branchParentSessionId, branchSessionId]) =>
				paneDead !== "1" && branchParentSessionId === parentSessionId && Boolean(branchSessionId),
		)
		.map(([_sessionId, paneId, _paneDead, _parentSessionId, branchSessionId, branchName]) => ({
			paneId,
			branchSessionId,
			branchName: branchName || branchSessionId.slice(0, 8),
		}));
}

async function killPane(exec: ExecCommand, paneId: string): Promise<void> {
	await exec("tmux", ["kill-pane", "-t", paneId], { timeout: TMUX_TIMEOUT_MS });
}

export async function launchBranch(options: LaunchBranchOptions): Promise<{ paneId: string; launchMode: "pane" | "window" }> {
	const launchChannel = `pi-branch-start-${options.branchSessionId}`;
	const shellCommand = buildPiShellCommand({
		cwd: options.cwd,
		sessionFile: options.branchSessionFile,
		promptFile: options.promptFile,
		model: options.model,
		thinkingLevel: options.thinkingLevel,
		launchChannel,
	});
	let launchArgs: string[];
	let launchMode: "pane" | "window";

	if (options.newWindow) {
		launchMode = "window";
		launchArgs = [
			"new-window",
			"-d",
			"-t",
			`${options.tmux.sessionId}:`,
			"-n",
			options.windowName,
			"-P",
			"-F",
			"#{pane_id}",
			shellCommand,
		];
	} else {
		launchMode = "pane";
		const panes = await listWindowPanes(options.exec, options.tmux.windowId);
		const parentPane = panes.find((pane) => pane.paneId === options.tmux.paneId);
		if (!parentPane) throw new Error(`Parent pane ${options.tmux.paneId} is no longer in the captured tmux window`);

		const branchPanes = panes.filter((pane) => pane.branchParentSessionId === options.parentSessionId);
		const unmanagedPanes = panes.filter(
			(pane) => pane.paneId !== options.tmux.paneId && pane.branchParentSessionId !== options.parentSessionId,
		);
		if (unmanagedPanes.length > 0) {
			throw new Error(
				`The current tmux window contains unmanaged panes (${unmanagedPanes.map((pane) => pane.paneId).join(", ")}); refusing to guess at the branch layout`,
			);
		}

		if (branchPanes.length === 0) {
			if (panes.length !== 1) throw new Error("The first same-window branch requires a single-pane tmux window");
			launchArgs = ["split-window", "-h", "-t", options.tmux.paneId, "-P", "-F", "#{pane_id}", shellCommand];
		} else {
			const topBranchPane = [...branchPanes].sort((left, right) => left.top - right.top || left.left - right.left)[0];
			launchArgs = ["split-window", "-v", "-b", "-t", topBranchPane.paneId, "-P", "-F", "#{pane_id}", shellCommand];
		}
	}

	const launched = await options.exec("tmux", launchArgs, { timeout: TMUX_TIMEOUT_MS });
	if (launched.code !== 0) throw commandError(`Creating the branch ${launchMode}`, launched);
	const paneId = launched.stdout.trim();
	if (!PANE_ID_PATTERN.test(paneId)) {
		throw new Error(`tmux did not return a branch pane ID: ${paneId || "(empty output)"}`);
	}

	try {
		await setPaneMetadata(options, paneId);
		const released = await options.exec("tmux", ["wait-for", "-S", launchChannel], { timeout: TMUX_TIMEOUT_MS });
		if (released.code !== 0) throw commandError(`Starting branch pane ${paneId}`, released);
	} catch (error) {
		await killPane(options.exec, paneId);
		throw error;
	}

	// Focus the new branch so the user lands in it immediately.
	if (launchMode === "window") {
		await options.exec("tmux", ["select-window", "-t", paneId], { timeout: TMUX_TIMEOUT_MS });
	} else {
		await options.exec("tmux", ["select-pane", "-t", paneId], { timeout: TMUX_TIMEOUT_MS });
	}
	return { paneId, launchMode };
}
