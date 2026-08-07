import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
	BorderedLoader,
	generateBranchSummary,
	type BranchSummaryResult,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type ExtensionContext,
	type SessionEntry,
} from "@earendil-works/pi-coding-agent";
import {
	BRANCH_CREATED_TYPE,
	BRANCH_MERGE_MESSAGE_TYPE,
	BRANCH_PROTOCOL_VERSION,
	buildBranchSession,
	childBranchPlacement,
	countCreatedBranches,
	defaultBranchName,
	detachedBranchMetadata,
	entriesAfterBranchPoint,
	findBranchMetadata,
	mergeMessageContent,
	normalizeBranchMetadata,
	normalizeBranchName,
	parentMovedSinceFork,
	parseBranchCommandArgs,
	serializeSessionEntries,
	slugifyBranchName,
	type BranchCommandOptions,
	type BranchCreatedMetadata,
	type BranchMergeDetails,
	type BranchMetadata,
} from "./core.ts";
import {
	checkParentReady,
	requestParentMerge,
	startParentRuntime,
	type MergePayload,
	type ParentRuntime,
} from "./ipc.ts";
import {
	detachPaneToWindow,
	getTmuxContext,
	launchBranch,
	listActiveChildBranches,
	readPaneBranchPlacement,
	syncCurrentPaneBranchMetadata,
	type ExecCommand,
	type TmuxContext,
} from "./tmux.ts";

const BRANCH_HELP = [
	"Usage: /branch [--fresh] [--new-window] [--name \"topic\"] [--prompt \"task\"]",
	"You can also provide the prompt as positional text after the options.",
].join("\n");

const MERGE_SUMMARY_INSTRUCTIONS = `Create a concise, self-contained handoff for merging this parallel Pi branch into its parent session.

Use this structure:

## Branch Goal
[What this branch was asked to explore or accomplish]

## Outcome
[The result and current state]

## Changes & Evidence
- [Important implementation changes, findings, commands, links, and exact file paths]

## Validation
- [Checks run and their results, or "Not run"]

## Decisions
- **[Decision]**: [Rationale]

## Open Work
- [Remaining work, blockers, or "None"]

Only summarize work represented in the supplied branch transcript. Preserve exact identifiers, paths, errors, and externally visible side effects. Be compact but include everything the parent needs to continue without reopening the branch.`;

function notifyError(ctx: ExtensionContext, error: unknown): void {
	ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
}

function branchMetadataForSession(ctx: ExtensionContext): { entryId: string; metadata: BranchMetadata } | undefined {
	return findBranchMetadata(ctx.sessionManager.getEntries());
}

function activeBranchMetadata(ctx: ExtensionContext): { entryId: string; metadata: BranchMetadata } | undefined {
	const sessionBranch = branchMetadataForSession(ctx);
	if (!sessionBranch) return undefined;
	return ctx.sessionManager.getBranch().some((entry) => entry.id === sessionBranch.entryId) ? sessionBranch : undefined;
}

function hasMergeableContent(entries: SessionEntry[]): boolean {
	return entries.some(
		(entry) =>
			entry.type === "message" ||
			entry.type === "custom_message" ||
			entry.type === "compaction" ||
			entry.type === "branch_summary",
	);
}

function mergeAlreadyReceived(ctx: ExtensionContext, branchSessionId: string): boolean {
	return ctx.sessionManager.getEntries().some((entry) => {
		if (entry.type !== "custom_message" || entry.customType !== BRANCH_MERGE_MESSAGE_TYPE) return false;
		const details = entry.details as Partial<BranchMergeDetails> | undefined;
		return details?.branchSessionId === branchSessionId;
	});
}

