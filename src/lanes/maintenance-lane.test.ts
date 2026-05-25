import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";
import { maintenanceLaneTick } from "./maintenance-lane.js";

test("maintenanceLaneTick writes enriched briefing to agents package", async () => {
  const tick = await maintenanceLaneTick({
    benchmarksRoot: join(agentsPackageRoot(), "fixtures", "e2e-benchmarks"),
    skipSlowPreflight: true,
  });
  assert.equal(tick.ok, true, tick.skip_reason);
  const local = join(agentsPackageRoot(), "data", "latest", "agent-briefing.json");
  assert.ok(existsSync(local));
});
