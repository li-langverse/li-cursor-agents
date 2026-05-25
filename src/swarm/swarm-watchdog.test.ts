import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import {
  planLoopsHealthy,
  writeSwarmHealthJson,
  type SwarmInfrastructureHealth,
} from "./swarm-health-file.js";
import { buildRemediations } from "../observer/remediate.js";
import { DEFAULT_STATE } from "../control-plane/types.js";

describe("swarm watchdog health file", () => {
  test("writeSwarmHealthJson writes plan loop rows", () => {
    const dir = mkdtempSync(join(tmpdir(), "li-swarm-health-"));
    const prev = process.env.LI_CONTROL_PLANE_DIR;
    process.env.LI_CONTROL_PLANE_DIR = dir;
    try {
      const payload: SwarmInfrastructureHealth = {
        written_at: new Date().toISOString(),
        disable_autostart: false,
        async_swarm: {
          process_active: false,
          detached_child_active: false,
          systemd_dashboard: "active",
          systemd_async_swarm: null,
        },
        plan_loops: [
          { unit: "li-swarm-observer-plan-loop.service", active_state: "active" },
          { unit: "li-security-research-plan-loop.service", active_state: "failed" },
        ],
        plan_loops_healthy: false,
      };
      const path = writeSwarmHealthJson(payload);
      const parsed = JSON.parse(readFileSync(path, "utf8")) as SwarmInfrastructureHealth;
      assert.equal(parsed.plan_loops.length, 2);
      assert.equal(parsed.plan_loops_healthy, false);
    } finally {
      if (prev === undefined) delete process.env.LI_CONTROL_PLANE_DIR;
      else process.env.LI_CONTROL_PLANE_DIR = prev;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("planLoopsHealthy accepts active and activating", () => {
    assert.equal(
      planLoopsHealthy([
        { unit: "a.service", active_state: "active" },
        { unit: "b.service", active_state: "activating" },
      ]),
      true,
    );
    assert.equal(planLoopsHealthy([{ unit: "a.service", active_state: "failed" }]), false);
  });

  test("buildRemediations schedules restart_async_swarm when swarm inactive", () => {
    const prev = process.env.LI_AUTO_START_ASYNC_SWARM;
    process.env.LI_AUTO_START_ASYNC_SWARM = "1";
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
      assert.ok(actions.some((a) => a.kind === "restart_async_swarm"));
    } finally {
      if (prev === undefined) delete process.env.LI_AUTO_START_ASYNC_SWARM;
      else process.env.LI_AUTO_START_ASYNC_SWARM = prev;
    }
  });
});
