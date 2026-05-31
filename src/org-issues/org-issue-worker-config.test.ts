import assert from "node:assert/strict";
import test from "node:test";
import {
  isOrgIssueWorkerAlwaysOn,
  orgIssueWorkerDeferredBySprintRole,
  orgIssueWorkerEnabled,
} from "./org-issue-worker-config.js";

test("orgIssueWorkerEnabled requires LI_ORG_ISSUE_WORKER_ALWAYS_ON", () => {
  const prevOn = process.env.LI_ORG_ISSUE_WORKER_ALWAYS_ON;
  const prevRole = process.env.ORG_PR_SPRINT_ROLE;
  delete process.env.LI_ORG_ISSUE_WORKER_ALWAYS_ON;
  delete process.env.ORG_PR_SPRINT_ROLE;
  assert.equal(isOrgIssueWorkerAlwaysOn(), false);
  assert.equal(orgIssueWorkerEnabled(), false);
  process.env.LI_ORG_ISSUE_WORKER_ALWAYS_ON = "1";
  assert.equal(orgIssueWorkerEnabled(), true);
  process.env.ORG_PR_SPRINT_ROLE = "old-dirty";
  assert.equal(orgIssueWorkerDeferredBySprintRole(), "old-dirty");
  assert.equal(orgIssueWorkerEnabled(), false);
  if (prevOn === undefined) delete process.env.LI_ORG_ISSUE_WORKER_ALWAYS_ON;
  else process.env.LI_ORG_ISSUE_WORKER_ALWAYS_ON = prevOn;
  if (prevRole === undefined) delete process.env.ORG_PR_SPRINT_ROLE;
  else process.env.ORG_PR_SPRINT_ROLE = prevRole;
});
