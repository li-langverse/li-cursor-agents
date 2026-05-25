import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { statePath } from "../control-plane/paths.js";
import {
  lidbEngineConfigured,
  lidbMockPersistEnabled,
  lidbOrmPersistEnabled,
  lidbPersistControlPlaneState,
} from "./lidb-persist.js";

test("lidbOrmPersistEnabled requires URL and not mock-only", () => {
  process.env.LI_LIDB_URL = "lidb://local/dev";
  delete process.env.LI_LIDB_MOCK;
  assert.equal(lidbEngineConfigured(), true);
  assert.equal(lidbMockPersistEnabled(), false);
  assert.equal(lidbOrmPersistEnabled(), true);
  process.env.LI_LIDB_MOCK = "1";
  assert.equal(lidbOrmPersistEnabled(), false);
  delete process.env.LI_LIDB_URL;
  delete process.env.LI_LIDB_MOCK;
});

test("persistControlPlaneState writes disk mirror when store=lidb mock", async () => {
  const dir = mkdtempSync(join(tmpdir(), "li-lidb-persist-"));
  process.env.LI_CONTROL_PLANE_DIR = dir;
  process.env.LI_CONTROL_PLANE_STORE = "lidb";
  process.env.LI_LIDB_MOCK = "1";
  delete process.env.LI_LIDB_URL;

  const base = {
    version: 1 as const,
    updated_at: "2026-01-01T00:00:00.000Z",
    last_briefing_hash: "",
    last_preflight_at: "",
    supervisor_status: "idle" as const,
    recent_tasks: [],
    last_tick_at: "2026-01-01T00:00:00.000Z",
    runs_total: 0,
  };

  await lidbPersistControlPlaneState(base);

  const { persistControlPlaneState } = await import("./persist.js");
  await persistControlPlaneState({ ...base, runs_total: 7 });

  const onDisk = JSON.parse(readFileSync(statePath(), "utf8")) as { runs_total: number };
  assert.equal(onDisk.runs_total, 7);

  delete process.env.LI_CONTROL_PLANE_DIR;
  delete process.env.LI_CONTROL_PLANE_STORE;
  delete process.env.LI_LIDB_MOCK;
});
