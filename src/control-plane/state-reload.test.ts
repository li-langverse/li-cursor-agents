import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("reloadStateFromDiskIfNewer picks up child-written state", async () => {
  const dir = mkdtempSync(join(tmpdir(), "li-cp-state-"));
  process.env.LI_CONTROL_PLANE_DIR = dir;
  process.env.LI_CONTROL_PLANE_STORE = "disk";
  process.env.LI_EXPORT_DISK_CACHE = "1";

  writeFileSync(
    join(dir, "state.json"),
    JSON.stringify({
      version: 1,
      updated_at: "2026-01-01T00:00:00.000Z",
      last_briefing_hash: "",
      last_preflight_at: "",
      supervisor_status: "idle",
      recent_tasks: [],
      runs_total: 0,
      last_tick_at: "2026-01-01T00:00:00.000Z",
    }),
    "utf8",
  );

  const { reloadStateFromDiskIfNewer, loadState } = await import("./state.js");
  assert.equal(loadState().runs_total, 0);

  writeFileSync(
    join(dir, "state.json"),
    JSON.stringify({
      version: 1,
      updated_at: "2026-01-02T00:00:00.000Z",
      last_briefing_hash: "abc",
      last_preflight_at: "",
      supervisor_status: "idle",
      recent_tasks: [],
      runs_total: 5,
      last_tick_at: "2026-01-02T00:05:00.000Z",
    }),
    "utf8",
  );

  const reloaded = reloadStateFromDiskIfNewer();
  assert.equal(reloaded.last_tick_at, "2026-01-02T00:05:00.000Z");
  assert.equal(reloaded.runs_total, 5);
  assert.equal(loadState().runs_total, 5);

  delete process.env.LI_CONTROL_PLANE_DIR;
  delete process.env.LI_CONTROL_PLANE_STORE;
  delete process.env.LI_EXPORT_DISK_CACHE;
});

test("reloadStateIfNewer merges supervisor IPC mirror when store=supabase", async () => {
  const dir = mkdtempSync(join(tmpdir(), "li-cp-supabase-mirror-"));
  process.env.LI_CONTROL_PLANE_DIR = dir;
  process.env.LI_CONTROL_PLANE_STORE = "supabase";
  delete process.env.SUPABASE_URL;

  const { reloadStateIfNewer } = await import("./state.js");

  writeFileSync(
    join(dir, "state.json"),
    JSON.stringify({
      version: 1,
      updated_at: "2026-01-01T00:00:00.000Z",
      last_briefing_hash: "",
      last_preflight_at: "",
      supervisor_status: "running_agent",
      current_supervisor_agent: "gap_explorer",
      recent_tasks: [],
      runs_total: 0,
      last_tick_at: "2026-01-01T00:00:00.000Z",
    }),
    "utf8",
  );

  writeFileSync(
    join(dir, "state.json"),
    JSON.stringify({
      version: 1,
      updated_at: "2026-01-02T00:00:00.000Z",
      last_briefing_hash: "new",
      last_preflight_at: "",
      supervisor_status: "running_agent",
      current_supervisor_agent: "bench_improver",
      recent_tasks: [],
      runs_total: 1,
      last_tick_at: "2026-01-02T00:01:00.000Z",
    }),
    "utf8",
  );

  const reloaded = await reloadStateIfNewer();
  assert.equal(reloaded.current_supervisor_agent, "bench_improver");

  delete process.env.LI_CONTROL_PLANE_DIR;
  delete process.env.LI_CONTROL_PLANE_STORE;
});
