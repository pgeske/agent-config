import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("installer retires owned absolute and relative links without --prune", { skip: process.platform === "win32" }, (t) => {
	const home = mkdtempSync(join(tmpdir(), "agent-install-"));
	t.after(() => rmSync(home, { recursive: true, force: true }));
	const extensions = join(home, ".pi/agent/extensions");
	mkdirSync(extensions, { recursive: true });
	// Deleted directories leave dangling links, so realpath alone cannot find them.
	symlinkSync(join(repo, "extensions/session-branches"), join(extensions, "session-branches"));
	symlinkSync(relative(extensions, join(repo, "extensions/fast-compaction")), join(extensions, "fast-compaction"));
	symlinkSync(join(home, "third-party/missing"), join(extensions, "third-party"));
	mkdirSync(join(extensions, "local-extension"));
	writeFileSync(join(extensions, "local-extension/index.ts"), "user extension");
	writeFileSync(join(extensions, "herdr-agent-state.ts"), "official integration");

	for (let i = 0; i < 2; i++) {
		execFileSync("bash", [join(repo, "install.sh")], { env: { ...process.env, HOME: home } });
	}
	for (const name of ["session-branches", "fast-compaction"]) {
		assert.throws(() => lstatSync(join(extensions, name)), { code: "ENOENT" });
	}
	assert.equal(readlinkSync(join(extensions, "third-party")), join(home, "third-party/missing"));
	assert.equal(readFileSync(join(extensions, "local-extension/index.ts"), "utf8"), "user extension");
	assert.equal(readFileSync(join(extensions, "herdr-agent-state.ts"), "utf8"), "official integration");
	assert.equal(readlinkSync(join(extensions, "compact-footer")), join(repo, "extensions/compact-footer"));
});

test("cleanup preserves real retired-name directories and unrelated retired-name links", { skip: process.platform === "win32" }, (t) => {
	const home = mkdtempSync(join(tmpdir(), "agent-install-"));
	t.after(() => rmSync(home, { recursive: true, force: true }));
	const extensions = join(home, ".pi/agent/extensions");
	mkdirSync(join(extensions, "fast-compaction"), { recursive: true });
	writeFileSync(join(extensions, "fast-compaction/index.ts"), "user-owned content");
	symlinkSync(join(home, "unrelated"), join(extensions, "session-branches"));
	execFileSync("bash", [join(repo, "install.sh")], { env: { ...process.env, HOME: home } });
	assert.equal(readFileSync(join(extensions, "fast-compaction/index.ts"), "utf8"), "user-owned content");
	assert.equal(readlinkSync(join(extensions, "session-branches")), join(home, "unrelated"));
});

test("cleanup never traverses a linked extension root", { skip: process.platform === "win32" }, (t) => {
	const home = mkdtempSync(join(tmpdir(), "agent-prune-"));
	t.after(() => rmSync(home, { recursive: true, force: true }));
	const extensions = join(home, "extensions");
	mkdirSync(extensions);
	symlinkSync(join(repo, "extensions/removed-extension"), join(extensions, "removed-extension"));
	symlinkSync(extensions, join(home, "linked-root"));
	execFileSync(process.execPath, [join(repo, "scripts/prune-extension-links.mjs"), join(repo, "extensions"), join(home, "linked-root")]);
	assert.equal(lstatSync(join(extensions, "removed-extension")).isSymbolicLink(), true);
});
