/**
 * E2E: code_implementer guaranteed push on li-demo fixture.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { runAgent } from "../runner.js";
import { setupE2eEnv } from "./helpers.js";

describe("code implementer guaranteed push (li-demo fixture)", () => {
  test("mock run commits via post-hook", async () => {
    const env = setupE2eEnv("v1");
    process.env.LI_REPO_WORKFLOW_USE_FIXTURE = "1";
    process.env.LI_REPO_WORKFLOW_SKIP_PUSH = "1";
    process.env.LI_CONTROL_PLANE_STORE = "disk";

    try {
      const result = await runAgent({
        agentId: "code_implementer",
        cwd: env.benchmarksRoot,
        benchmarksRoot: env.benchmarksRoot,
        mock: true,
        dryRun: false,
      });
      assert.equal(result.status, "finished");
      assert.ok(result.completion?.evidence.includes("post_hook_committed"));
    } finally {
      delete process.env.LI_REPO_WORKFLOW_USE_FIXTURE;
      delete process.env.LI_REPO_WORKFLOW_SKIP_PUSH;
      delete process.env.LI_CONTROL_PLANE_STORE;
      env.restoreEnv();
    }
  });
});