async function summarizeBranch(
	entries: SessionEntry[],
	ctx: ExtensionCommandContext,
): Promise<BranchSummaryResult | undefined> {
	if (!ctx.model) throw new Error("No model is selected for branch summarization");
	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
	if (!auth.ok) throw new Error(auth.error);
	if (!auth.apiKey) throw new Error(`No API key is available for ${ctx.model.provider}/${ctx.model.id}`);
	const apiKey = auth.apiKey;

	const controller = new AbortController();
	const result = await ctx.ui.custom<BranchSummaryResult | undefined>((tui, theme, _keybindings, done) => {
		const loader = new BorderedLoader(tui, theme, "Summarizing branch for merge...");
		let completed = false;
		const finish = (value: BranchSummaryResult | undefined): void => {
			if (completed) return;
			completed = true;
			done(value);
		};
		loader.onAbort = () => {
			controller.abort();
			finish(undefined);
		};
		void generateBranchSummary(entries, {
			model: ctx.model!,
			apiKey,
			headers: auth.headers,
			signal: controller.signal,
			customInstructions: MERGE_SUMMARY_INSTRUCTIONS,
			replaceInstructions: true,
		})
			.then(finish)
			.catch((error) => finish({ error: error instanceof Error ? error.message : String(error) }));
		return loader;
	});
	return result;
}

interface BranchBase {
	sessionId: string;
	entries: SessionEntry[];
	leafId: string | null;
}

interface PendingBranch {
	options: BranchCommandOptions;
	base: BranchBase;
}

function sessionFilePath(sessionDir: string, createdAt: string, sessionId: string): string {
	return join(sessionDir, `${createdAt.replace(/[:.]/g, "-")}_${sessionId}.jsonl`);
}

function captureBranchBase(ctx: ExtensionContext): BranchBase {
	return {
		sessionId: ctx.sessionManager.getSessionId(),
		// Session entries are append-only; retaining this path array is enough to freeze the fork point.
		entries: ctx.sessionManager.getBranch(),
		leafId: ctx.sessionManager.getLeafId(),
	};
}

