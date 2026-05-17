import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTaskQueue, shouldSkipDispatch, taskFingerprint } from "./task-queue.js";

test("taskFingerprint is stable", () => {
  assert.equal(
    taskFingerprint("pr_alignment", "open PRs"),
    taskFingerprint("pr_alignment", "open PRs"),
  );
});

test("buildTaskQueue respects cooldown for same briefing hash", () => {
  const fp = taskFingerprint("gap_explorer", "missing std");
  const state = {
    version: 1 as const,
    updated_at: "",
    last_briefing_hash: "abc",
    last_preflight_at: "",
    supervisor_status: "idle" as const,
    recent_tasks: [
      {
        fingerprint: fp,
        agentId: "gap_explorer" as const,
        reason: "missing std",
        finished_at: new Date().toISOString(),
        status: "finished",
        briefing_hash: "abc",
      },
    ],
    runs_total: 1,
    last_tick_at: "",
  };
  const briefing = {
    recommended_agents: [{ agent: "gap_explorer", reason: "missing std" }],
  };
  const { tasks, skippedCooldown } = buildTaskQueue(briefing, state, {
    briefingHash: "abc",
    cooldownMs: 60_000,
    maxTasks: 3,
  });
  assert.equal(tasks.length, 0);
  assert.equal(skippedCooldown, 1);
});

test("shouldSkipDispatch when unchanged and no tasks", () => {
  const state = {
    version: 1 as const,
    updated_at: "",
    last_briefing_hash: "same",
    last_preflight_at: "",
    supervisor_status: "idle" as const,
    recent_tasks: [],
    runs_total: 0,
    last_tick_at: "",
  };
  assert.equal(shouldSkipDispatch(state, "same", 0, false), true);
  assert.equal(shouldSkipDispatch(state, "same", 0, true), false);
});
