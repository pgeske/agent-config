import assert from "node:assert/strict";
import test from "node:test";

import { buildCompactFooter, formatFooterTokens } from "../extensions/compact-footer/index.ts";

const footer = {
	sessionName: "main",
	contextPercent: 23.4,
	contextWindow: 272_000,
	model: "gpt-5.6-sol",
	thinkingLevel: "medium",
};

test("formatFooterTokens keeps context limits compact", () => {
	assert.equal(formatFooterTokens(272_000), "272k");
	assert.equal(formatFooterTokens(8_500), "8.5k");
	assert.equal(formatFooterTokens(1_500_000), "1.5M");
});

test("buildCompactFooter renders the preferred single-line layout", () => {
	assert.equal(buildCompactFooter(footer, 80), "main  23.4%/272k  gpt-5.6-sol • medium");
});

test("buildCompactFooter drops model details before essential context", () => {
	assert.equal(buildCompactFooter(footer, 20), "main  23.4%/272k");
});

test("buildCompactFooter truncates the session name before context", () => {
	assert.equal(
		buildCompactFooter({ ...footer, sessionName: "long-apple-tv-session" }, 20),
		"long-ap…  23.4%/272k",
	);
});

test("buildCompactFooter marks unknown context usage", () => {
	assert.equal(buildCompactFooter({ ...footer, contextPercent: null }, 80), "main  ?%/272k  gpt-5.6-sol • medium");
});
