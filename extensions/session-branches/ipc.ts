import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { createConnection, createServer, type Server, type Socket } from "node:net";
import { join, resolve } from "node:path";
import type { BranchMergeDetails, BranchMetadata } from "./core.ts";

const MAX_REQUEST_BYTES = 256 * 1024;
const MAX_RESPONSE_BYTES = 64 * 1024;
const CONNECT_TIMEOUT_MS = 3_000;
const RUNTIME_PROTOCOL_VERSION = 1;

export interface MergePayload {
	metadata: BranchMetadata;
	summary: string;
	details: BranchMergeDetails;
}

interface RuntimeRequest {
	type: "check" | "merge";
	version: number;
	requestId: string;
	token: string;
	metadata: BranchMetadata;
	payload?: MergePayload;
}

interface MergeResponse {
	type: "response";
	version: number;
	requestId: string;
	ok: boolean;
	error?: string;
}

export interface RuntimeRegistry {
	version: number;
	sessionId: string;
	sessionFile: string;
	paneId: string;
	pid: number;
	socketPath: string;
	token: string;
	startedAt: string;
}

interface RuntimeOwner {
	pid: number;
	token: string;
}

export interface ParentRuntime {
	registry: RuntimeRegistry;
	stop(): Promise<void>;
}

function runtimeRoot(): string {
	if (process.env.PI_SESSION_BRANCH_RUNTIME_DIR) return resolve(process.env.PI_SESSION_BRANCH_RUNTIME_DIR);
	const uid = typeof process.getuid === "function" ? process.getuid() : "user";
	// Keep Unix socket paths short enough for macOS's 104-byte sockaddr_un limit.
	return join("/tmp", `pi-session-branches-${uid}`);
}

export function registryPathForSession(sessionId: string): string {
	return join(runtimeRoot(), `${sessionId}.json`);
}

function lockPathForSession(sessionId: string): string {
	return join(runtimeRoot(), `${sessionId}.lock`);
}

function socketPathForSession(sessionId: string, token: string): string {
	const digest = createHash("sha256").update(`${sessionId}:${process.pid}:${token}`).digest("hex").slice(0, 20);
	return join(runtimeRoot(), `${digest}.sock`);
}

