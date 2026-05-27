import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildImplementationQueue,
  normalizeImplementationQueue,
} from "./implementation-queue.js";

test("normalizeImplementationQueue accepts legacy array", () => {
  const q = normalizeImplementationQueue([
    { kind: "ui_remediation", repo: "lic", reason: "fix contrast" },
  ]);
  assert.equal(q.work_queue.length, 1);
  assert.ok(q.sources.includes("legacy_implementation_queue"));
});

test("buildImplementationQueue includes ui_remediation from briefing queue", () => {
  const q = buildImplementationQueue({
    implementation_queue: {
      work_queue: [
        {
          kind: "ux_remediation",
          repo: "li-cursor-agents",
          reason: "Add empty state on /agents",
        },
      ],
      sources: ["ux_audit"],
    },
  });
  assert.ok(q.work_queue.some((w) => w.kind === "ux_remediation"));
  assert.ok(q.sources.includes("ux_audit"));
});

test("buildImplementationQueue merges remediation_manifest queue items", () => {
  const q = buildImplementationQueue({
    remediation_manifest: {
      implementation_queue: [
        {
          kind: "ui_remediation",
          repo: "lic",
          remediation_summary: "Fix MkDocs nav contrast",
          title: "[ui-audit] nav",
        },
      ],
    },
  });
  assert.ok(q.work_queue.some((w) => w.kind === "ui_remediation"));
});

test("buildBugFixerImplementationQueue prefers swarm_work_queue", async () => {
  const { buildBugFixerImplementationQueue } = await import("./implementation-queue.js");
  const prev = process.env.LI_BUG_FIXER_SWARM_ONLY;
  process.env.LI_BUG_FIXER_SWARM_ONLY = "1";
  try {
    const q = buildBugFixerImplementationQueue({
      ci_bug_triage: {
        swarm_work_queue: [{ repo: "lic", number: 3, kind: "pr_ci", goal_id: "game_engine_ux" }],
        work_queue: [{ repo: "lic", number: 4, kind: "pr_ci" }],
      },
    });
    assert.ok(q.sources.includes("ci_bug_triage.swarm_work_queue"));
    assert.equal(q.work_queue[0]?.number, 3);
    assert.equal(q.work_queue[0]?.goal_id, "game_engine_ux");
  } finally {
    if (prev === undefined) delete process.env.LI_BUG_FIXER_SWARM_ONLY;
    else process.env.LI_BUG_FIXER_SWARM_ONLY = prev;
  }
});
