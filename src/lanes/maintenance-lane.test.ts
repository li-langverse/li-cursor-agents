import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";
import { isMaintenanceLaneEnabled, maintenanceLaneTick } from "./maintenance-lane.js";

test("isMaintenanceLaneEnabled defaults to true", () => {
  const prev = process.env.LI_MAINTENANCE_LANE_ENABLED;
  delete process.env.LI_MAINTENANCE_LANE_ENABLED;
  assert.equal(isMaintenanceLaneEnabled(), true);
  process.env.LI_MAINTENANCE_LANE_ENABLED = "0";
  assert.equal(isMaintenanceLaneEnabled(), false);
  if (prev === undefined) delete process.env.LI_MAINTENANCE_LANE_ENABLED;
  else process.env.LI_MAINTENANCE_LANE_ENABLED = prev;
});

test("maintenanceLaneTick writes enriched briefing to agents package", async () => {
  const tick = await maintenanceLaneTick({
    benchmarksRoot: join(agentsPackageRoot(), "fixtures", "e2e-benchmarks"),
    skipSlowPreflight: true,
  });
  assert.equal(tick.ok, true, tick.skip_reason);
  const local = join(agentsPackageRoot(), "data", "latest", "agent-briefing.json");
  assert.ok(existsSync(local));
});
