import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPrAlignmentCloseInstruction,
  buildPrBranchOpenerInstruction,
  prHygieneFromBriefing,
} from "./pr-hygiene.js";

test("prHygieneFromBriefing extracts pr_branch_hygiene", () => {
  const h = prHygieneFromBriefing({
    pr_branch_hygiene: {
      branches_needing_pr: [{ repo: "lip", branch: "feat/x", ahead_by: 2 }],
      prs_recommended_close: [{ repo: "lic", number: 9, safe_now: true }],
    },
  });
  assert.equal(h?.branches_needing_pr?.length, 1);
  assert.equal(h?.prs_recommended_close?.[0]?.number, 9);
});

test("buildPrBranchOpenerInstruction lists branches", () => {
  const text = buildPrBranchOpenerInstruction({
    branches_needing_pr: [{ repo: "lip", branch: "feat/ci", base: "main", ahead_by: 3 }],
  });
  assert.match(text, /feat\/ci/);
  assert.match(text, /gh pr create/);
});

test("buildPrAlignmentCloseInstruction lists safe closes", () => {
  const text = buildPrAlignmentCloseInstruction(
    {
      prs_recommended_close: [
        { repo: "lic", number: 1, safe_now: true, reason: "superseded" },
        { repo: "lip", number: 2, safe_now: false, suggested_action: "close #2 after #3 merges" },
      ],
    },
    null,
  );
  assert.match(text, /lic#1/);
  assert.match(text, /close #2 after/);
  assert.match(text, /gh pr close/);
});
