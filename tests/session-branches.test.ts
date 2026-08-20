import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	SessionManager,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type ExtensionContext,
	type SessionEntry,
} from "@earendil-works/pi-coding-agent";
import {
	BRANCH_METADATA_TYPE,
	buildBranchSession,
	childBranchPlacement,
	defaultBranchName,
	detachedBranchMetadata,
	entriesAfterBranchPoint,
	findBranchMetadata,
	mergeMessageContent,
	normalizeBranchName,
	parentMovedSinceFork,
	parseBranchCommandArgs,
	serializeSessionEntries,
	slugifyBranchName,
	type BranchMergeDetails,
	type BranchMetadata,
} from "../extensions/session-branches/core.ts";
import {
	checkParentReady,
	registryPathForSession,
	requestParentMerge,
	startParentRuntime,
	type MergePayload,
} from "../extensions/session-branches/ipc.ts";
import { visibleWidth } from "@earendil-works/pi-tui";
import { BranchNameDialog } from "../extensions/session-branches/branch-name-dialog.ts";
import sessionBranchesExtension from "../extensions/session-branches/index.ts";
import {
	detachPaneToWindow,
	launchBranch,
	listActiveChildBranches,
	readPaneBranchPlacement,
	type ExecCommand,
} from "../extensions/session-branches/tmux.ts";

function userEntry(id: string, parentId: string | null, text: string): SessionEntry {
	return {
		type: "message",
		id,
		parentId,
		timestamp: "2026-07-31T12:00:00.000Z",
		message: { role: "user", content: text, timestamp: Date.now() },
	};
}

function assistantEntry(id: string, parentId: string, text: string): SessionEntry {
	return {
		type: "message",
		id,
		parentId,
		timestamp: "2026-07-31T12:00:01.000Z",
		message: {
			role: "assistant",
			content: [{ type: "text", text }],
			api: "test",
			provider: "test",
			model: "test",
			usage: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 0,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "stop",
			timestamp: Date.now(),
		},
	};
}

function metadataFixture(overrides: Partial<BranchMetadata> = {}): BranchMetadata {
	return {
		version: 2,
		depth: 1,
		windowDepth: 1,
		windowRootSessionId: "parent-session",
		fresh: false,
		branchSessionId: "branch-session",
		branchSessionFile: "/tmp/branch.jsonl",
		branchName: "parent-branch-1",
		branchNumber: 1,
		parentSessionId: "parent-session",
		parentSessionFile: "/tmp/parent.jsonl",
		parentPaneId: "%1",
		parentWindowId: "@1",
		forkEntryId: "parent-leaf",
		launchMode: "pane",
		createdAt: "2026-07-31T12:00:00.000Z",
		...overrides,
	} as BranchMetadata;
}

test("branch name dialog submits a trimmed name and cancels with escape", () => {
	const completed: Array<string | undefined> = [];
	const theme = {
		fg: (_color: string, text: string) => text,
		bold: (text: string) => text,
	} as never;
	const keybindings = {
		matches: (data: string, keybinding: string) =>
			(keybinding === "tui.input.submit" && data === "\r") ||
			(keybinding === "tui.select.cancel" && data === "\u001b"),
	} as never;
	const dialog = new BranchNameDialog(theme, keybindings, (name) => completed.push(name));
	dialog.focused = true;

	const initial = dialog.render(48);
	assert.ok(initial.some((line) => line.includes("New branch")));
	assert.ok(initial.every((line) => visibleWidth(line) <= 48));

	dialog.handleInput("   release   review   ");
	dialog.handleInput("\r");
	assert.equal(completed.length, 1);
	assert.equal(completed[0], "release review");

	const empty = new BranchNameDialog(theme, keybindings, (name) => completed.push(name));
	empty.handleInput("\r");
	assert.ok(empty.render(48).some((line) => line.includes("Enter a branch name")));
	empty.handleInput("\u001b");
	assert.deepEqual(completed, ["release review", undefined]);
});

