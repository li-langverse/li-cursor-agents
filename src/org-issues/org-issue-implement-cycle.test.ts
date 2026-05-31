import assert from "node:assert/strict";
import test from "node:test";
import {
  buildIssueInstruction,
  orgIssueImplementerAgentId,
} from "./org-issue-implement-cycle.js";

test("orgIssueImplementerAgentId defaults to code_implementer", () => {
  delete process.env.LI_ORG_ISSUE_IMPLEMENTER_AGENT;
  assert.equal(orgIssueImplementerAgentId(), "code_implementer");
});

test("orgIssueImplementerAgentId respects env override", () => {
  process.env.LI_ORG_ISSUE_IMPLEMENTER_AGENT = "org_issue_triage";
  assert.equal(orgIssueImplementerAgentId(), "org_issue_triage");
  delete process.env.LI_ORG_ISSUE_IMPLEMENTER_AGENT;
});

test("buildIssueInstruction includes issue ref and workflow repo", () => {
  const text = buildIssueInstruction(
    "li-langverse/lic#120",
    {
      title: "Fix cloud agent push",
      body: "Steps to reproduce…",
      html_url: "https://github.com/li-langverse/lic/issues/120",
      labels: ["bug"],
    },
    "abc123",
    { repo: "lic", number: 120, classification_note: "ready for implementation" },
  );
  assert.match(text, /li-langverse\/lic#120/);
  assert.match(text, /workflow repo: lic/);
  assert.match(text, /org-close-issue\.py/);
  assert.match(text, /abc123/);
});
