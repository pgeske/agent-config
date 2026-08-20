import assert from "node:assert/strict";
import test from "node:test";

import { visibleWidth } from "@earendil-works/pi-tui";
import {
	type CompactFooterTheme,
	renderCompactFooterLine,
} from "../extensions/compact-footer/index.ts";

const plainTheme: CompactFooterTheme = {
	fg: (_color, text) => text,
	bold: (text) => text,
};

test("compact footer keeps the requested details on one padded line", () => {
	const line = renderCompactFooterLine(
		100,
		{
			model: "gpt-5.6-sol",
			thinking: "max",
			session: "main-branch-153",
			contextPercent: 7.5,
		},
		plainTheme,
	);

	assert.equal(visibleWidth(line), 100);
	assert.equal(line.includes("\n"), false);
	assert.ok(line.startsWith("  "));
	assert.ok(line.endsWith("  "));
	assert.match(line, /gpt-5\.6-sol  ·  thinking max  ·  session main-branch-153/);
	assert.match(line, /context 7\.5%  $/);
});

test("compact footer preserves context pressure when the session name is long", () => {
	const line = renderCompactFooterLine(
		64,
		{
			model: "claude-sonnet-4-6",
			thinking: "high",
			session: "a-very-long-session-name-that-cannot-fit-in-the-footer",
			contextPercent: 73.2,
		},
		plainTheme,
	);

	assert.equal(visibleWidth(line), 64);
	assert.match(line, /…/);
	assert.match(line, /context 73\.2%  $/);
});

test("compact footer marks context as unknown without adding another line", () => {
	const line = renderCompactFooterLine(
		48,
		{
			model: "GLM-5.2",
			thinking: "off",
			session: "untitled",
			contextPercent: null,
		},
		plainTheme,
	);

	assert.equal(visibleWidth(line), 48);
	assert.equal(line.includes("\n"), false);
	assert.match(line, /context —  $/);
});
