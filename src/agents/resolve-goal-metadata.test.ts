import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveBranchFromGoalText,
  resolvePlanRelFromGoalText,
  inferPlanPrefixFromGoalFile,
} from "./resolve-goal-metadata.js";

test("resolveBranchFromGoalText backtick line", () => {
  const text = "**Branch:** `cursor/world-studio-gui-product-visual`";
  assert.equal(resolveBranchFromGoalText(text), "cursor/world-studio-gui-product-visual");
});

test("resolveBranchFromGoalText frontmatter", () => {
  const text = `---
branch: cursor/proof-explorer-program
---
`;
  assert.equal(resolveBranchFromGoalText(text), "cursor/proof-explorer-program");
});

test("resolvePlanRelFromGoalText", () => {
  const text =
    "**Plan loop:** [loop.md](../docs/superpowers/plans/2026-06-02-world-studio-gui-product-visual-loop.md)";
  assert.equal(
    resolvePlanRelFromGoalText(text),
    "docs/superpowers/plans/2026-06-02-world-studio-gui-product-visual-loop.md",
  );
});

test("inferPlanPrefixFromGoalFile", () => {
  assert.equal(
    inferPlanPrefixFromGoalFile("world-studio-gui-product-visual.md"),
    "wsv-w",
  );
});
