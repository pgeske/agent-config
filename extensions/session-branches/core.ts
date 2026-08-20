import { randomBytes } from "node:crypto";
import {
	CURRENT_SESSION_VERSION,
	type FileEntry,
	type SessionEntry,
	type SessionHeader,
} from "@earendil-works/pi-coding-agent";

export const BRANCH_METADATA_TYPE = "session-branches/metadata";
export const BRANCH_CREATED_TYPE = "session-branches/created";
export const BRANCH_MERGE_MESSAGE_TYPE = "session-branches/merge";
export const BRANCH_PROTOCOL_VERSION = 2;
export const MAX_SAME_WINDOW_DEPTH = 1;

export interface BranchCommandOptions {
	fresh: boolean;
	newWindow: boolean;
	name?: string;
	prompt?: string;
	cwd?: string;
	help: boolean;
}

export interface BranchMetadata {
	version: number;
	/** Global distance from the original extension-managed parent session. */
	depth: number;
	/** Distance from the root Pi pane of the current tmux window. */
	windowDepth: number;
	windowRootSessionId: string;
	fresh: boolean;
	branchSessionId: string;
	branchSessionFile: string;
	branchName: string;
	branchNumber: number;
	parentSessionId: string;
	parentSessionFile: string;
	parentPaneId: string;
	parentWindowId: string;
	forkEntryId: string | null;
	launchMode: "pane" | "window";
	createdAt: string;
}

export interface BranchCreatedMetadata {
	version: number;
	depth: number;
	windowDepth: number;
	windowRootSessionId: string;
	branchSessionId: string;
	branchSessionFile: string;
	branchName: string;
	branchNumber: number;
	forkEntryId: string | null;
	paneId: string;
	launchMode: "pane" | "window";
	createdAt: string;
}

export interface BranchMergeDetails {
	version: number;
	depth: number;
	windowDepth: number;
	branchSessionId: string;
	branchSessionFile: string;
	branchName: string;
	branchNumber: number;
	forkEntryId: string | null;
	fresh: boolean;
	mergedAt: string;
	readFiles: string[];
	modifiedFiles: string[];
}

interface BuildBranchSessionOptions {
	parentEntries: SessionEntry[];
	parentSessionId: string;
	parentSessionFile: string;
	cwd: string;
	forkEntryId: string | null;
	branchSessionId: string;
	branchSessionFile: string;
	branchName: string;
	branchNumber: number;
	depth: number;
	windowDepth: number;
	windowRootSessionId: string;
	parentPaneId: string;
	parentWindowId: string;
	fresh: boolean;
	launchMode: "pane" | "window";
	createdAt: string;
	metadataEntryId?: string;
	sessionInfoEntryId?: string;
}

function tokenizeArguments(input: string): string[] {
	const tokens: string[] = [];
	let current = "";
	let quote: "'" | '"' | undefined;
	let escaped = false;
	let tokenStarted = false;

	for (const character of input) {
		if (escaped) {
			current += character;
			escaped = false;
			tokenStarted = true;
			continue;
		}

		if (character === "\\" && quote !== "'") {
			escaped = true;
			tokenStarted = true;
			continue;
		}

		if (quote) {
			if (character === quote) {
				quote = undefined;
			} else {
				current += character;
			}
			tokenStarted = true;
			continue;
		}

		if (character === "'" || character === '"') {
			quote = character;
			tokenStarted = true;
			continue;
		}

		if (/\s/.test(character)) {
			if (tokenStarted) {
				tokens.push(current);
				current = "";
				tokenStarted = false;
			}
			continue;
		}

		current += character;
		tokenStarted = true;
	}

	if (escaped) current += "\\";
	if (quote) throw new Error(`Unterminated ${quote} quote`);
	if (tokenStarted) tokens.push(current);
	return tokens;
}

function optionValue(tokens: string[], index: number, option: string): { value: string; nextIndex: number } {
	const token = tokens[index];
	const equalsIndex = token.indexOf("=");
	if (equalsIndex >= 0) {
		const value = token.slice(equalsIndex + 1);
		if (!value) throw new Error(`${option} requires a value`);
		return { value, nextIndex: index };
	}

	const value = tokens[index + 1];
	if (value === undefined || value.startsWith("--")) {
		throw new Error(`${option} requires a value`);
	}
	return { value, nextIndex: index + 1 };
}

