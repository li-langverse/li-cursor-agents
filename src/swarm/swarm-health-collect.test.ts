import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { collectSwarmInfrastructureHealth } from "./swarm-health-collect.js";
import { writeSwarmHealthJson } from "./swarm-health-file.js";

test("collectSwarmInfrastructureHealth + writeSwarmHealthJson produces valid JSON", async () => {
  const dir = mkdtempSync(join(tmpdir(), "li-swarm-health-collect-"));
  const prev = process.env.LI_CONTROL_PLANE_DIR;
  process.env.LI_CONTROL_PLANE_DIR = dir;
  try {
    const payload = await collectSwarmInfrastructureHealth();
    assert.ok(payload.written_at);
    assert.equal(typeof payload.disable_autostart, "boolean");
    assert.equal(typeof payload.plan_loops_healthy, "boolean");

    const path = writeSwarmHealthJson(payload);
    const parsed = JSON.parse(readFileSync(path, "utf8")) as typeof payload;
    assert.equal(parsed.written_at, payload.written_at);
    assert.ok(parsed.async_swarm);
    assert.ok(Array.isArray(parsed.plan_loops));
  } finally {
    if (prev === undefined) delete process.env.LI_CONTROL_PLANE_DIR;
    else process.env.LI_CONTROL_PLANE_DIR = prev;
    rmSync(dir, { recursive: true, force: true });
  }
});