async function removeBranchFile(path: string): Promise<void> {
	try {
		await unlink(path);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
}

export default function sessionBranchesExtension(pi: ExtensionAPI) {
	let activeContext: ExtensionContext | undefined;
	let parentRuntime: ParentRuntime | undefined;
	let tmuxContext: TmuxContext | undefined;
	let activeRunBase: BranchBase | undefined;
	let effectiveBranchMetadata: BranchMetadata | undefined;
	let pendingFlush: Promise<void> | undefined;
	const pendingBranches: PendingBranch[] = [];

	const exec: ExecCommand = (command, args, options) => pi.exec(command, args, options);

	const currentBranchMetadata = (
		ctx: ExtensionContext,
	): { entryId: string; metadata: BranchMetadata } | undefined => {
		const branch = branchMetadataForSession(ctx);
		if (!branch || effectiveBranchMetadata?.branchSessionId !== branch.metadata.branchSessionId) return branch;
		return { entryId: branch.entryId, metadata: effectiveBranchMetadata };
	};

	const createBranch = async (ctx: ExtensionContext, commandOptions: BranchCommandOptions, base: BranchBase) => {
		if (!ctx.hasUI) throw new Error("/branch requires interactive Pi mode");
		if (!parentRuntime || !tmuxContext) throw new Error("/branch requires an active parent runtime inside tmux");
		if (ctx.sessionManager.getSessionId() !== base.sessionId) {
			throw new Error("The parent Pi session changed before the queued branch could start");
		}

		const parentSessionFile = ctx.sessionManager.getSessionFile();
		if (!parentSessionFile) throw new Error("/branch requires a persisted Pi session");
		const branchNumber = countCreatedBranches(ctx.sessionManager.getEntries()) + 1;
		const branchName = commandOptions.name
			? normalizeBranchName(commandOptions.name)
			: defaultBranchName(ctx.sessionManager.getSessionName(), ctx.sessionManager.getSessionId(), branchNumber);
		const branchSessionId = randomUUID();
		const placement = childBranchPlacement({
			parentSessionId: ctx.sessionManager.getSessionId(),
			parentMetadata: currentBranchMetadata(ctx)?.metadata,
			branchSessionId,
			newWindow: commandOptions.newWindow,
		});
		const createdAt = new Date().toISOString();
		const branchSessionFile = sessionFilePath(dirname(parentSessionFile), createdAt, branchSessionId);
		const launchMode = commandOptions.newWindow ? "window" : "pane";
		const built = buildBranchSession({
			parentEntries: base.entries,
			parentSessionId: ctx.sessionManager.getSessionId(),
			parentSessionFile: resolve(parentSessionFile),
			cwd: ctx.cwd,
			forkEntryId: base.leafId,
			branchSessionId,
			branchSessionFile,
			branchName,
			branchNumber,
			depth: placement.depth,
			windowDepth: placement.windowDepth,
			windowRootSessionId: placement.windowRootSessionId,
			parentPaneId: tmuxContext.paneId,
			parentWindowId: tmuxContext.windowId,
			fresh: commandOptions.fresh,
			launchMode,
			createdAt,
		});

		await mkdir(dirname(branchSessionFile), { recursive: true });
		await writeFile(branchSessionFile, serializeSessionEntries(built.entries), { flag: "wx", mode: 0o600 });
		let launched;
		try {
			launched = await launchBranch({
				exec,
				tmux: tmuxContext,
				parentSessionId: ctx.sessionManager.getSessionId(),
				branchSessionId,
				branchSessionFile,
				branchName,
				depth: placement.depth,
				windowDepth: placement.windowDepth,
				windowRootSessionId: placement.windowRootSessionId,
				cwd: ctx.cwd,
				prompt: commandOptions.prompt,
				model: ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined,
				thinkingLevel: pi.getThinkingLevel(),
				newWindow: commandOptions.newWindow,
				windowName: `branch-${slugifyBranchName(branchName)}`,
				createdAt,
			});
		} catch (error) {
			await removeBranchFile(branchSessionFile);
			throw error;
		}

		const created: BranchCreatedMetadata = {
			version: BRANCH_PROTOCOL_VERSION,
			depth: placement.depth,
			windowDepth: placement.windowDepth,
			windowRootSessionId: placement.windowRootSessionId,
			branchSessionId,
			branchSessionFile,
			branchName,
			branchNumber,
			forkEntryId: base.leafId,
			paneId: launched.paneId,
			launchMode: launched.launchMode,
			createdAt,
		};
		pi.appendEntry(BRANCH_CREATED_TYPE, created);
		ctx.ui.notify(
			`Created ${branchName} in tmux ${launched.launchMode} ${launched.paneId}${commandOptions.fresh ? " with fresh context" : ""}`,
			"info",
		);
	};

	const flushPendingBranches = async (ctx: ExtensionContext): Promise<void> => {
		while (pendingBranches.length > 0 || pendingFlush) {
			if (pendingFlush) {
				await pendingFlush;
				continue;
			}
			const pending = pendingBranches.shift();
			if (!pending) return;
			pendingFlush = createBranch(ctx, pending.options, pending.base).catch((error) => notifyError(ctx, error));
			try {
				await pendingFlush;
			} finally {
				pendingFlush = undefined;
			}
		}
	};

	const assertNoActiveChildren = async (ctx: ExtensionContext): Promise<void> => {
		if (!tmuxContext) throw new Error("Cannot inspect child branches outside the active tmux runtime");
		const children = await listActiveChildBranches(exec, ctx.sessionManager.getSessionId());
		if (children.length === 0) return;
		throw new Error(
			`Close or merge child branches first: ${children.map((child) => `${child.branchName} (${child.paneId})`).join(", ")}`,
		);
	};

	pi.on("session_start", async (_event, ctx) => {
		activeContext = ctx;
		parentRuntime = undefined;
		tmuxContext = undefined;
		activeRunBase = undefined;
		effectiveBranchMetadata = undefined;
		pendingFlush = undefined;
		pendingBranches.length = 0;

		let branch;
		try {
			branch = branchMetadataForSession(ctx);
		} catch (error) {
			notifyError(ctx, error);
			return;
		}
		if (!process.env.TMUX || !process.env.TMUX_PANE) return;

		const sessionFile = ctx.sessionManager.getSessionFile();
		if (!sessionFile) return;
		try {
			tmuxContext = await getTmuxContext(exec, process.env.TMUX_PANE);
			if (branch) {
				effectiveBranchMetadata = branch.metadata;
				const panePlacement = await readPaneBranchPlacement(
					exec,
					tmuxContext.paneId,
					branch.metadata.branchSessionId,
				);
				if (panePlacement) {
					effectiveBranchMetadata = {
						...branch.metadata,
						...panePlacement,
						launchMode: panePlacement.windowDepth === 0 ? "window" : "pane",
					};
				}
			}
			await syncCurrentPaneBranchMetadata(
				exec,
				tmuxContext.paneId,
				ctx.sessionManager.getSessionId(),
				ctx.sessionManager.getSessionName(),
				effectiveBranchMetadata,
			);
			const validateParent = (
				value: BranchMetadata,
			): { context: ExtensionContext; metadata: BranchMetadata; parentMoved: boolean } => {
				const current = activeContext;
				if (!current) throw new Error("The parent Pi session is shutting down");
				if (!current.isIdle()) throw new Error("The parent Pi session is busy; retry /merge when it is idle");
				const metadata = normalizeBranchMetadata(value);
				if (
					!metadata ||
					metadata.parentSessionId !== current.sessionManager.getSessionId() ||
					resolve(metadata.parentSessionFile) !== resolve(sessionFile)
				) {
					throw new Error("Branch metadata does not match the active parent session");
				}
				if (mergeAlreadyReceived(current, metadata.branchSessionId)) {
					throw new Error(`Branch ${metadata.branchName} has already been merged`);
				}
				return {
					context: current,
					metadata,
					parentMoved: parentMovedSinceFork(current.sessionManager.getBranch(), metadata.forkEntryId),
				};
			};
			parentRuntime = await startParentRuntime({
				sessionId: ctx.sessionManager.getSessionId(),
				sessionFile,
				paneId: tmuxContext.paneId,
				onCheck: (metadata) => {
					validateParent(metadata);
				},
				onMerge: async (payload: MergePayload) => {
					const { context: current, metadata, parentMoved } = validateParent(payload.metadata);
					if (
						metadata.branchSessionId !== payload.details.branchSessionId ||
						metadata.branchSessionFile !== payload.details.branchSessionFile ||
						(metadata.version === BRANCH_PROTOCOL_VERSION &&
							(metadata.depth !== payload.details.depth ||
								metadata.windowDepth !== payload.details.windowDepth))
					) {
						throw new Error("Merge details do not match the branch metadata");
					}
					if (!payload.summary.trim()) throw new Error("The branch merge summary is empty");

					const details: BranchMergeDetails = {
						...payload.details,
						version: BRANCH_PROTOCOL_VERSION,
						depth: metadata.depth,
						windowDepth: metadata.windowDepth,
					};
					pi.sendMessage<BranchMergeDetails>({
						customType: BRANCH_MERGE_MESSAGE_TYPE,
						content: mergeMessageContent(metadata.branchName, payload.summary),
						display: true,
						details,
					});
					if (parentMoved) {
						current.ui.notify(
							`The parent moved to a different /tree path after ${metadata.branchName} forked; merged into the current path`,
							"warning",
						);
					}
				},
			});
		} catch (error) {
			tmuxContext = undefined;
			parentRuntime = undefined;
			notifyError(ctx, `Session branching is unavailable: ${error instanceof Error ? error.message : String(error)}`);
		}
	});

	pi.on("session_shutdown", async () => {
		activeContext = undefined;
		activeRunBase = undefined;
		effectiveBranchMetadata = undefined;
		pendingBranches.length = 0;
		const runtime = parentRuntime;
		parentRuntime = undefined;
		tmuxContext = undefined;
		if (runtime) await runtime.stop();
	});

	pi.on("before_agent_start", (_event, ctx) => {
		activeRunBase = captureBranchBase(ctx);
	});

	pi.on("tool_execution_end", async (_event, ctx) => {
		if (pendingBranches.length > 0) await flushPendingBranches(ctx);
	});

	pi.on("agent_end", async (_event, ctx) => {
		if (pendingBranches.length > 0) await flushPendingBranches(ctx);
	});

	pi.on("session_before_fork", (_event, ctx) => {
		if (!branchMetadataForSession(ctx)) return;
		ctx.ui.notify("Use /branch for nested branches so parent and merge metadata are preserved", "error");
		return { cancel: true };
	});

	pi.on("session_before_tree", (event, ctx) => {
		const branch = branchMetadataForSession(ctx);
		if (!branch) return;
		const targetPath = ctx.sessionManager.getBranch(event.preparation.targetId);
		if (targetPath.some((entry) => entry.id === branch.entryId)) return;
		ctx.ui.notify("A parallel branch cannot navigate behind its fork marker", "error");
		return { cancel: true };
	});

	pi.registerCommand("branch", {
		description: "Fork the current Pi session into a parallel tmux pane or window",
		getArgumentCompletions: (prefix) => {
			const option = prefix.split(/\s+/).at(-1) ?? "";
			if (!option.startsWith("-")) return null;
			const values = ["--fresh", "--new-window", "--name", "--prompt", "--help"];
			const matches = values.filter((value) => value.startsWith(option));
			return matches.length > 0 ? matches.map((value) => ({ value, label: value })) : null;
		},
		handler: async (args, ctx) => {
			try {
				if (!ctx.hasUI) throw new Error("/branch requires interactive Pi mode");
				if (!parentRuntime || !tmuxContext) throw new Error("/branch requires an active parent runtime inside tmux");

				const commandOptions = parseBranchCommandArgs(args);
				if (commandOptions.help) {
					ctx.ui.notify(BRANCH_HELP, "info");
					return;
				}
				childBranchPlacement({
					parentSessionId: ctx.sessionManager.getSessionId(),
					parentMetadata: currentBranchMetadata(ctx)?.metadata,
					branchSessionId: "pending",
					newWindow: commandOptions.newWindow,
				});

				if (ctx.isIdle()) {
					await createBranch(ctx, commandOptions, captureBranchBase(ctx));
					return;
				}
				if (!activeRunBase || activeRunBase.sessionId !== ctx.sessionManager.getSessionId()) {
					throw new Error("Cannot identify the last completed turn for the active agent run");
				}
				pendingBranches.push({ options: commandOptions, base: activeRunBase });
				ctx.ui.notify("Branch queued after the next tool call from the last completed turn", "info");
			} catch (error) {
				notifyError(ctx, error);
			}
		},
	});

	pi.registerCommand("detach", {
		description: "Move this branch pane into its own tmux window",
		handler: async (_args, ctx) => {
			try {
				await ctx.waitForIdle();
				if (!ctx.hasUI || !process.env.TMUX || !process.env.TMUX_PANE || !tmuxContext) {
					throw new Error("/detach requires an interactive branch running inside tmux");
				}
				const branch = currentBranchMetadata(ctx);
				if (!branch) throw new Error("/detach is only available in a session created by /branch");
				if (!activeBranchMetadata(ctx)) throw new Error("The active branch no longer contains its fork marker");
				await assertNoActiveChildren(ctx);

				const detached = await detachPaneToWindow(
					exec,
					tmuxContext,
					`branch-${slugifyBranchName(branch.metadata.branchName)}`,
				);
				const metadata = detachedBranchMetadata(branch.metadata);
				tmuxContext = {
					...tmuxContext,
					windowId: detached.windowId,
					paneId: detached.paneId,
				};
				effectiveBranchMetadata = metadata;
				await syncCurrentPaneBranchMetadata(
					exec,
					detached.paneId,
					ctx.sessionManager.getSessionId(),
					ctx.sessionManager.getSessionName(),
					metadata,
				);
				ctx.ui.notify(
					`Detached ${branch.metadata.branchName} into tmux window ${detached.windowId}`,
					"info",
				);
			} catch (error) {
				notifyError(ctx, error);
			}
		},
	});

	pi.registerCommand("merge", {
		description: "Summarize this parallel branch into its active parent session, then close it",
		handler: async (_args, ctx) => {
			try {
				await ctx.waitForIdle();
				if (!ctx.hasUI || !process.env.TMUX || !process.env.TMUX_PANE) {
					throw new Error("/merge requires an interactive branch running inside tmux");
				}
				const branch = currentBranchMetadata(ctx);
				if (!branch) throw new Error("/merge is only available in a session created by /branch");
				if (!activeBranchMetadata(ctx)) throw new Error("The active branch no longer contains its fork marker");
				await assertNoActiveChildren(ctx);
				const branchEntries = entriesAfterBranchPoint(ctx.sessionManager.getBranch(), branch.entryId);
				if (!hasMergeableContent(branchEntries)) throw new Error("This branch has no conversation to merge");
				await checkParentReady(branch.metadata);

				const summaryResult = await summarizeBranch(branchEntries, ctx);
				if (!summaryResult) {
					ctx.ui.notify("Branch merge cancelled", "info");
					return;
				}
				if (summaryResult.aborted) {
					ctx.ui.notify("Branch merge cancelled", "info");
					return;
				}
				if (summaryResult.error) throw new Error(`Branch summarization failed: ${summaryResult.error}`);
				if (!summaryResult.summary) throw new Error("Branch summarization returned no summary");

				const details: BranchMergeDetails = {
					version: BRANCH_PROTOCOL_VERSION,
					depth: branch.metadata.depth,
					windowDepth: branch.metadata.windowDepth,
					branchSessionId: branch.metadata.branchSessionId,
					branchSessionFile: branch.metadata.branchSessionFile,
					branchName: branch.metadata.branchName,
					branchNumber: branch.metadata.branchNumber,
					forkEntryId: branch.metadata.forkEntryId,
					fresh: branch.metadata.fresh,
					mergedAt: new Date().toISOString(),
					readFiles: summaryResult.readFiles ?? [],
					modifiedFiles: summaryResult.modifiedFiles ?? [],
				};
				await requestParentMerge(branch.metadata, {
					metadata: branch.metadata,
					summary: summaryResult.summary,
					details,
				});
				ctx.ui.notify(`Merged ${branch.metadata.branchName} into its parent session`, "info");
				ctx.shutdown();
			} catch (error) {
				notifyError(ctx, error);
			}
		},
	});

	pi.registerCommand("discard", {
		description: "Close this parallel branch without merging it; the session file is retained",
		handler: async (_args, ctx) => {
			try {
				await ctx.waitForIdle();
				if (!ctx.hasUI || !process.env.TMUX || !process.env.TMUX_PANE) {
					throw new Error("/discard requires an interactive branch running inside tmux");
				}
				const branch = currentBranchMetadata(ctx);
				if (!branch) throw new Error("/discard is only available in a session created by /branch");
				await assertNoActiveChildren(ctx);
				const confirmed = await ctx.ui.confirm(
					"Discard branch?",
					`Close ${branch.metadata.branchName} without merging? Its Pi session file will be retained.`,
				);
				if (!confirmed) return;
				ctx.ui.notify(`Closed ${branch.metadata.branchName} without merging`, "info");
				ctx.shutdown();
			} catch (error) {
				notifyError(ctx, error);
			}
		},
	});
}
