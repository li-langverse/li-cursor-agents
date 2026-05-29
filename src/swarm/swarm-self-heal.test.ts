import assert from "node:assert/strict";
import test from "node:test";
import { buildExternalSelfHealActions } from "./swarm-self-heal.js";
import type { SwarmInfrastructureHealth } from "./swarm-health-file.js";

function health(
  overrides: Partial<SwarmInfrastructureHealth["async_swarm"]>,
): SwarmInfrastructureHealth {
  return {
    written_at: new Date().toISOString(),
    disable_autostart: false,
    async_swarm: {
      process_active: false,
      detached_child_active: false,
      systemd_dashboard: "active",
      systemd_async_swarm: "inactive",
      ...overrides,
    },
    plan_loops: [],
    plan_loops_healthy: true,
  };
}

test("buildExternalSelfHealActions restarts when unit inactive", () => {
  const prev = process.env.LI_AUTO_START_ASYNC_SWARM;
  process.env.LI_AUTO_START_ASYNC_SWARM = "1";
  try {
    const actions = buildExternalSelfHealActions(
      health({ systemd_async_swarm: "inactive", process_active: false }),
    );
    assert.equal(actions.length, 1);
    assert.equal(actions[0]?.kind, "restart_async_swarm");
  } finally {
    if (prev === undefined) delete process.env.LI_AUTO_START_ASYNC_SWARM;
    else process.env.LI_AUTO_START_ASYNC_SWARM = prev;
  }
});

test("buildExternalSelfHealActions force-restarts when deactivating", () => {
  const prev = process.env.LI_AUTO_START_ASYNC_SWARM;
  process.env.LI_AUTO_START_ASYNC_SWARM = "1";
  try {
    const actions = buildExternalSelfHealActions(
      health({ systemd_async_swarm: "deactivating", process_active: false }),
    );
    assert.equal(actions[0]?.kind, "restart_async_swarm");
    assert.match(actions[0]?.fingerprintSuffix ?? "", /force/);
  } finally {
    if (prev === undefined) delete process.env.LI_AUTO_START_ASYNC_SWARM;
    else process.env.LI_AUTO_START_ASYNC_SWARM = prev;
  }
});
