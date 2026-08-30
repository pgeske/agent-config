import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(
	new URL("../extensions/tmux-notify/tmux-pi-notify", import.meta.url),
);

// The harness talks to a throwaway tmux server on a private socket. A `tmux`
// wrapper on PATH injects the socket flag so every script invocation (including
// tmux-scheduled run-shell jobs, which inherit the server's env) stays isolated
// from the user's real tmux server.
const SOCKET = `tmux-notify-test-${process.pid}`;
const REAL_TMUX = execFileSync("sh", ["-c", "command -v tmux"], { encoding: "utf8" }).trim();
const harnessDir = mkdtempSync(join(tmpdir(), "tmux-notify-test-"));
const binDir = join(harnessDir, "bin");
mkdirSync(binDir, { recursive: true });
writeFileSync(
	join(binDir, "tmux"),
	`#!/bin/sh\nexec '${REAL_TMUX}' -L '${SOCKET}' "$@"\n`,
	{ mode: 0o755 },
);

// TTLs are shortened so scheduled clears finish inside the test timeout. The
// delay is baked into the scheduled `sleep`, so overrides only matter at
// schedule time.
const TEST_ENV = {
	PATH: `${binDir}:${process.env.PATH}`,
	HOME: process.env.HOME ?? "",
	TMPDIR: process.env.TMPDIR ?? "/tmp",
	// tmux mangles non-ASCII option values (🔄/✅) without a UTF-8 locale; the
	// real extension always runs inside Pi's UTF-8 environment.
	LANG: "en_US.UTF-8",
	LC_ALL: "en_US.UTF-8",
	PI_TMUX_NOTIFY_DONE_TTL_SECONDS: "1",
	PI_TMUX_NOTIFY_VIEWED_TTL_SECONDS: "1",
};

function tmux(...args: string[]): string {
	return execFileSync(join(binDir, "tmux"), args, { encoding: "utf8" });
}

// Invoke the helper as a pane's Pi session would: TMUX_PANE selects the pane,
// and current_window_id derives the window target from it.
function notify(pane: string, ...args: string[]): void {
	execFileSync(SCRIPT, args, { env: { ...TEST_ENV, TMUX_PANE: pane } });
}

function paneOption(pane: string, option: string): string {
	try {
		return tmux("show-options", "-p", "-t", pane, "-v", option).trim();
	} catch {
		return "";
	}
}

function windowOption(win: string, option: string): string {
	try {
		return tmux("show-window-option", "-t", win, "-v", option).trim();
	} catch {
		return "";
	}
}

function makeWindow(): { win: string; panes: [string, string] } {
	const win = tmux("new-window", "-t", "test:", "-P", "-F", "#{window_id}").trim();
	const first = tmux("list-panes", "-t", win, "-F", "#{pane_id}").trim();
	const second = tmux("split-window", "-d", "-t", win, "-P", "-F", "#{pane_id}").trim();
	return { win, panes: [first, second] };
}

async function waitUntil(fn: () => boolean, timeoutMs = 5000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (fn()) return;
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	assert.fail("condition not met within timeout");
}

