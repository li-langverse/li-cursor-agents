import assert from "node:assert/strict";
import test from "node:test";
import {
  bugFixerSwarmOnly,
  briefingHasSwarmPrCiRed,
  resolveCiBugTriageQueues,
  selectBugFixerCiQueueRows,
} from "./ci-bug-triage-queue.js";

test("bugFixerSwarmOnly defaults on unless explicitly disabled", () => {
  const prev = process.env.LI_BUG_FIXER_SWARM_ONLY;
  delete process.env.LI_BUG_FIXER_SWARM_ONLY;
  try {
    assert.equal(bugFixerSwarmOnly(), true);
    process.env.LI_BUG_FIXER_SWARM_ONLY = "0";
    assert.equal(bugFixerSwarmOnly(), false);
  } finally {
    if (prev === undefined) delete process.env.LI_BUG_FIXER_SWARM_ONLY;
    else process.env.LI_BUG_FIXER_SWARM_ONLY = prev;
  }
});

test("selectBugFixerCiQueueRows prefers swarm_work_queue when swarm-only", () => {
  const prev = process.env.LI_BUG_FIXER_SWARM_ONLY;
  process.env.LI_BUG_FIXER_SWARM_ONLY = "1";
  try {
    const { rows, source } = selectBugFixerCiQueueRows({
      swarm_work_queue: [{ repo: "lic", number: 1, kind: "pr_ci", reason: "swarm" }],
      work_queue: [{ repo: "lic", number: 2, kind: "pr_ci", reason: "legacy" }],
    });
    assert.equal(source, "ci_bug_triage.swarm_work_queue");
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.number, 1);
  } finally {
    if (prev === undefined) delete process.env.LI_BUG_FIXER_SWARM_ONLY;
    else process.env.LI_BUG_FIXER_SWARM_ONLY = prev;
  }
});

test("selectBugFixerCiQueueRows falls back to work_queue when swarm empty", () => {
  const prev = process.env.LI_BUG_FIXER_SWARM_ONLY;
  process.env.LI_BUG_FIXER_SWARM_ONLY = "1";
  try {
    const { rows, source } = selectBugFixerCiQueueRows({
      swarm_work_queue: [],
      work_queue: [{ repo: "lic", number: 9, kind: "pr_ci" }],
    });
    assert.equal(source, "ci_bug_triage.work_queue");
    assert.equal(rows[0]?.number, 9);
  } finally {
    if (prev === undefined) delete process.env.LI_BUG_FIXER_SWARM_ONLY;
    else process.env.LI_BUG_FIXER_SWARM_ONLY = prev;
  }
});

test("briefingHasSwarmPrCiRed detects swarm_work_queue and agent PR failures", () => {
  assert.equal(
    briefingHasSwarmPrCiRed({
      ci_bug_triage: { swarm_work_queue: [{ repo: "lic", number: 3 }] },
    }),
    true,
  );
  assert.equal(
    briefingHasSwarmPrCiRed({
      agent_pr_deliverable_failures: [{ repo: "lic", number: 4 }],
    }),
    true,
  );
  assert.equal(
    briefingHasSwarmPrCiRed({
      ecosystem_audit: {
        failed_prs: [{ repo: "lic", number: 5, title: "chore(agent-kit): sync" }],
      },
    }),
    true,
  );
  assert.equal(briefingHasSwarmPrCiRed({}), false);
});

test("resolveCiBugTriageQueues splits swarm org and fallback", () => {
  const q = resolveCiBugTriageQueues({
    swarm_work_queue: [{ repo: "a" }],
    org_work_queue: [{ repo: "b" }],
    work_queue: [{ repo: "c" }],
  });
  assert.equal(q.swarm.length, 1);
  assert.equal(q.org.length, 1);
  assert.equal(q.fallback.length, 1);
});
