import { execFile } from "node:child_process";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const scriptPath = path.join(__dirname, "tmux-pi-notify");

type NotifyState = "running" | "done" | "failed" | "review" | "blocked";

const labels: Record<NotifyState, string> = {
	running: "🔄",
	done: "✅",
	failed: "❌",
	review: "👀",
	blocked: "⚠️",
};

function inTmux(): boolean {
	return Boolean(process.env.TMUX);
}

function runTmuxNotify(args: string[]): Promise<void> {
	if (!inTmux()) return Promise.resolve();

	return new Promise((resolve) => {
		execFile(scriptPath, args, { timeout: 10_000 }, () => {
			// Notifications should never interrupt the agent. If tmux is unavailable,
			// the script is missing, or a session was detached, fail closed/no-op.
			resolve();
		});
	});
}

function mark(state: NotifyState): Promise<void> {
	return runTmuxNotify(["set", state, labels[state]]);
}

function eventLooksErrored(event: unknown): boolean {
	const value = event as Record<string, any>;
	const result = value?.result ?? value?.toolResult ?? value?.message?.result;
	return Boolean(
		value?.error ||
		value?.isError ||
		result?.isError ||
		result?.error ||
		result?.details?.error ||
		value?.message?.isError,
	);
}

export default function (pi: ExtensionAPI) {
	let sawToolError = false;

	pi.on("session_start", async () => {
		await runTmuxNotify(["install"]);
	});

	pi.on("agent_start", async () => {
		sawToolError = false;
		await mark("running");
	});

	pi.on("tool_result", async (event) => {
		if (eventLooksErrored(event)) {
			sawToolError = true;
		}
	});

	pi.on("agent_end", async (event) => {
		await mark(sawToolError || eventLooksErrored(event) ? "failed" : "done");
	});

	pi.registerCommand("tmux-notify", {
		description: "Manage the tmux window notification marker for this Pi session.",
		handler: async (args, ctx) => {
			const [command, ...rest] = args.trim().split(/\s+/).filter(Boolean);

			switch (command) {
				case undefined:
				case "install":
					await runTmuxNotify(["install"]);
					ctx.ui.notify("tmux notification integration installed", "info");
					return;
				case "clear":
					await runTmuxNotify(["clear"]);
					ctx.ui.notify("tmux notification cleared", "info");
					return;
				case "running":
				case "done":
				case "failed":
				case "review":
				case "blocked":
					await mark(command);
					ctx.ui.notify(`tmux notification set: ${command}`, "info");
					return;
				case "set": {
					const state = rest[0] as NotifyState | undefined;
					if (!state || !(state in labels)) {
						ctx.ui.notify("Usage: /tmux-notify set <running|done|failed|review|blocked>", "error");
						return;
					}
					await mark(state);
					ctx.ui.notify(`tmux notification set: ${state}`, "info");
					return;
				}
				default:
					ctx.ui.notify("Usage: /tmux-notify [install|clear|running|done|failed|review|blocked]", "error");
			}
		},
	});
}
