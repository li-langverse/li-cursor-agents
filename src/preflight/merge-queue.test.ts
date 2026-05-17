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

test("buildPrMergerInstruction includes per-repo conflict guidance", () => {
  const text = buildPrMergerInstruction({
    next_merge: {
      rank: 1,
      repo: "lic",
      number: 10,
      url: "https://github.com/li-langverse/lic/pull/10",
      title: "feat",
    },
    repo_merge_plans: [
      {
        repo: "lic",
        base: "main",
        open_prs: 2,
        local_merge_order: ["lic#9", "lic#10"],
        safe_merge_order: ["lic#9"],
        conflicting_with_main: [
          {
            number: 10,
            url: "https://github.com/li-langverse/lic/pull/10",
            title: "feat",
            action: "rebase onto main",
          },
        ],
        pair_risks: [
          {
            merge_first: "lic#9",
            then_rebase_and_merge: "lic#10",
            file_overlap: 0.6,
            reason: "overlap",
          },
        ],
      },
    ],
  });
  assert.match(text, /Per-repo merge plans/);
  assert.match(text, /CONFLICTING/);
  assert.match(text, /lic#9/);
  assert.match(text, /Never.*drop commits/i);
});
