import { test } from "node:test";
import assert from "node:assert/strict";
import { beginRepoWorkflowSession } from "./workspace-session.js";

test("beginRepoWorkflowSession uses lic fixture when useFixture and repo lic", () => {
  const session = beginRepoWorkflowSession({
    agentId: "code_implementer",
    repo: "lic",
    useFixture: true,
    skipPush: true,
  });
  assert.equal(session.ok, true);
  assert.equal(session.repo, "lic");
  assert.ok(session.cloneDir.includes("/lic/"));
});