test("parseBranchCommandArgs starts fresh unless parent context is explicitly requested", () => {
	assert.deepEqual(
		parseBranchCommandArgs(
			'--with-context --new-window --name "OAuth design" --cwd ../oauth-worktree investigate "token exchange"',
		),
		{
			fresh: false,
			newWindow: true,
			help: false,
			name: "OAuth design",
			prompt: "investigate token exchange",
			cwd: "../oauth-worktree",
		},
	);
	assert.deepEqual(parseBranchCommandArgs("--prompt='inspect a failure' --name=debug"), {
		fresh: true,
		newWindow: false,
		help: false,
		name: "debug",
		prompt: "inspect a failure",
	});
});

test("parseBranchCommandArgs rejects ambiguous and malformed input", () => {
	assert.throws(() => parseBranchCommandArgs('--prompt "one" two'), /either --prompt or positional text/);
	assert.throws(() => parseBranchCommandArgs("--unknown"), /Unknown option/);
	assert.throws(() => parseBranchCommandArgs("--fresh"), /Unknown option/);
	assert.throws(() => parseBranchCommandArgs('--name "unterminated'), /Unterminated/);
	assert.throws(() => parseBranchCommandArgs("--prompt --with-context"), /requires a value/);
	assert.throws(() => parseBranchCommandArgs('--cwd ""'), /--cwd cannot be empty/);
});

test("branch names are stable, bounded, and tmux-safe", () => {
	assert.equal(defaultBranchName("auth rollout", "1234567890", 3), "auth rollout-branch-3");
	assert.equal(normalizeBranchName("  OAuth\n  rollout  "), "OAuth rollout");
	assert.equal(defaultBranchName(undefined, "1234567890", 1), "session-12345678-branch-1");
	assert.ok(defaultBranchName("x".repeat(120), "id", 9).length <= 80);
	assert.equal(slugifyBranchName("OAuth / Token Exchange!"), "oauth-token-exchange");
});

test("nested branch placement resets pane depth in new windows", () => {
	assert.deepEqual(
		childBranchPlacement({
			parentSessionId: "main",
			branchSessionId: "project",
			newWindow: true,
		}),
		{ depth: 1, windowDepth: 0, windowRootSessionId: "project" },
	);
	const projectMetadata = metadataFixture({
		branchSessionId: "project",
		depth: 1,
		windowDepth: 0,
		windowRootSessionId: "project",
		launchMode: "window",
	});
	assert.deepEqual(
		childBranchPlacement({
			parentSessionId: "project",
			parentMetadata: projectMetadata,
			branchSessionId: "subagent",
			newWindow: false,
		}),
		{ depth: 2, windowDepth: 1, windowRootSessionId: "project" },
	);
	assert.throws(
		() =>
			childBranchPlacement({
				parentSessionId: "subagent",
				parentMetadata: metadataFixture({ depth: 2, windowDepth: 1, windowRootSessionId: "project" }),
				branchSessionId: "too-deep",
				newWindow: false,
			}),
		/use \/branch --new-window/,
	);
	assert.deepEqual(
		childBranchPlacement({
			parentSessionId: "subagent",
			parentMetadata: metadataFixture({ depth: 2, windowDepth: 1, windowRootSessionId: "project" }),
			branchSessionId: "deeper-project",
			newWindow: true,
		}),
		{ depth: 3, windowDepth: 0, windowRootSessionId: "deeper-project" },
	);
});

test("detached branches become the layout root of their new window", () => {
	const metadata = detachedBranchMetadata(metadataFixture());
	assert.equal(metadata.depth, 1);
	assert.equal(metadata.windowDepth, 0);
	assert.equal(metadata.windowRootSessionId, "branch-session");
	assert.equal(metadata.launchMode, "window");
	assert.equal(metadata.parentSessionId, "parent-session");
	assert.equal(metadata.forkEntryId, "parent-leaf");
});

test("legacy depth-one metadata keeps its wire version while deriving nested-branch fields", () => {
	const legacy = { ...metadataFixture(), version: 1 } as Record<string, unknown>;
	delete legacy.windowDepth;
	delete legacy.windowRootSessionId;
	const found = findBranchMetadata([
		{
			type: "custom",
			id: "legacy-metadata",
			parentId: null,
			timestamp: "2026-07-31T12:00:00.000Z",
			customType: BRANCH_METADATA_TYPE,
			data: legacy,
		},
	]);
	assert.equal(found?.metadata.version, 1);
	assert.equal(found?.metadata.windowDepth, 1);
	assert.equal(found?.metadata.windowRootSessionId, "parent-session");
});

