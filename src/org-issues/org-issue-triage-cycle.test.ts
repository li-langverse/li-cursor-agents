import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTriageInstruction,
  detectTriageRouted,
  orgIssueTriageAgentId,
} from "./org-issue-triage-cycle.js";

test("orgIssueTriageAgentId defaults to org_issue_triage", () => {
  delete process.env.LI_ORG_ISSUE_TRIAGE_AGENT;
  assert.equal(orgIssueTriageAgentId(), "org_issue_triage");
});

test("buildTriageInstruction requires close_github_issue MCP tool", () => {
  const text = buildTriageInstruction(
    "li-langverse/lic#394",
    {
      title: "Add native capture script",
      body: "studio-ui-ux-capture-native.sh missing on main",
      html_url: "https://github.com/li-langverse/lic/issues/394",
      labels: ["documentation"],
    },
    "worker-abc",
    { repo: "lic", number: 394, classification_note: "needs_triage" },
  );
  assert.match(text, /li-langverse\/lic#394/);
  assert.match(text, /close_github_issue/);
  assert.match(text, /li-org-github/);
  assert.match(text, /repo: "lic"/);
  assert.match(text, /number: 394/);
  assert.match(text, /workflow repo: lic/);
});

test("detectTriageRouted close via MCP tool JSON", () => {
  const output = [
    "Called close_github_issue({ repo: 'lic', number: 394, reason: 'already_implemented' })",
    'Response: {"ok": true, "closed": true, "message": "closed"}',
  ].join("\n");
  assert.equal(detectTriageRouted(output), "close");
});

test("detectTriageRouted close via org-close-issue.py only when closed true", () => {
  assert.equal(
    detectTriageRouted('org-close-issue.py ... {"ok": true, "closed": true}'),
    "close",
  );
  assert.equal(
    detectTriageRouted("Close via org-close-issue.py after merge and green CI"),
    "none",
  );
});

test("detectTriageRouted does not treat defer-close prose as close route", () => {
  const deferred = [
    "## Recommended",
    "Close with org-close-issue.py --reason already_implemented after merge",
    "Implementer scope: fix native_capture.py",
  ].join("\n");
  assert.equal(detectTriageRouted(deferred), "none");
});

test("detectTriageRouted implement and planner hints", () => {
  assert.equal(detectTriageRouted("Add label plan-approved; route to implement"), "implement");
  assert.equal(detectTriageRouted("Add plan-needed label for issue-feature-planner"), "planner");
});
