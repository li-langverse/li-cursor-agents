import assert from "node:assert/strict";
import test from "node:test";
import { isOrgIssueCloseReason } from "./org-close-issue.js";

test("isOrgIssueCloseReason accepts valid codes", () => {
  assert.equal(isOrgIssueCloseReason("duplicate"), true);
  assert.equal(isOrgIssueCloseReason("already_implemented"), true);
  assert.equal(isOrgIssueCloseReason("invalid"), false);
});
