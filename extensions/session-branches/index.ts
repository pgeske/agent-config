import { randomUUID } from "node:crypto";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
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
import { Type } from "typebox";
import { BranchNameDialog } from "./branch-name-dialog.ts";
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
	"Usage: /branch [--with-context] [--new-window] [--name \"topic\"] [--cwd \"path\"] [--prompt \"task\"] [--model \"provider/model\"] [--thinking \"level\"]",
	"Branches start fresh in the current working directory by default.",
	"Omit --name to enter the session name in a centered dialog.",
	"Use --with-context to inherit the parent conversation or --cwd to launch in another existing directory.",
	"Use --model or --thinking to override the child Pi model or thinking level; omit them to inherit the parent's.",
	"You can also provide the prompt as positional text after the options.",
].join("\n");

const BranchTaskSchema = Type.Object({
	name: Type.String({ description: "Concise, descriptive Pi session name", minLength: 1, maxLength: 80 }),
	prompt: Type.String({ description: "Self-contained task prompt for the branch", minLength: 1 }),
	cwd: Type.Optional(
		Type.String({ description: "Existing working directory for the branch, preferably a dedicated Git worktree" }),
	),
	withContext: Type.Optional(
		Type.Boolean({ description: "Inherit the parent conversation. Default: false (start fresh)." }),
	),
	newWindow: Type.Optional(
		Type.Boolean({ description: "Launch in a new tmux window. Default: false (same-window pane)." }),
	),
	model: Type.Optional(
		Type.String({
			description: "Override the child Pi model (e.g. \"provider/model\"). Omit to inherit the parent's model.",
		}),
	),
	thinkingLevel: Type.Optional(
		Type.String({
			description: "Override the child Pi thinking level. Omit to inherit the parent's thinking level.",
		}),
	),
});

