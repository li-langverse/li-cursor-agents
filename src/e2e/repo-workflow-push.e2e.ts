/**
 * E2E: guaranteed push post-hook on li-demo fixture (no Cursor API).
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { runAgent } from "../runner.js";
import { setupE2eEnv } from "./helpers.js";

describe("repo workflow guaranteed push (li-demo fixture)", () => {
  test("docs_maintainer mock run commits via post-hook on li-demo fixture", async () => {
    const env = setupE2eEnv("v1");
    process.env.LI_REPO_WORKFLOW_USE_FIXTURE = "1";
    process.env.LI_REPO_WORKFLOW_SKIP_PUSH = "1";
    process.env.LI_CONTROL_PLANE_STORE = "disk";

    try {
      const result = await runAgent({
        agentId: "docs_maintainer",
        cwd: env.benchmarksRoot,
        benchmarksRoot: env.benchmarksRoot,
        mock: true,
        dryRun: false,
      });

      assert.equal(result.status, "finished");
      assert.match(result.outputText ?? "", /Repo workflow push \(post-hook\)/i);
      assert.ok(
        result.completion?.evidence.some((e) => e === "post_hook_committed"),
        "expected post_hook_committed evidence",
      );
    } finally {
      delete process.env.LI_REPO_WORKFLOW_USE_FIXTURE;
      delete process.env.LI_REPO_WORKFLOW_SKIP_PUSH;
      delete process.env.LI_CONTROL_PLANE_STORE;
      env.restoreEnv();
    }
  });
});