describe("tmux-notify", () => {
	before(() => {
		execFileSync(
			join(binDir, "tmux"),
			["-f", "/dev/null", "new-session", "-d", "-s", "test", "-x", "160", "-y", "48"],
			{ env: TEST_ENV },
		);
	});

	after(() => {
		try {
			tmux("kill-server");
		} catch {
			// Server may already be gone.
		}
		rmSync(harnessDir, { recursive: true, force: true });
	});

	it("publishes the running marker to the window aggregate", () => {
		const { win, panes } = makeWindow();
		notify(panes[0], "set", "running", "🔄");

		assert.equal(windowOption(win, "@pi_notify_state"), "running");
		assert.equal(windowOption(win, "@pi_notify_label"), "🔄");
		assert.equal(windowOption(win, "@pi_notify_id"), paneOption(panes[0], "@pi_notify_pane_id"));
	});

	it("renders the window aggregate, not the active pane's state", () => {
		const { win, panes } = makeWindow();
		notify(panes[0], "set", "done", "✅");
		notify(panes[1], "set", "running", "🔄");

		// The status line resolves #{@pi_notify_label} with pane scope first; the
		// active pane (panes[0], done) must not shadow the running aggregate.
		assert.equal(
			tmux("display-message", "-p", "-t", win, "#{@pi_notify_label}").trim(),
			"🔄",
		);
		assert.equal(
			tmux("display-message", "-p", "-t", win, "#{@pi_notify_state}").trim(),
			"running",
		);
	});

	it("keeps the running marker when another pane finishes (running wins over done)", () => {
		const { win, panes } = makeWindow();
		notify(panes[0], "set", "running", "🔄");
		notify(panes[1], "set", "done", "✅");

		assert.equal(windowOption(win, "@pi_notify_state"), "running");
		assert.equal(windowOption(win, "@pi_notify_label"), "🔄");
		assert.equal(windowOption(win, "@pi_notify_id"), paneOption(panes[0], "@pi_notify_pane_id"));
	});

	it("shows the newest done marker once no pane is running", async () => {
		const { win, panes } = makeWindow();
		notify(panes[0], "set", "done", "✅");
		// Distinct epoch seconds so "newest" is unambiguous.
		await new Promise((resolve) => setTimeout(resolve, 1100));
		notify(panes[1], "set", "done", "✅");

		assert.equal(windowOption(win, "@pi_notify_state"), "done");
		assert.equal(windowOption(win, "@pi_notify_id"), paneOption(panes[1], "@pi_notify_pane_id"));
	});

	it("breaks same-second done ties in favor of the pane that just completed", () => {
		const { win, panes } = makeWindow();
		notify(panes[0], "set", "done", "✅");
		notify(panes[1], "set", "done", "✅");

		assert.equal(windowOption(win, "@pi_notify_state"), "done");
		assert.equal(windowOption(win, "@pi_notify_id"), paneOption(panes[1], "@pi_notify_pane_id"));
	});

	it("counts a running pane whose id option is missing (partial state)", () => {
		const { win, panes } = makeWindow();
		notify(panes[0], "set", "running", "🔄");
		// Simulate a partial write/read: state survives, id does not.
		tmux("set-option", "-p", "-t", panes[0], "-qu", "@pi_notify_pane_id");
		notify(panes[1], "set", "done", "✅");

		assert.equal(windowOption(win, "@pi_notify_state"), "running");
		assert.equal(windowOption(win, "@pi_notify_label"), "🔄");
	});

	it("never wipes a running pane when a stale timer clears its id", () => {
		const { win, panes } = makeWindow();
		notify(panes[0], "set", "running", "🔄");
		const runningId = paneOption(panes[0], "@pi_notify_pane_id");
		notify(panes[1], "set", "done", "✅");

		// A stale scheduled clear carrying the live running id (the viewed-hook
		// race this guards against) must not erase the running pane.
		notify(panes[1], "clear-if-id", win, runningId);

		assert.equal(paneOption(panes[0], "@pi_notify_pane_state"), "running");
		assert.equal(paneOption(panes[0], "@pi_notify_pane_id"), runningId);
		assert.equal(windowOption(win, "@pi_notify_state"), "running");
	});

	it("does not schedule a clear when viewing a running window", async () => {
		const { win, panes } = makeWindow();
		notify(panes[0], "set", "running", "🔄");

		notify(panes[0], "viewed", win);
		await new Promise((resolve) => setTimeout(resolve, 2000));

		assert.equal(windowOption(win, "@pi_notify_state"), "running");
		assert.equal(paneOption(panes[0], "@pi_notify_pane_state"), "running");
	});

	it("clears a viewed done marker after the viewed TTL", async () => {
		const { win, panes } = makeWindow();
		notify(panes[0], "set", "done", "✅");
		assert.equal(windowOption(win, "@pi_notify_state"), "done");

		notify(panes[0], "viewed", win);
		await waitUntil(
			() => windowOption(win, "@pi_notify_id") === "" && paneOption(panes[0], "@pi_notify_pane_id") === "",
		);
	});

	it("clears done markers after the done TTL when the window is visible", async () => {
		const { win, panes } = makeWindow();
		notify(panes[0], "set", "done", "✅");
		assert.equal(windowOption(win, "@pi_notify_state"), "done");

		await waitUntil(() => windowOption(win, "@pi_notify_id") === "");
		assert.equal(paneOption(panes[0], "@pi_notify_pane_id"), "");
	});

	it("manual clear dismisses done panes but keeps running panes marked", () => {
		const { win, panes } = makeWindow();
		notify(panes[0], "set", "running", "🔄");
		notify(panes[1], "set", "done", "✅");

		notify(panes[0], "clear");

		assert.equal(paneOption(panes[1], "@pi_notify_pane_id"), "");
		assert.equal(paneOption(panes[0], "@pi_notify_pane_state"), "running");
		assert.equal(windowOption(win, "@pi_notify_state"), "running");
		assert.equal(windowOption(win, "@pi_notify_label"), "🔄");
	});

	it("manual clear empties the window when nothing is running", () => {
		const { win, panes } = makeWindow();
		notify(panes[0], "set", "done", "✅");

		notify(panes[0], "clear");

		assert.equal(windowOption(win, "@pi_notify_id"), "");
		assert.equal(paneOption(panes[0], "@pi_notify_pane_id"), "");
	});

	it("install sweeps legacy pane options that would shadow the aggregate", () => {
		const { win, panes } = makeWindow();
		// Options an older version left at pane scope under the aggregate's names.
		tmux("set-option", "-p", "-t", panes[0], "-q", "@pi_notify_label", "✅");
		tmux("set-option", "-p", "-t", panes[0], "-q", "@pi_notify_state", "done");

		notify(panes[1], "set", "running", "🔄");
		notify(panes[0], "install");

		assert.equal(paneOption(panes[0], "@pi_notify_label"), "");
		assert.equal(paneOption(panes[0], "@pi_notify_state"), "");
		assert.equal(
			tmux("display-message", "-p", "-t", win, "#{@pi_notify_label}").trim(),
			"🔄",
		);
	});

	it("concurrent done and running updates always end with the running marker", async () => {
		// Race the exact interleaving that let a done override publish stale
		// state over a live running pane. Each iteration must converge to 🔄.
		for (let i = 0; i < 8; i++) {
			const { win, panes } = makeWindow();
			const doneProc = spawn(SCRIPT, ["set", "done", "✅"], {
				env: { ...TEST_ENV, TMUX_PANE: panes[0] },
			});
			const runningProc = spawn(SCRIPT, ["set", "running", "🔄"], {
				env: { ...TEST_ENV, TMUX_PANE: panes[1] },
			});
			await Promise.all([once(doneProc, "exit"), once(runningProc, "exit")]);

			assert.equal(
				windowOption(win, "@pi_notify_state"),
				"running",
				`iteration ${i}: window must show running while a pane runs`,
			);
			assert.equal(paneOption(panes[1], "@pi_notify_pane_state"), "running");
		}
	});

	it("install renders the label and stays idempotent", () => {
		notify("", "install");
		notify("", "install");

		const format = tmux("show-options", "-gv", "window-status-format");
		assert.match(format, /@pi_notify_label/);
		// Each installed snippet starts with the #{?@pi_notify_label conditional;
		// the label name also appears inside the snippet body.
		assert.equal(
			format.split("#{?@pi_notify_label").length - 1,
			1,
			"format must not accumulate duplicate snippets",
		);

		const hooks = tmux("show-hooks", "-g");
		assert.match(hooks, /tmux-pi-notify viewed/);
	});
});