const BranchToolParams = Type.Object({
	tasks: Type.Array(BranchTaskSchema, {
		description: "Independent tasks to launch as parallel Pi session branches",
		minItems: 1,
		maxItems: 8,
	}),
});

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
	ctx: ExtensionContext,
): Promise<BranchSummaryResult | undefined> {
	if (!ctx.model) throw new Error("No model is selected for branch summarization");
	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
	if (!auth.ok) throw new Error(auth.error);
	if (!auth.apiKey) throw new Error(`No API key is available for ${ctx.model.provider}/${ctx.model.id}`);
	const apiKey = auth.apiKey;
	const headers = Object.fromEntries(
		Object.entries(auth.headers ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
	);

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
			headers,
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

const PARENT_BUSY_PATTERN = "busy";
const MERGE_RETRY_INTERVAL_MS = 2_000;
const MERGE_MAX_RETRIES = 3;

// Merge delivery does not wait for the parent to become idle: pi steers custom
// messages into a busy run and persists them at the next message boundary.
// The busy-pattern retry still tolerates an older parent process that rejects
// merges while it is streaming.

// requestParentMergeWithRetry retries the merge delivery a few times in case the
// parent starts a new turn between the readiness check and the merge request.
async function requestParentMergeWithRetry(metadata: BranchMetadata, payload: MergePayload): Promise<void> {
	let lastError: Error | undefined;
	for (let attempt = 0; attempt <= MERGE_MAX_RETRIES; attempt += 1) {
		try {
			await requestParentMerge(metadata, payload);
			return;
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
			const message = lastError.message;
			if (!message.includes(PARENT_BUSY_PATTERN) || attempt === MERGE_MAX_RETRIES) throw lastError;
			await new Promise((r) => setTimeout(r, MERGE_RETRY_INTERVAL_MS));
		}
	}
	throw lastError ?? new Error("Merge failed");
}

interface BranchBase {
	sessionId: string;
	entries: SessionEntry[];
	leafId: string | null;
}

function sessionFilePath(sessionDir: string, createdAt: string, sessionId: string): string {
	return join(sessionDir, `${createdAt.replace(/[:.]/g, "-")}_${sessionId}.jsonl`);
}

function promptFilePath(sessionFile: string): string {
	return `${sessionFile}.prompt`;
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
	let latestSettledBase: BranchBase | undefined;
	let effectiveBranchMetadata: BranchMetadata | undefined;

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

		const branchCwd = commandOptions.cwd ? resolve(ctx.cwd, commandOptions.cwd) : ctx.cwd;
		let branchCwdStat;
		try {
			branchCwdStat = await stat(branchCwd);
		} catch {
			throw new Error(`Branch working directory does not exist: ${branchCwd}`);
		}
		if (!branchCwdStat.isDirectory()) throw new Error(`Branch working directory is not a directory: ${branchCwd}`);

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
			cwd: branchCwd,
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
		const branchPromptFile = commandOptions.prompt ? promptFilePath(branchSessionFile) : undefined;
		let launched;
		try {
			if (branchPromptFile) {
				await writeFile(branchPromptFile, `Branch task:\n${commandOptions.prompt}`, { flag: "wx", mode: 0o600 });
			}
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
				cwd: branchCwd,
				promptFile: branchPromptFile,
				model: commandOptions.model ?? (ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined),
				thinkingLevel: commandOptions.thinkingLevel ?? pi.getThinkingLevel(),
				newWindow: commandOptions.newWindow,
				windowName: slugifyBranchName(branchName),
				createdAt,
			});
		} catch (error) {
			await removeBranchFile(branchSessionFile);
			if (branchPromptFile) await removeBranchFile(branchPromptFile);
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
			`Created ${branchName} in tmux ${launched.launchMode} ${launched.paneId}${commandOptions.fresh ? "" : " with parent context"}`,
			"info",
		);
		return { branchName, cwd: branchCwd, paneId: launched.paneId, launchMode: launched.launchMode };
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
		latestSettledBase = captureBranchBase(ctx);
		effectiveBranchMetadata = undefined;

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
		latestSettledBase = undefined;
		effectiveBranchMetadata = undefined;
		const runtime = parentRuntime;
		parentRuntime = undefined;
		tmuxContext = undefined;
		if (runtime) await runtime.stop();
	});

	// A settled agent run is the complete user request -> final response boundary.
	// Ignore intermediate tool-loop turns so busy branches never start mid-run.
	pi.on("agent_settled", (_event, ctx) => {
		latestSettledBase = captureBranchBase(ctx);
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

	// Shared handler bodies so commands and shortcuts run the same logic.
	const branchCommand = async (args: string, ctx: ExtensionContext): Promise<void> => {
		try {
			if (!ctx.hasUI || ctx.mode !== "tui") throw new Error("/branch requires interactive Pi mode");
			if (!parentRuntime || !tmuxContext) throw new Error("/branch requires an active parent runtime inside tmux");

			let commandOptions = parseBranchCommandArgs(args);
			if (commandOptions.help) {
				ctx.ui.notify(BRANCH_HELP, "info");
				return;
			}
			if (!commandOptions.name) {
				const branchName = await ctx.ui.custom<string | undefined>(
					(tui, theme, keybindings, done) => {
						const dialog = new BranchNameDialog(theme, keybindings, done);
						return {
							get focused() {
								return dialog.focused;
							},
							set focused(value: boolean) {
								dialog.focused = value;
							},
							render: (width) => dialog.render(width),
							invalidate: () => dialog.invalidate(),
							handleInput: (data) => {
								dialog.handleInput(data);
								tui.requestRender();
							},
						};
					},
					{
						overlay: true,
						overlayOptions: { anchor: "center", width: 48, margin: 1 },
					},
				);
				if (!branchName) return;
				commandOptions = { ...commandOptions, name: normalizeBranchName(branchName) };
			}
			childBranchPlacement({
				parentSessionId: ctx.sessionManager.getSessionId(),
				parentMetadata: currentBranchMetadata(ctx)?.metadata,
				branchSessionId: "pending",
				newWindow: commandOptions.newWindow,
			});

			const base = ctx.isIdle() ? captureBranchBase(ctx) : latestSettledBase;
			if (!base || base.sessionId !== ctx.sessionManager.getSessionId()) {
				throw new Error("Cannot identify the latest settled response for the active agent run");
			}
			await createBranch(ctx, commandOptions, base);
		} catch (error) {
			notifyError(ctx, error);
		}
	};

	const performMerge = async (ctx: ExtensionContext): Promise<boolean> => {
		try {
			if (!ctx.hasUI || !process.env.TMUX || !process.env.TMUX_PANE) {
				throw new Error("/merge requires an interactive branch running inside tmux");
			}
			const branch = currentBranchMetadata(ctx);
			if (!branch) throw new Error("/merge is only available in a session created by /branch");
			if (!activeBranchMetadata(ctx)) throw new Error("The active branch no longer contains its fork marker");
			await assertNoActiveChildren(ctx);
			const branchEntries = entriesAfterBranchPoint(ctx.sessionManager.getBranch(), branch.entryId);
			if (!hasMergeableContent(branchEntries)) throw new Error("This branch has no conversation to merge");
			// Fail fast when the parent is gone or mismatched, but don't wait for it
			// to become idle: the parent queues the merge message while it streams.
			try {
				await checkParentReady(branch.metadata);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				if (!message.includes(PARENT_BUSY_PATTERN)) throw new Error(message);
			}

			const summaryResult = await summarizeBranch(branchEntries, ctx);
			if (!summaryResult) {
				ctx.ui.notify("Branch merge cancelled", "info");
				return false;
			}
			if (summaryResult.aborted) {
				ctx.ui.notify("Branch merge cancelled", "info");
				return false;
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
			await requestParentMergeWithRetry(branch.metadata, {
				metadata: branch.metadata,
				summary: summaryResult.summary,
				details,
			});
			ctx.ui.notify(`Merged ${branch.metadata.branchName} into its parent session`, "info");
			ctx.shutdown();
			return true;
		} catch (error) {
			notifyError(ctx, error);
			return false;
		}
	};

	const performDiscard = async (ctx: ExtensionContext): Promise<boolean> => {
		try {
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
			if (!confirmed) return false;
			ctx.ui.notify(`Closed ${branch.metadata.branchName} without merging`, "info");
			ctx.shutdown();
			return true;
		} catch (error) {
			notifyError(ctx, error);
			return false;
		}
	};

	pi.registerTool({
		name: "branch",
		label: "Branch",
		description:
			"Launch one or more independent tasks as interactive Pi session branches. Each task gets a named session and prompt. Branches start fresh in same-window tmux panes unless withContext or newWindow is explicitly set. Use cwd to isolate file-modifying work in an existing Git worktree.",
		promptSnippet: "Delegate one or more independent tasks to named parallel Pi session branches",
		promptGuidelines: [
			"Use branch when the user asks to delegate work to subagents or parallel agents.",
			"Pass all independent tasks in one branch call, give each task a concise name and self-contained prompt, and preserve the fresh same-window defaults unless the user requests otherwise.",
			"For file-modifying repository tasks, create separate Git worktrees before calling branch, then pass each worktree through that task's cwd.",
		],
		parameters: BranchToolParams,
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			if (signal?.aborted) throw new Error("Branch creation was cancelled");
			if (!ctx.hasUI) throw new Error("branch requires interactive Pi mode");
			if (!parentRuntime || !tmuxContext) throw new Error("branch requires an active parent runtime inside tmux");

			const base = ctx.isIdle() ? captureBranchBase(ctx) : latestSettledBase;
			if (!base || base.sessionId !== ctx.sessionManager.getSessionId()) {
				throw new Error("Cannot identify the latest settled response for the active agent run");
			}

			const launched = [];
			for (const task of params.tasks) {
				if (signal?.aborted) throw new Error("Branch creation was cancelled");
				const name = task.name.trim();
				const prompt = task.prompt.trim();
				if (!name) throw new Error("Every branch task requires a non-empty name");
				if (!prompt) throw new Error(`Branch ${name} requires a non-empty prompt`);
				const model = task.model?.trim();
				const thinkingLevel = task.thinkingLevel?.trim();
				if (model !== undefined && !model) throw new Error(`Branch ${name} model cannot be empty`);
				if (thinkingLevel !== undefined && !thinkingLevel) {
					throw new Error(`Branch ${name} thinkingLevel cannot be empty`);
				}
				launched.push(
					await createBranch(
						ctx,
						{
							fresh: !(task.withContext ?? false),
							newWindow: task.newWindow ?? false,
							name,
							prompt,
							cwd: task.cwd,
							model,
							thinkingLevel,
							help: false,
						},
						base,
					),
				);
			}

			return {
				content: [
					{
						type: "text",
						text: `Created ${launched.length} branch${launched.length === 1 ? "" : "es"}: ${launched.map((branch) => `${branch.branchName} (${branch.launchMode} ${branch.paneId}, ${branch.cwd})`).join(", ")}`,
					},
				],
				details: { branches: launched },
			};
		},
	});

	pi.registerTool({
		name: "merge_branch",
		label: "Merge Branch",
		description: "Summarize the completed work in a /branch-created session, deliver it to the parent session, and close the branch.",
		promptSnippet: "Merge a completed Pi session branch back into its parent",
		promptGuidelines: [
			"Use merge_branch after completing and validating a delegated task in a session created by branch.",
		],
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			const merged = await performMerge(ctx);
			return {
				content: [
					{
						type: "text",
						text: merged
							? "Merged this branch into its parent session and requested branch shutdown."
							: "The branch was not merged. Resolve the reported issue and retry merge_branch.",
					},
				],
				details: { merged },
				terminate: merged,
			};
		},
	});

	pi.registerCommand("branch", {
		description: "Start a fresh parallel Pi session in a tmux pane or window",
		getArgumentCompletions: (prefix) => {
			const option = prefix.split(/\s+/).at(-1) ?? "";
			if (!option.startsWith("-")) return null;
			const values = ["--with-context", "--new-window", "--name", "--cwd", "--prompt", "--model", "--thinking", "--help"];
			const matches = values.filter((value) => value.startsWith(option));
			return matches.length > 0 ? matches.map((value) => ({ value, label: value })) : null;
		},
		handler: (args, ctx) => branchCommand(args, ctx),
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
					slugifyBranchName(branch.metadata.branchName),
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
			await ctx.waitForIdle();
			await performMerge(ctx);
		},
	});

	pi.registerCommand("discard", {
		description: "Close this parallel branch without merging it; the session file is retained",
		handler: async (_args, ctx) => {
			await ctx.waitForIdle();
			await performDiscard(ctx);
		},
	});

	pi.registerShortcut("ctrl+n", {
		description: "Start a parallel branch in a new tmux window",
		handler: (ctx) => branchCommand("--new-window", ctx),
	});

	pi.registerShortcut("ctrl+shift+n", {
		description: "Start a parallel branch in the current tmux window",
		handler: (ctx) => branchCommand("", ctx),
	});

	pi.registerShortcut("ctrl+shift+m", {
		description: "Merge this branch into its parent session",
		handler: async (ctx) => {
			if (!ctx.isIdle()) {
				ctx.ui.notify("Wait for the current turn to finish before merging", "info");
				return;
			}
			const merged = await performMerge(ctx);
			// The shortcut context's shutdown() only sets a flag that is checked on the
			// next agent_settled event, which has already fired. Kill the pane
			// directly so the branch actually closes.
			if (merged && process.env.TMUX_PANE) {
				await exec("tmux", ["kill-pane", "-t", process.env.TMUX_PANE]);
			}
		},
	});

}
