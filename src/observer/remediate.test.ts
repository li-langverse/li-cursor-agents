import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildRemediations } from "./remediate.js";
import { DEFAULT_STATE } from "../control-plane/types.js";
import type { AgentRunResult } from "../types.js";

describe("buildRemediations", () => {
  test("dispatches workspace_sweeper when dirty_count > 0", () => {
    const actions = buildRemediations({
      findings: [],
      briefing: { workspace_dirty_sweep: { dirty_count: 2, dirty_repos: [{ repo: "lic" }] } },
      state: { ...DEFAULT_STATE },
      observerState: { retry_counts: {} },
      runs: [],
      needsMetaObserver: false,
    });
    assert.ok(
      actions.some(
        (a) => a.agentId === "workspace_sweeper" && a.reason.includes("workspace_dirty"),
      ),
    );
  });

  test("schedules swarm_observer on preflight failure", () => {
    const actions = buildRemediations({
      findings: [],
      briefing: { preflight_runs: { merge_plan: { exit_code: 1 } } },
      state: { ...DEFAULT_STATE },
      observerState: { retry_counts: {} },
      runs: [],
      needsMetaObserver: false,
    });
    assert.ok(actions.some((a) => a.agentId === "swarm_observer" && a.reason.includes("preflight")));
  });

  test("does not restart async swarm when auto-start disabled", () => {
    const prev = process.env.LI_AUTO_START_ASYNC_SWARM;
    delete process.env.LI_AUTO_START_ASYNC_SWARM;
    try {
      const actions = buildRemediations({
        findings: [],
        briefing: null,
        state: { ...DEFAULT_STATE },
        observerState: { retry_counts: {} },
        runs: [],
        needsMetaObserver: false,
        asyncSwarmActive: false,
      });
      assert.ok(!actions.some((a) => a.kind === "restart_async_swarm"));
    } finally {
      if (prev !== undefined) process.env.LI_AUTO_START_ASYNC_SWARM = prev;
    }
  });
});
