import assert from "node:assert/strict";
import test from "node:test";
import { reconcileOrphanedK8sJobs } from "./k8s-job-reconcile.js";

test("reconcileOrphanedK8sJobs marks missing jobs", () => {
  const orphans: string[] = [];
  const n = reconcileOrphanedK8sJobs(
    {
      "li-langverse/benchmarks#266": {
        status: "running",
        jobName: "li-org-impl-benchmarks-266-dead",
      },
      "li-langverse/lic#1": {
        status: "running",
        jobName: "li-org-impl-lic-1-alive",
      },
    },
    [{ name: "li-org-impl-lic-1-alive", succeeded: false, failed: false }],
    (key) => orphans.push(key),
  );
  assert.equal(n, 1);
  assert.deepEqual(orphans, ["li-langverse/benchmarks#266"]);
});
