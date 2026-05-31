import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  claimPr,
  isPrBusy,
  readActiveState,
} from "./org-pr-coordination.js";

test("claimPr blocks second role on same PR", () => {
  const root = mkdtempSync(join(tmpdir(), "li-org-pr-coord-"));
  try {
    assert.ok(claimPr("li-langverse/lic#1", "lic", 1, "implementer", "w1", undefined, root));
    assert.ok(isPrBusy(readActiveState(root), "li-langverse/lic#1"));
    assert.equal(claimPr("li-langverse/lic#1", "lic", 1, "reviewer", "w2", undefined, root), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