test("buildBranchSession clones only the active path and records the exact fork point", () => {
	const parentEntries = [userEntry("root", null, "root"), userEntry("parent-leaf", "root", "continue")];
	const built = buildBranchSession({
		parentEntries,
		parentSessionId: "parent-session",
		parentSessionFile: "/tmp/parent.jsonl",
		cwd: "/repo",
		forkEntryId: "parent-leaf",
		branchSessionId: "branch-session",
		branchSessionFile: "/tmp/branch.jsonl",
		branchName: "parent-branch-1",
		branchNumber: 1,
		depth: 1,
		windowDepth: 1,
		windowRootSessionId: "parent-session",
		parentPaneId: "%1",
		parentWindowId: "@1",
		fresh: false,
		launchMode: "pane",
		createdAt: "2026-07-31T12:00:00.000Z",
		metadataEntryId: "metadata",
		sessionInfoEntryId: "session-info",
	});

	assert.equal(built.entries[0].type, "session");
	assert.deepEqual(
		built.entries.slice(1, 3).map((entry) => ("id" in entry ? entry.id : undefined)),
		["root", "parent-leaf"],
	);
	assert.equal(built.metadata.forkEntryId, "parent-leaf");
	const metadataEntry = built.entries[3];
	assert.equal(metadataEntry.type, "custom");
	if (metadataEntry.type === "custom") {
		assert.equal(metadataEntry.customType, BRANCH_METADATA_TYPE);
		assert.equal(metadataEntry.parentId, "parent-leaf");
	}
	const sessionInfo = built.entries[4];
	assert.equal(sessionInfo.type, "session_info");
	if (sessionInfo.type === "session_info") assert.equal(sessionInfo.parentId, "metadata");

	const serialized = serializeSessionEntries(built.entries);
	assert.ok(serialized.endsWith("\n"));
	assert.equal(serialized.trim().split("\n").length, 5);
});

