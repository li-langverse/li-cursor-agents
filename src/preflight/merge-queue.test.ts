import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPrMergerInstruction, mergePlanFromBriefing } from "./merge-queue.js";

test("mergePlanFromBriefing extracts merge_plan", () => {
  const plan = mergePlanFromBriefing({
    merge_plan: {
      next_merge: { rank: 1, repo: "benchmarks", number: 13, url: "https://example.com", title: "x" },
    },
  });
  assert.equal(plan?.next_merge?.repo, "benchmarks");
});

test("buildPrMergerInstruction names next_merge only", () => {
  const text = buildPrMergerInstruction({
    vision_order: "benchmarks → lic",
    ordering_rules: ["stacks first"],
    next_merge: {
      rank: 1,
      repo: "lip",
      number: 2,
      url: "https://github.com/li-langverse/lip/pull/2",
      title: "feat",
      order_reason: "rank 1; gate ready",
    },
    merge_sequence: [
      {
        rank: 1,
        repo: "lip",
        number: 2,
        url: "https://github.com/li-langverse/lip/pull/2",
        title: "feat",
      },
    ],
  });
  assert.match(text, /lip#2/);
  assert.match(text, /Merge this PR only/);
});
