import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCodexReviewArgs, parseCodexReviewArgs, parsePullRequest } from "../extensions/codex-review.ts";

describe("codex-review", () => {
  it("parses GitHub PR URLs", () => {
    assert.deepEqual(parsePullRequest("https://github.com/pgeske/agent-config/pull/7"), {
      owner: "pgeske",
      repo: "agent-config",
      number: "7",
      url: "https://github.com/pgeske/agent-config/pull/7",
    });
  });

  it("parses owner/repo#number shorthand", () => {
    assert.deepEqual(parsePullRequest("pgeske/agent-config#7"), {
      owner: "pgeske",
      repo: "agent-config",
      number: "7",
      url: "https://github.com/pgeske/agent-config/pull/7",
    });
  });

  it("parses review mode flags and quoted titles", () => {
    assert.deepEqual(parseCodexReviewArgs('--base origin/develop --title "PR 7 review" focus on security'), {
      uncommitted: false,
      base: "origin/develop",
      title: "PR 7 review",
      extraPrompt: "focus on security",
    });
  });

  it("detects PR URL while preserving extra prompt", () => {
    assert.deepEqual(
      parseCodexReviewArgs("https://github.com/pgeske/agent-config/pull/7 focus on install issues"),
      {
        uncommitted: false,
        prUrl: "https://github.com/pgeske/agent-config/pull/7",
        extraPrompt: "focus on install issues",
      },
    );
  });

  it("builds Codex args for base reviews", () => {
    assert.deepEqual(buildCodexReviewArgs({ uncommitted: false, title: "Review me" }, "origin/main"), [
      "exec",
      "review",
      "--base",
      "origin/main",
      "--title",
      "Review me",
    ]);
  });

  it("builds Codex args for uncommitted reviews", () => {
    assert.deepEqual(buildCodexReviewArgs({ uncommitted: true }, "origin/main"), ["exec", "review", "--uncommitted"]);
  });
});
