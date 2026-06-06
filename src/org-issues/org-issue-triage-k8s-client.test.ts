import assert from "node:assert/strict";
import test from "node:test";
import { triageJobContainerCommand } from "./org-issue-triage-k8s-client.js";

test("triage K8s job boots via org-worker-entrypoint then node CLI", () => {
  const command = triageJobContainerCommand("li-langverse/lic#394", "worker-test");
  assert.deepEqual(command.slice(0, 3), [
    "/app/deploy/org-worker-entrypoint.sh",
    "node",
    "dist/cli/org-issue-triage.js",
  ]);
  assert.equal(command.includes("--issue"), true);
  assert.match(command.join(" "), /li-langverse\/lic#394/);
});