export function parseBranchCommandArgs(input: string): BranchCommandOptions {
	const tokens = tokenizeArguments(input);
	const options: BranchCommandOptions = {
		fresh: true,
		newWindow: false,
		help: false,
	};
	const positionalPrompt: string[] = [];

	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index];
		if (token === "--") {
			positionalPrompt.push(...tokens.slice(index + 1));
			break;
		}
		if (token === "--with-context") {
			options.fresh = false;
			continue;
		}
		if (token === "--new-window") {
			options.newWindow = true;
			continue;
		}
		if (token === "--help" || token === "-h") {
			options.help = true;
			continue;
		}
		if (token === "--name" || token.startsWith("--name=")) {
			const parsed = optionValue(tokens, index, "--name");
			options.name = parsed.value.trim();
			index = parsed.nextIndex;
			continue;
		}
		if (token === "--prompt" || token.startsWith("--prompt=")) {
			const parsed = optionValue(tokens, index, "--prompt");
			options.prompt = parsed.value.trim();
			index = parsed.nextIndex;
			continue;
		}
		if (token === "--cwd" || token.startsWith("--cwd=")) {
			const parsed = optionValue(tokens, index, "--cwd");
			options.cwd = parsed.value.trim();
			index = parsed.nextIndex;
			continue;
		}
		if (token.startsWith("-")) throw new Error(`Unknown option: ${token}`);
		positionalPrompt.push(token);
	}

	if (options.prompt && positionalPrompt.length > 0) {
		throw new Error("Provide the branch prompt with either --prompt or positional text, not both");
	}
	if (!options.prompt && positionalPrompt.length > 0) {
		options.prompt = positionalPrompt.join(" ").trim();
	}
	if (options.name !== undefined && !options.name) throw new Error("--name cannot be empty");
	if (options.prompt !== undefined && !options.prompt) throw new Error("--prompt cannot be empty");
	if (options.cwd !== undefined && !options.cwd) throw new Error("--cwd cannot be empty");
	return options;
}

function uniqueEntryId(existingIds: Set<string>): string {
	while (true) {
		const id = randomBytes(4).toString("hex");
		if (!existingIds.has(id)) return id;
	}
}

export function normalizeBranchName(name: string): string {
	return name.replace(/\s+/g, " ").trim().slice(0, 80);
}

export function defaultBranchName(parentName: string | undefined, parentSessionId: string, branchNumber: number): string {
	const base = normalizeBranchName(parentName || "") || `session-${parentSessionId.slice(0, 8)}`;
	const suffix = `-branch-${branchNumber}`;
	const maxBaseLength = Math.max(1, 80 - suffix.length);
	return `${base.slice(0, maxBaseLength)}${suffix}`;
}

export function slugifyBranchName(name: string): string {
	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 40)
		.replace(/-+$/g, "");
	return slug || "branch";
}

export function countCreatedBranches(entries: SessionEntry[]): number {
	return entries.filter((entry) => entry.type === "custom" && entry.customType === BRANCH_CREATED_TYPE).length;
}

export function childBranchPlacement(options: {
	parentSessionId: string;
	parentMetadata?: BranchMetadata;
	branchSessionId: string;
	newWindow: boolean;
}): { depth: number; windowDepth: number; windowRootSessionId: string } {
	const parentDepth = options.parentMetadata?.depth ?? 0;
	const parentWindowDepth = options.parentMetadata?.windowDepth ?? 0;
	if (!options.newWindow && parentWindowDepth >= MAX_SAME_WINDOW_DEPTH) {
		throw new Error(
			`Same-window branching is limited to ${MAX_SAME_WINDOW_DEPTH} pane level; use /branch --new-window for a deeper branch`,
		);
	}
	return {
		depth: parentDepth + 1,
		windowDepth: options.newWindow ? 0 : parentWindowDepth + 1,
		windowRootSessionId: options.newWindow
			? options.branchSessionId
			: (options.parentMetadata?.windowRootSessionId ?? options.parentSessionId),
	};
}

// detachedBranchMetadata makes an existing branch the layout root of its own tmux window.
export function detachedBranchMetadata(metadata: BranchMetadata): BranchMetadata {
	return {
		...metadata,
		windowDepth: 0,
		windowRootSessionId: metadata.branchSessionId,
		launchMode: "window",
	};
}

