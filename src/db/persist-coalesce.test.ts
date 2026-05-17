import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { statePath } from "../control-plane/paths.js";

test("persistControlPlaneState coalesces rapid writes to latest on disk", async () => {
  const dir = mkdtempSync(join(tmpdir(), "li-persist-coalesce-"));
  process.env.LI_CONTROL_PLANE_DIR = dir;
  process.env.LI_CONTROL_PLANE_STORE = "disk";
  delete process.env.SUPABASE_URL;

  const { persistControlPlaneState } = await import("./persist.js");
  const base = {
    version: 1 as const,
    updated_at: "2026-01-01T00:00:00.000Z",
    last_briefing_hash: "",
    last_preflight_at: "",
    supervisor_status: "idle" as const,
    recent_tasks: [],
    last_tick_at: "2026-01-01T00:00:00.000Z",
  };

  await Promise.all([
    persistControlPlaneState({ ...base, runs_total: 1 }),
    persistControlPlaneState({ ...base, runs_total: 2 }),
    persistControlPlaneState({ ...base, runs_total: 99 }),
  ]);

  const onDisk = JSON.parse(readFileSync(statePath(), "utf8")) as { runs_total: number };
  assert.equal(onDisk.runs_total, 99);

  delete process.env.LI_CONTROL_PLANE_DIR;
  delete process.env.LI_CONTROL_PLANE_STORE;
});
