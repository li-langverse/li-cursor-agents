import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildImplementationQueue,
  buildImplementationQueueInstruction,
} from "./implementation-queue.js";

test("buildImplementationQueue merges ci_bug and explorer", () => {
  const q = buildImplementationQueue({
    ci_bug_triage: {
      work_queue: [{ kind: "local_ci", repo: "lic", number: 1, reason: "failed" }],
    },
    ecosystem_explorer: { missing_std_modules: ["std.foo"] },
  });
  assert.ok(q.sources.includes("ci_bug_triage"));
  assert.ok(q.work_queue.length >= 2);
  assert.match(buildImplementationQueueInstruction(q), /lic/);
});