async function removeFile(path: string): Promise<void> {
	try {
		await unlink(path);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
}

function processIsAlive(pid: number): boolean {
	if (!Number.isInteger(pid) || pid <= 0) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
}

async function readJson<T>(path: string): Promise<T | undefined> {
	try {
		return JSON.parse(await readFile(path, "utf8")) as T;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw new Error(`Cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`);
	}
}

async function acquireRuntimeLock(sessionId: string, owner: RuntimeOwner): Promise<void> {
	const lockPath = lockPathForSession(sessionId);
	for (let attempt = 0; attempt < 2; attempt += 1) {
		try {
			const handle = await open(lockPath, "wx", 0o600);
			try {
				await handle.writeFile(`${JSON.stringify(owner)}\n`, "utf8");
			} finally {
				await handle.close();
			}
			return;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
			const existingOwner = await readJson<RuntimeOwner>(lockPath).catch(() => undefined);
			if (existingOwner && processIsAlive(existingOwner.pid)) {
				throw new Error(`Session ${sessionId} is already active in Pi process ${existingOwner.pid}`);
			}

			const staleRegistry = await readJson<RuntimeRegistry>(registryPathForSession(sessionId)).catch(() => undefined);
			if (staleRegistry?.socketPath) await removeFile(staleRegistry.socketPath);
			await removeFile(registryPathForSession(sessionId));
			await removeFile(lockPath);
		}
	}
	throw new Error(`Could not acquire the runtime lock for session ${sessionId}`);
}

async function writeRegistry(registry: RuntimeRegistry): Promise<void> {
	const path = registryPathForSession(registry.sessionId);
	const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
	await writeFile(temporaryPath, `${JSON.stringify(registry)}\n`, { mode: 0o600, flag: "wx" });
	await rename(temporaryPath, path);
}

function respond(socket: Socket, response: MergeResponse): void {
	socket.end(`${JSON.stringify(response)}\n`);
}

export async function startParentRuntime(options: {
	sessionId: string;
	sessionFile: string;
	paneId: string;
	onCheck(metadata: BranchMetadata): Promise<void> | void;
	onMerge(payload: MergePayload): Promise<void> | void;
}): Promise<ParentRuntime> {
	const root = runtimeRoot();
	await mkdir(root, { recursive: true, mode: 0o700 });
	await chmod(root, 0o700);

	const token = randomUUID();
	const owner = { pid: process.pid, token };
	await acquireRuntimeLock(options.sessionId, owner);

	const socketPath = socketPathForSession(options.sessionId, token);
	await removeFile(socketPath);
	const sockets = new Set<Socket>();
	let server: Server | undefined;
	let stopped = false;

	try {
		server = createServer((socket) => {
			sockets.add(socket);
			socket.setEncoding("utf8");
			let buffer = "";
			let handled = false;

			socket.on("data", (chunk: string) => {
				if (handled) return;
				buffer += chunk;
				if (Buffer.byteLength(buffer, "utf8") > MAX_REQUEST_BYTES) {
					handled = true;
					respond(socket, {
						type: "response",
						version: RUNTIME_PROTOCOL_VERSION,
						requestId: "unknown",
						ok: false,
						error: "Merge request exceeded the size limit",
					});
					return;
				}

				const newlineIndex = buffer.indexOf("\n");
				if (newlineIndex < 0) return;
				handled = true;
				const line = buffer.slice(0, newlineIndex);
				void (async () => {
					let request: RuntimeRequest | undefined;
					try {
						request = JSON.parse(line) as RuntimeRequest;
						if (
							(request.type !== "check" && request.type !== "merge") ||
							request.version !== RUNTIME_PROTOCOL_VERSION ||
							typeof request.requestId !== "string" ||
							request.token !== token ||
							!request.metadata
						) {
							throw new Error("Invalid or unauthorized branch request");
						}
						if (request.type === "check") {
							await options.onCheck(request.metadata);
						} else {
							if (!request.payload) throw new Error("Merge request has no payload");
							await options.onMerge(request.payload);
						}
						respond(socket, {
							type: "response",
							version: RUNTIME_PROTOCOL_VERSION,
							requestId: request.requestId,
							ok: true,
						});
					} catch (error) {
						respond(socket, {
							type: "response",
							version: RUNTIME_PROTOCOL_VERSION,
							requestId: typeof request?.requestId === "string" ? request.requestId : "unknown",
							ok: false,
							error: error instanceof Error ? error.message : String(error),
						});
					}
				})();
			});
			socket.once("close", () => sockets.delete(socket));
			socket.on("error", () => undefined);
		});

		await new Promise<void>((resolvePromise, reject) => {
			const onError = (error: Error): void => reject(error);
			server!.once("error", onError);
			server!.listen(socketPath, () => {
				server!.off("error", onError);
				resolvePromise();
			});
		});
		await chmod(socketPath, 0o600);

		const registry: RuntimeRegistry = {
			version: RUNTIME_PROTOCOL_VERSION,
			sessionId: options.sessionId,
			sessionFile: resolve(options.sessionFile),
			paneId: options.paneId,
			pid: process.pid,
			socketPath,
			token,
			startedAt: new Date().toISOString(),
		};
		await writeRegistry(registry);

		return {
			registry,
			async stop(): Promise<void> {
				if (stopped) return;
				stopped = true;
				for (const socket of sockets) socket.destroy();
				if (server?.listening) {
					await new Promise<void>((resolvePromise) => server!.close(() => resolvePromise()));
				}
				const currentRegistry = await readJson<RuntimeRegistry>(registryPathForSession(options.sessionId)).catch(
					() => undefined,
				);
				if (currentRegistry?.token === token) await removeFile(registryPathForSession(options.sessionId));
				const currentOwner = await readJson<RuntimeOwner>(lockPathForSession(options.sessionId)).catch(() => undefined);
				if (currentOwner?.token === token) await removeFile(lockPathForSession(options.sessionId));
				await removeFile(socketPath);
			},
		};
	} catch (error) {
		for (const socket of sockets) socket.destroy();
		if (server?.listening) await new Promise<void>((resolvePromise) => server!.close(() => resolvePromise()));
		await removeFile(socketPath);
		await removeFile(registryPathForSession(options.sessionId));
		await removeFile(lockPathForSession(options.sessionId));
		throw error;
	}
}

async function activeParentRegistry(metadata: BranchMetadata): Promise<RuntimeRegistry> {
	const registry = await readJson<RuntimeRegistry>(registryPathForSession(metadata.parentSessionId));
	if (!registry) throw new Error("The parent Pi session is not active");
	if (
		registry.version !== RUNTIME_PROTOCOL_VERSION ||
		registry.sessionId !== metadata.parentSessionId ||
		resolve(registry.sessionFile) !== resolve(metadata.parentSessionFile)
	) {
		throw new Error("The active parent runtime does not match this branch's parent session");
	}
	if (!processIsAlive(registry.pid)) throw new Error("The parent Pi process is no longer running");
	return registry;
}

async function requestParent(metadata: BranchMetadata, type: "check" | "merge", payload?: MergePayload): Promise<void> {
	const registry = await activeParentRegistry(metadata);
	const requestId = randomUUID();
	const request: RuntimeRequest = {
		type,
		version: RUNTIME_PROTOCOL_VERSION,
		requestId,
		token: registry.token,
		metadata,
		payload,
	};

	await new Promise<void>((resolvePromise, reject) => {
		const socket = createConnection(registry.socketPath);
		socket.setEncoding("utf8");
		let buffer = "";
		let settled = false;
		const finish = (error?: Error): void => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			socket.destroy();
			if (error) reject(error);
			else resolvePromise();
		};
		const timer = setTimeout(() => finish(new Error("Timed out waiting for the parent Pi session")), CONNECT_TIMEOUT_MS);

		socket.once("connect", () => socket.write(`${JSON.stringify(request)}\n`));
		socket.on("data", (chunk: string) => {
			buffer += chunk;
			if (Buffer.byteLength(buffer, "utf8") > MAX_RESPONSE_BYTES) {
				finish(new Error("Parent Pi returned an oversized merge response"));
				return;
			}
			const newlineIndex = buffer.indexOf("\n");
			if (newlineIndex < 0) return;
			try {
				const response = JSON.parse(buffer.slice(0, newlineIndex)) as MergeResponse;
				if (response.type !== "response" || response.requestId !== requestId) {
					throw new Error("Parent Pi returned an invalid merge response");
				}
				if (!response.ok) throw new Error(response.error || "Parent Pi rejected the merge");
				finish();
			} catch (error) {
				finish(error instanceof Error ? error : new Error(String(error)));
			}
		});
		socket.once("error", (error) => finish(new Error(`Cannot reach the parent Pi session: ${error.message}`)));
		socket.once("close", () => {
			if (!settled) finish(new Error("The parent Pi session closed the merge connection"));
		});
	});
}

export async function checkParentReady(metadata: BranchMetadata): Promise<void> {
	await requestParent(metadata, "check");
}

export async function requestParentMerge(metadata: BranchMetadata, payload: MergePayload): Promise<void> {
	await requestParent(metadata, "merge", payload);
}
