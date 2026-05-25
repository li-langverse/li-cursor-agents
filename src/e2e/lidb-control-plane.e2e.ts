/**
 * E2E stub: control-plane on **lidb** (PH-DB-10).
 *
 * Today the stack persists via Supabase (`LI_CONTROL_PLANE_STORE=supabase`, default)
 * or JSON mirror (`disk`). PH-DB-10 migrates persistence + read paths to embedded
 * **lidb** behind `lis db start`, with agent exploration via **liq** MCP instead of
 * raw Postgres (`src/db/read-query.ts`, `li-control-plane-db` MCP).
 *
 * Enable when store + engine land:
 *   LI_CONTROL_PLANE_STORE=lidb LI_E2E_LIDB=1 npm run build
 *   LI_CONTROL_PLANE_STORE=lidb LI_E2E_LIDB=1 node --test dist/e2e/lidb-control-plane.e2e.js
 *
 * @see docs/plans/lidb-migration-control-plane.md
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadRuntimeEnv } from "../env.js";

const lidbStore = process.env.LI_CONTROL_PLANE_STORE?.trim().toLowerCase() === "lidb";
const e2eLidb = process.env.LI_E2E_LIDB === "1";
const suite = lidbStore && e2eLidb ? describe : describe.skip;

suite("lidb control-plane e2e (PH-DB-10)", () => {
  test("loadRuntimeEnv with LI_CONTROL_PLANE_STORE=lidb", () => {
    loadRuntimeEnv();
    assert.equal(process.env.LI_CONTROL_PLANE_STORE?.trim().toLowerCase(), "lidb");
  });

  test.todo("persist agent_runs row via lidb (replaces Supabase REST persist)");
  test.todo("read agent_runs via liq MCP (replaces runReadOnlyQuery / li-control-plane-db)");
  test.todo("reject mutating liq / raw SQL outside allowlisted tables");
  test.todo("MCP config includes li-control-plane-liq when LI_CONTROL_PLANE_STORE=lidb");
});