test("generated branch files open as normal Pi sessions", async () => {
	const directory = await mkdtemp(join(tmpdir(), "session-branch-file-test-"));
	const branchFile = join(directory, "branch.jsonl");
	try {
		const built = buildBranchSession({
			parentEntries: [userEntry("parent-leaf", null, "parent context")],
			parentSessionId: "parent-session",
			parentSessionFile: join(directory, "parent.jsonl"),
			cwd: "/repo",
			forkEntryId: "parent-leaf",
			branchSessionId: "branch-session",
			branchSessionFile: branchFile,
			branchName: "branch",
			branchNumber: 1,
			depth: 1,
			windowDepth: 1,
			windowRootSessionId: "parent-session",
			parentPaneId: "%1",
			parentWindowId: "@1",
			fresh: false,
			launchMode: "pane",
			createdAt: "2026-07-31T12:00:00.000Z",
			metadataEntryId: "metadata",
			sessionInfoEntryId: "session-info",
		});
		await writeFile(branchFile, serializeSessionEntries(built.entries), { mode: 0o600 });
		const session = SessionManager.open(branchFile);
		assert.equal(session.getSessionId(), "branch-session");
		assert.equal(session.getSessionName(), "branch");
		assert.equal(findBranchMetadata(session.getEntries())?.metadata.parentSessionId, "parent-session");
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("fresh branches contain metadata but no inherited conversation", () => {
	const built = buildBranchSession({
		parentEntries: [userEntry("parent-leaf", null, "parent context")],
		parentSessionId: "parent-session",
		parentSessionFile: "/tmp/parent.jsonl",
		cwd: "/repo",
		forkEntryId: "parent-leaf",
		branchSessionId: "branch-session",
		branchSessionFile: "/tmp/branch.jsonl",
		branchName: "fresh",
		branchNumber: 1,
		depth: 1,
		windowDepth: 0,
		windowRootSessionId: "branch-session",
		parentPaneId: "%1",
		parentWindowId: "@1",
		fresh: true,
		launchMode: "window",
		createdAt: "2026-07-31T12:00:00.000Z",
		metadataEntryId: "metadata",
		sessionInfoEntryId: "session-info",
	});

	assert.equal(built.entries.length, 3);
	const metadataEntry = built.entries[1];
	assert.equal(metadataEntry.type, "custom");
	if (metadataEntry.type === "custom") assert.equal(metadataEntry.parentId, null);
	assert.equal(built.metadata.fresh, true);
	assert.equal(built.metadata.forkEntryId, "parent-leaf");
});

test("findBranchMetadata and entriesAfterBranchPoint isolate branch-only entries", () => {
	const metadata = metadataFixture();
	const entries: SessionEntry[] = [
		userEntry("parent-leaf", null, "parent"),
		{
			type: "custom",
			id: "metadata",
			parentId: "parent-leaf",
			timestamp: metadata.createdAt,
			customType: BRANCH_METADATA_TYPE,
			data: metadata,
		},
		userEntry("branch-user", "metadata", "branch work"),
	];
	const found = findBranchMetadata(entries);
	assert.equal(found?.entryId, "metadata");
	assert.equal(found?.metadata.branchSessionId, "branch-session");
	assert.deepEqual(entriesAfterBranchPoint(entries, "metadata").map((entry) => entry.id), ["branch-user"]);
	assert.match(mergeMessageContent("test", "## Outcome\nDone"), /Parallel branch "test" merged/);
});

test("parentMovedSinceFork detects /tree navigation onto a sibling path", () => {
	const activeParentBranch = [userEntry("root", null, "root"), userEntry("current-leaf", "root", "current")];
	assert.equal(parentMovedSinceFork(activeParentBranch, "root"), false);
	assert.equal(parentMovedSinceFork(activeParentBranch, "old-sibling"), true);
	assert.equal(parentMovedSinceFork(activeParentBranch, null), false);
});

test("parent runtime accepts an authenticated merge and removes its registry on shutdown", async () => {
	const runtimeDir = await mkdtemp(join(tmpdir(), "session-branches-test-"));
	const previousRuntimeDir = process.env.PI_SESSION_BRANCH_RUNTIME_DIR;
	process.env.PI_SESSION_BRANCH_RUNTIME_DIR = runtimeDir;
	try {
		let received: MergePayload | undefined;
		let checks = 0;
		const runtime = await startParentRuntime({
			sessionId: "parent-session",
			sessionFile: "/tmp/parent.jsonl",
			paneId: "%1",
			onCheck: () => {
				checks += 1;
			},
			onMerge: (payload) => {
				received = payload;
			},
		});
		const metadata = metadataFixture();
		const details: BranchMergeDetails = {
			version: 2,
			depth: metadata.depth,
			windowDepth: metadata.windowDepth,
			branchSessionId: metadata.branchSessionId,
			branchSessionFile: metadata.branchSessionFile,
			branchName: metadata.branchName,
			branchNumber: 1,
			forkEntryId: metadata.forkEntryId,
			fresh: false,
			mergedAt: "2026-07-31T13:00:00.000Z",
			readFiles: [],
			modifiedFiles: [],
		};
		await checkParentReady(metadata);
		await requestParentMerge(metadata, { metadata, summary: "done", details });
		assert.equal(checks, 1);
		assert.equal(received?.summary, "done");
		assert.equal(JSON.parse(await readFile(registryPathForSession("parent-session"), "utf8")).pid, process.pid);
		await runtime.stop();
		await assert.rejects(readFile(registryPathForSession("parent-session"), "utf8"), /ENOENT/);
	} finally {
		if (previousRuntimeDir === undefined) delete process.env.PI_SESSION_BRANCH_RUNTIME_DIR;
		else process.env.PI_SESSION_BRANCH_RUNTIME_DIR = previousRuntimeDir;
		await rm(runtimeDir, { recursive: true, force: true });
	}
});

test("legacy branch metadata remains compatible with a version-one parent runtime", async () => {
	const runtimeDir = await mkdtemp("/tmp/sb-legacy-parent-");
	const previousRuntimeDir = process.env.PI_SESSION_BRANCH_RUNTIME_DIR;
	process.env.PI_SESSION_BRANCH_RUNTIME_DIR = runtimeDir;
	try {
		const legacy = { ...metadataFixture(), version: 1 } as Record<string, unknown>;
		delete legacy.windowDepth;
		delete legacy.windowRootSessionId;
		const metadata = findBranchMetadata([
			{
				type: "custom",
				id: "legacy-metadata",
				parentId: null,
				timestamp: "2026-07-31T12:00:00.000Z",
				customType: BRANCH_METADATA_TYPE,
				data: legacy,
			},
		])!.metadata;
		const runtime = await startParentRuntime({
			sessionId: "parent-session",
			sessionFile: "/tmp/parent.jsonl",
			paneId: "%1",
			onCheck: (received) => {
				assert.equal(received.version, 1);
				assert.equal(received.depth, 1);
			},
			onMerge: () => undefined,
		});
		await checkParentReady(metadata);
		await runtime.stop();
	} finally {
		if (previousRuntimeDir === undefined) delete process.env.PI_SESSION_BRANCH_RUNTIME_DIR;
		else process.env.PI_SESSION_BRANCH_RUNTIME_DIR = previousRuntimeDir;
		await rm(runtimeDir, { recursive: true, force: true });
	}
});

test("a nested busy /branch --with-context starts immediately and excludes the active partial turn", async () => {
	const directory = await mkdtemp(join(tmpdir(), "session-branch-steer-test-"));
	const runtimeDirectory = await mkdtemp("/tmp/sb-steer-");
	const parentFile = join(directory, "parent.jsonl");
	const previousRuntimeDirectory = process.env.PI_SESSION_BRANCH_RUNTIME_DIR;
	const previousTmux = process.env.TMUX;
	const previousTmuxPane = process.env.TMUX_PANE;
	process.env.PI_SESSION_BRANCH_RUNTIME_DIR = runtimeDirectory;
	process.env.TMUX = "/tmp/test-tmux,1,0";
	process.env.TMUX_PANE = "%1";

	try {
		const parentEntries = [userEntry("parent-user", null, "completed request"), assistantEntry("parent-leaf", "parent-user", "completed response")];
		const project = buildBranchSession({
			parentEntries,
			parentSessionId: "main-session",
			parentSessionFile: join(directory, "main.jsonl"),
			cwd: directory,
			forkEntryId: "parent-leaf",
			branchSessionId: "project-session",
			branchSessionFile: parentFile,
			branchName: "project",
			branchNumber: 1,
			depth: 1,
			windowDepth: 0,
			windowRootSessionId: "project-session",
			parentPaneId: "%0",
			parentWindowId: "@0",
			fresh: false,
			launchMode: "window",
			createdAt: "2026-07-31T12:00:00.000Z",
			metadataEntryId: "project-metadata",
			sessionInfoEntryId: "project-session-info",
		});
		await writeFile(parentFile, serializeSessionEntries(project.entries), { mode: 0o600 });
		const sessionManager = SessionManager.open(parentFile);
		const handlers = new Map<string, Array<(event: unknown, ctx: ExtensionContext) => unknown>>();
		const commands = new Map<string, { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> }>();
		const tools = new Map<
			string,
			{
				execute: (
					toolCallId: string,
					params: Record<string, unknown>,
					signal: AbortSignal | undefined,
					onUpdate: undefined,
					ctx: ExtensionContext,
				) => Promise<{ content: Array<{ type: string; text: string }>; details?: unknown }>;
			}
		>();
		const notifications: string[] = [];
		const shortcuts = new Map<string, { description?: string; handler: (ctx: ExtensionContext) => Promise<void> | void }>();
		let splitCalls = 0;
		const childPaneIds: string[] = [];
		let idle = true;

		const fakePi = {
			on(event: string, handler: (event: unknown, ctx: ExtensionContext) => unknown) {
				handlers.set(event, [...(handlers.get(event) ?? []), handler]);
			},
			registerCommand(name: string, command: { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> }) {
				commands.set(name, command);
			},
			registerTool(tool: {
				name: string;
				execute: (
					toolCallId: string,
					params: Record<string, unknown>,
					signal: AbortSignal | undefined,
					onUpdate: undefined,
					ctx: ExtensionContext,
				) => Promise<{ content: Array<{ type: string; text: string }>; details?: unknown }>;
			}) {
				tools.set(tool.name, tool);
			},
			registerShortcut(shortcut: string, options: { description?: string; handler: (ctx: ExtensionContext) => Promise<void> | void }) {
				shortcuts.set(shortcut, options);
			},
			exec: async (_command: string, args: string[]) => {
				if (args[0] === "display-message") {
					return { stdout: "$1\t@1\t%1\n", stderr: "", code: 0, killed: false };
				}
				if (args[0] === "list-panes" && args.includes("-a")) {
					const stdout =
						childPaneIds.length > 0
							? `$1\t${childPaneIds[0]}\t0\tproject-session\tnested-child\tqueued branch\n`
							: "$1\t%1\t0\tmain-session\tproject-session\tproject\n";
					return { stdout, stderr: "", code: 0, killed: false };
				}
				if (args[0] === "list-panes") {
					const branchPanes = childPaneIds
						.map((paneId, index) => `${paneId}\t100\t${index * 10}\tproject-session`)
						.join("\n");
					return {
						stdout: `%1\t0\t0\t${branchPanes ? `\n${branchPanes}` : ""}\n`,
						stderr: "",
						code: 0,
						killed: false,
					};
				}
				if (args[0] === "split-window") {
					splitCalls += 1;
					const paneId = `%${splitCalls + 1}`;
					childPaneIds.push(paneId);
					return { stdout: `${paneId}\n`, stderr: "", code: 0, killed: false };
				}
				return { stdout: "", stderr: "", code: 0, killed: false };
			},
			getThinkingLevel: () => "off",
			appendEntry: (customType: string, data: unknown) => sessionManager.appendCustomEntry(customType, data),
		} as unknown as ExtensionAPI;
		sessionBranchesExtension(fakePi);
		assert.deepEqual([...tools.keys()].sort(), ["branch", "merge_branch"]);
		assert.deepEqual([...shortcuts.keys()].sort(), ["ctrl+n", "ctrl+shift+m", "ctrl+shift+n"]);

		const context = {
			ui: {
				notify: (message: string) => notifications.push(message),
				custom: async () => "dialog branch",
			},
			hasUI: true,
			mode: "tui",
			cwd: directory,
			sessionManager,
			modelRegistry: {},
			model: undefined,
			isIdle: () => idle,
			signal: undefined,
			abort: () => undefined,
			hasPendingMessages: () => false,
			shutdown: () => undefined,
			getContextUsage: () => undefined,
			compact: () => undefined,
			getSystemPrompt: () => "",
			waitForIdle: async () => undefined,
		} as unknown as ExtensionCommandContext;

		for (const handler of handlers.get("session_start") ?? []) await handler({}, context);
		assert.equal(JSON.parse(await readFile(registryPathForSession("project-session"), "utf8")).pid, process.pid);
		for (const handler of handlers.get("before_agent_start") ?? []) await handler({}, context);
		sessionManager.appendMessage({ role: "user", content: "current request", timestamp: Date.now() });
		const completedTurn = assistantEntry("completed-turn", "current-request", "completed current turn");
		if (completedTurn.type !== "message" || completedTurn.message.role !== "assistant") {
			throw new Error("Expected an assistant message entry");
		}
		sessionManager.appendMessage(completedTurn.message);
		for (const handler of handlers.get("turn_end") ?? []) await handler({}, context);
		sessionManager.appendMessage({ role: "user", content: "active partial request", timestamp: Date.now() });
		idle = false;
		await commands.get("branch")!.handler('--with-context --name "queued branch"', context);
		assert.equal(splitCalls, 1);
		assert.ok(
			notifications.some((message) => message.includes("Created queued branch")),
			`notifications: ${notifications.join(" | ")}`,
		);

		await shortcuts.get("ctrl+n")!.handler(context);
		assert.equal(splitCalls, 2);
		assert.ok(notifications.some((message) => message.includes("Created dialog branch")));

		const worktreeDirectory = join(directory, "worktree-x");
		await mkdir(worktreeDirectory);
		const toolResult = await tools.get("branch")!.execute(
			"branch-tool-call",
			{
				tasks: [
					{ name: "research x", prompt: "Research x", cwd: worktreeDirectory },
					{ name: "research y", prompt: "Research y" },
					{ name: "research z", prompt: "Research z" },
				],
			},
			undefined,
			undefined,
			context,
		);
		assert.equal(splitCalls, 5);
		assert.match(toolResult.content[0].text, /Created 3 branches: research x.*research y.*research z/);
		const createdEntries = sessionManager
			.getEntries()
			.filter((entry) => entry.type === "custom" && entry.customType === "session-branches/created");
		assert.equal(createdEntries.length, 5);
		const dialogBranchEntry = createdEntries[1];
		assert.ok(dialogBranchEntry?.type === "custom");
		assert.equal(
			SessionManager.open((dialogBranchEntry.data as { branchSessionFile: string }).branchSessionFile).getSessionName(),
			"dialog branch",
		);
		const toolBranchSessions = createdEntries.slice(2).map((entry) => {
			if (entry.type !== "custom") throw new Error("Expected branch creation metadata");
			return SessionManager.open((entry.data as { branchSessionFile: string }).branchSessionFile);
		});
		assert.equal(toolBranchSessions[0].getHeader()?.cwd, worktreeDirectory);
		for (const branchSession of toolBranchSessions) {
			const metadata = findBranchMetadata(branchSession.getEntries())?.metadata;
			assert.equal(metadata?.fresh, true);
			assert.equal(metadata?.launchMode, "pane");
		}

		const createdEntry = sessionManager
			.getEntries()
			.find((entry) => entry.type === "custom" && entry.customType === "session-branches/created");
		assert.ok(createdEntry?.type === "custom");
		const branchFile = (createdEntry.data as { branchSessionFile: string }).branchSessionFile;
		const branchSession = SessionManager.open(branchFile);
		assert.equal(branchSession.getHeader()?.parentSession, parentFile);
		const nestedMetadata = findBranchMetadata(branchSession.getEntries())?.metadata;
		assert.equal(nestedMetadata?.parentSessionId, "project-session");
		assert.equal(nestedMetadata?.parentSessionFile, parentFile);
		assert.equal(nestedMetadata?.depth, 2);
		assert.equal(nestedMetadata?.windowDepth, 1);
		assert.equal(nestedMetadata?.windowRootSessionId, "project-session");
		const branchTexts = branchSession
			.getEntries()
			.filter((entry) => entry.type === "message")
			.map((entry) => {
				if (entry.type !== "message" || !("content" in entry.message)) return "";
				return JSON.stringify(entry.message.content);
			});
		assert.ok(branchTexts.some((text) => text.includes("completed request")));
		assert.ok(branchTexts.some((text) => text.includes("completed response")));
		assert.ok(branchTexts.some((text) => text.includes("current request")));
		assert.ok(branchTexts.some((text) => text.includes("completed current turn")));
		assert.ok(branchTexts.every((text) => !text.includes("active partial request")));

		idle = true;
		await commands.get("discard")!.handler("", context);
		assert.ok(notifications.some((message) => message.includes("Close or merge child branches first")));

		for (const handler of handlers.get("session_shutdown") ?? []) await handler({}, context);
	} finally {
		if (previousRuntimeDirectory === undefined) delete process.env.PI_SESSION_BRANCH_RUNTIME_DIR;
		else process.env.PI_SESSION_BRANCH_RUNTIME_DIR = previousRuntimeDirectory;
		if (previousTmux === undefined) delete process.env.TMUX;
		else process.env.TMUX = previousTmux;
		if (previousTmuxPane === undefined) delete process.env.TMUX_PANE;
		else process.env.TMUX_PANE = previousTmuxPane;
		await rm(directory, { recursive: true, force: true });
		await rm(runtimeDirectory, { recursive: true, force: true });
	}
});

test("active child discovery spans panes and windows", async () => {
	const exec: ExecCommand = async () => ({
		stdout: [
			"$1\t%2\t0\tparent-session\tchild-one\tchild one",
			"$1\t%3\t0\tother-parent\tother-child\tother child",
			"$1\t%4\t1\tparent-session\tdead-child\tdead child",
			"$2\t%5\t0\tparent-session\tother-tmux-session\tother tmux session",
		].join("\n"),
		stderr: "",
		code: 0,
		killed: false,
	});
	assert.deepEqual(await listActiveChildBranches(exec, "parent-session"), [
		{ paneId: "%2", branchSessionId: "child-one", branchName: "child one" },
		{ paneId: "%5", branchSessionId: "other-tmux-session", branchName: "other tmux session" },
	]);
});

test("branch pane placement survives extension reloads", async () => {
	const exec: ExecCommand = async (_command, args) => {
		assert.equal(args[0], "display-message");
		return {
			stdout: "branch-session\t0\tbranch-session\n",
			stderr: "",
			code: 0,
			killed: false,
		};
	};
	assert.deepEqual(await readPaneBranchPlacement(exec, "%2", "branch-session"), {
		windowDepth: 0,
		windowRootSessionId: "branch-session",
	});
	assert.equal(await readPaneBranchPlacement(exec, "%2", "other-session"), undefined);
});

test("detach moves a branch pane into a new window and rejects single-pane windows", async () => {
	const calls: Array<{ command: string; args: string[] }> = [];
	let panes = "%1\t0\t0\t\n%2\t80\t0\tparent-session\n";
	const exec: ExecCommand = async (command, args) => {
		calls.push({ command, args });
		if (args[0] === "list-panes") return { stdout: panes, stderr: "", code: 0, killed: false };
		if (args[0] === "break-pane") return { stdout: "@9\t%2\n", stderr: "", code: 0, killed: false };
		return { stdout: "", stderr: "", code: 0, killed: false };
	};

	assert.deepEqual(
		await detachPaneToWindow(
			exec,
			{ sessionId: "$1", windowId: "@1", paneId: "%2" },
			"branch-auth-review",
		),
		{ windowId: "@9", paneId: "%2" },
	);
	const detach = calls.find((call) => call.args[0] === "break-pane");
	assert.ok(detach);
	assert.deepEqual(detach.args.slice(0, 8), [
		"break-pane",
		"-s",
		"%2",
		"-t",
		"$1:",
		"-n",
		"branch-auth-review",
		"-P",
	]);

	panes = "%2\t0\t0\tparent-session\n";
	await assert.rejects(
		detachPaneToWindow(
			exec,
			{ sessionId: "$1", windowId: "@9", paneId: "%2" },
			"branch-auth-review",
		),
		/already the only pane/,
	);
});

test("same-window launch stacks new managed branches above the current top branch", async () => {
	const calls: Array<{ command: string; args: string[] }> = [];
	let listOutput = "%1\t0\t0\t\n%2\t80\t0\tparent-session\n";
	const exec: ExecCommand = async (command, args) => {
		calls.push({ command, args });
		if (args[0] === "list-panes") return { stdout: listOutput, stderr: "", code: 0, killed: false };
		if (args[0] === "split-window") return { stdout: "%3\n", stderr: "", code: 0, killed: false };
		return { stdout: "", stderr: "", code: 0, killed: false };
	};

	const launched = await launchBranch({
		exec,
		tmux: { sessionId: "$1", windowId: "@1", paneId: "%1" },
		parentSessionId: "parent-session",
		branchSessionId: "branch-session",
		branchSessionFile: "/tmp/branch.jsonl",
		branchName: "parent-branch-2",
		depth: 1,
		windowDepth: 1,
		windowRootSessionId: "parent-session",
		cwd: "/repo",
		newWindow: false,
		windowName: "branch-parent-2",
		createdAt: "2026-07-31T12:00:00.000Z",
	});
	assert.deepEqual(launched, { paneId: "%3", launchMode: "pane" });
	const split = calls.find((call) => call.args[0] === "split-window");
	assert.ok(split);
	assert.deepEqual(split.args.slice(0, 6), ["split-window", "-v", "-b", "-t", "%2", "-P"]);
	assert.equal(calls.filter((call) => call.args[0] === "set-option").length, 7);

	listOutput = "%1\t0\t0\t\n%9\t80\t0\tother-session\n";
	await assert.rejects(
		launchBranch({
			exec,
			tmux: { sessionId: "$1", windowId: "@1", paneId: "%1" },
			parentSessionId: "parent-session",
			branchSessionId: "another-branch",
			branchSessionFile: "/tmp/another.jsonl",
			branchName: "another",
			depth: 1,
			windowDepth: 1,
			windowRootSessionId: "parent-session",
			cwd: "/repo",
			newWindow: false,
			windowName: "branch-another",
			createdAt: "2026-07-31T12:00:00.000Z",
		}),
		/unmanaged panes/,
	);
});