export function buildBranchSession(options: BuildBranchSessionOptions): {
	entries: FileEntry[];
	metadata: BranchMetadata;
} {
	const parentPath = options.fresh ? [] : options.parentEntries;
	const existingIds = new Set(parentPath.map((entry) => entry.id));
	const metadataEntryId = options.metadataEntryId ?? uniqueEntryId(existingIds);
	if (existingIds.has(metadataEntryId)) throw new Error(`Duplicate session entry ID: ${metadataEntryId}`);
	existingIds.add(metadataEntryId);
	const sessionInfoEntryId = options.sessionInfoEntryId ?? uniqueEntryId(existingIds);
	if (existingIds.has(sessionInfoEntryId)) throw new Error(`Duplicate session entry ID: ${sessionInfoEntryId}`);

	const header: SessionHeader = {
		type: "session",
		version: CURRENT_SESSION_VERSION,
		id: options.branchSessionId,
		timestamp: options.createdAt,
		cwd: options.cwd,
		parentSession: options.parentSessionFile,
	};
	const metadata: BranchMetadata = {
		version: BRANCH_PROTOCOL_VERSION,
		depth: options.depth,
		windowDepth: options.windowDepth,
		windowRootSessionId: options.windowRootSessionId,
		fresh: options.fresh,
		branchSessionId: options.branchSessionId,
		branchSessionFile: options.branchSessionFile,
		branchName: options.branchName,
		branchNumber: options.branchNumber,
		parentSessionId: options.parentSessionId,
		parentSessionFile: options.parentSessionFile,
		parentPaneId: options.parentPaneId,
		parentWindowId: options.parentWindowId,
		forkEntryId: options.forkEntryId,
		launchMode: options.launchMode,
		createdAt: options.createdAt,
	};
	const metadataEntry: SessionEntry = {
		type: "custom",
		id: metadataEntryId,
		parentId: parentPath.at(-1)?.id ?? null,
		timestamp: options.createdAt,
		customType: BRANCH_METADATA_TYPE,
		data: metadata,
	};
	const sessionInfoEntry: SessionEntry = {
		type: "session_info",
		id: sessionInfoEntryId,
		parentId: metadataEntryId,
		timestamp: options.createdAt,
		name: options.branchName,
	};

	return {
		entries: [header, ...parentPath, metadataEntry, sessionInfoEntry],
		metadata,
	};
}

export function normalizeBranchMetadata(value: unknown): BranchMetadata | undefined {
	if (!value || typeof value !== "object") return undefined;
	const metadata = value as Partial<BranchMetadata>;
	if (
		(metadata.version !== 1 && metadata.version !== BRANCH_PROTOCOL_VERSION) ||
		!Number.isInteger(metadata.depth) ||
		(metadata.depth ?? 0) < 1 ||
		typeof metadata.fresh !== "boolean" ||
		typeof metadata.branchSessionId !== "string" ||
		typeof metadata.branchSessionFile !== "string" ||
		typeof metadata.branchName !== "string" ||
		!Number.isInteger(metadata.branchNumber) ||
		typeof metadata.parentSessionId !== "string" ||
		typeof metadata.parentSessionFile !== "string" ||
		typeof metadata.parentPaneId !== "string" ||
		typeof metadata.parentWindowId !== "string" ||
		(typeof metadata.forkEntryId !== "string" && metadata.forkEntryId !== null) ||
		(metadata.launchMode !== "pane" && metadata.launchMode !== "window") ||
		typeof metadata.createdAt !== "string"
	) {
		return undefined;
	}

	if (metadata.version === BRANCH_PROTOCOL_VERSION) {
		if (
			!Number.isInteger(metadata.windowDepth) ||
			(metadata.windowDepth ?? -1) < 0 ||
			typeof metadata.windowRootSessionId !== "string"
		) {
			return undefined;
		}
		return metadata as BranchMetadata;
	}

	// Version 1 only supported depth-one branches. Preserve its wire version so
	// a reloaded child can still merge into a parent running the older extension.
	// A new tmux window made the child its own window root; a pane branch was
	// one level below the parent.
	return {
		...(metadata as Omit<BranchMetadata, "windowDepth" | "windowRootSessionId">),
		windowDepth: metadata.launchMode === "window" ? 0 : 1,
		windowRootSessionId:
			metadata.launchMode === "window" ? metadata.branchSessionId : metadata.parentSessionId,
	};
}

export function findBranchMetadata(entries: SessionEntry[]): { entryId: string; metadata: BranchMetadata } | undefined {
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const entry = entries[index];
		if (entry.type !== "custom" || entry.customType !== BRANCH_METADATA_TYPE) continue;
		const metadata = normalizeBranchMetadata(entry.data);
		if (!metadata) throw new Error("This branch has invalid session-branches metadata");
		return { entryId: entry.id, metadata };
	}
	return undefined;
}

export function entriesAfterBranchPoint(entries: SessionEntry[], metadataEntryId: string): SessionEntry[] {
	const metadataIndex = entries.findIndex((entry) => entry.id === metadataEntryId);
	if (metadataIndex < 0) throw new Error("Branch metadata entry is not on the active session path");
	return entries.slice(metadataIndex + 1);
}

// parentMovedSinceFork reports whether /tree navigation moved the parent onto a sibling path.
export function parentMovedSinceFork(entries: SessionEntry[], forkEntryId: string | null): boolean {
	return forkEntryId !== null && !entries.some((entry) => entry.id === forkEntryId);
}

export function serializeSessionEntries(entries: FileEntry[]): string {
	return `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
}

export function mergeMessageContent(branchName: string, summary: string): string {
	return `Parallel branch \"${branchName}\" merged into this session.\n\n${summary.trim()}`;
}
