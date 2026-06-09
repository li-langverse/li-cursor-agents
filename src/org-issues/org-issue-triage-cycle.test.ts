import assert from "node:assert/strict";
import test from "node:test";
import { buildTriageInstruction, detectTriageRouted } from "./org-issue-triage-cycle.js";

test("buildTriageInstruction requires close_gitlab_issue MCP tool", () => {
  const text = buildTriageInstruction(
    "li-langverse/lic#394",
    {
      title: "Test issue",
      body: "body",
      labels: ["bug"],
      html_url: "https://gitlab.lilangverse.xyz/li-langverse/lic/-/issues/394",
    },
    "worker-1",
  );
  assert.match(text, /close_gitlab_issue/);
  assert.match(text, /li-org-vcs/);
});

test("detectTriageRouted recognizes close_gitlab_issue success", () => {
  const routed = detectTriageRouted(
    "Called close_gitlab_issue({ repo: 'lic', number: 394, reason: 'already_implemented' }) {\"closed\":true}",
  );
  assert.equal(routed, "close");
});

test("detectTriageRouted still accepts deprecated close_github_issue alias", () => {
  const routed = detectTriageRouted(
    "Called close_github_issue({ repo: 'lic', number: 394, reason: 'already_implemented' })",
  );
  assert.notEqual(routed, "close");
});
