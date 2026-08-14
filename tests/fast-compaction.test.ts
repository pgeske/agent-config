import assert from "node:assert/strict";
import test from "node:test";

import { stripCumulativeFileHistory } from "../extensions/fast-compaction/index.ts";

test("stripCumulativeFileHistory removes read and modified path ledgers", () => {
	const summary = `## Goal
Keep working.

<read-files>
/tmp/read.ts
/tmp/also-read.ts
</read-files>

<modified-files>
/tmp/changed.ts
</modified-files>`;

	assert.equal(stripCumulativeFileHistory(summary), "## Goal\nKeep working.");
});

test("stripCumulativeFileHistory removes repeated ledgers but preserves narrative XML", () => {
	const summary = `Before
<read-files>
/old.ts
</read-files>

<memo>keep this</memo>

<read-files>
/new.ts
</read-files>
After`;

	assert.equal(stripCumulativeFileHistory(summary), "Before\n\n<memo>keep this</memo>\nAfter");
});

test("stripCumulativeFileHistory leaves summaries without path ledgers unchanged", () => {
	const summary = "## Goal\nKeep the useful narrative.";
	assert.equal(stripCumulativeFileHistory(summary), summary);
});
