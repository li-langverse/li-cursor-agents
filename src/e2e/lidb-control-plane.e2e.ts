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
import { runLiqQuery, schemaSnapshot } from "../db/liq-query.js";
import {
  buildControlPlaneLiqMcpServers,
  CONTROL_PLANE_LIQ_MCP_ID,
} from "../mcp/mcp-config.js";

const storeRaw = process.env.LI_CONTROL_PLANE_STORE?.trim().toLowerCase();
const lidbStore = storeRaw === "lidb";
const e2eLidb = process.env.LI_E2E_LIDB === "1";

/** Human-readable reasons the full lidb e2e suite is skipped. */
export function lidbE2eSkipReasons(): string[] {
  const reasons: string[] = [];
  if (!lidbStore) {
    reasons.push(
      `LI_CONTROL_PLANE_STORE=${storeRaw ?? "(unset)"} — expected lidb (also: supabase | disk)`,
    );
  }
  if (!e2eLidb) {
    reasons.push("LI_E2E_LIDB is not 1 — set LI_E2E_LIDB=1 to run lidb integration tests");
  }
  if (lidbStore && e2eLidb && !process.env.LI_LIDB_URL?.trim() && process.env.LI_LIDB_MOCK !== "1") {
    reasons.push(
      "lidb engine not reachable — run lis db start or set LI_LIDB_URL; mock path uses stub rows without LI_LIDB_URL",
    );
  }
  return reasons;
}

const suite = lidbStore && e2eLidb ? describe : describe.skip;

test("lidb e2e skip reasons when suite disabled", () => {
  if (lidbStore && e2eLidb) return;
  const reasons = lidbE2eSkipReasons();
  assert.ok(reasons.length >= 1, "expected at least one skip reason");
  assert.ok(
    reasons.some((r) => r.includes("LI_CONTROL_PLANE_STORE") || r.includes("LI_E2E_LIDB")),
    reasons.join("; "),
  );
});

suite("lidb control-plane e2e (PH-DB-10)", () => {
  test("loadRuntimeEnv with LI_CONTROL_PLANE_STORE=lidb", () => {
    loadRuntimeEnv();
    assert.equal(process.env.LI_CONTROL_PLANE_STORE?.trim().toLowerCase(), "lidb");
  });

  test("schema_snapshot via liq-query mock", () => {
    const snap = schemaSnapshot();
    assert.equal(snap.store, "mock-lidb");
    assert.ok(snap.tables.some((t) => t.name === "agent_runs"));
  });

  test("read agent_runs via liq mock (replaces runReadOnlyQuery)", async () => {
    delete process.env.LI_LIDB_URL;
    const r = await runLiqQuery("read agent_runs limit 5");
    assert.equal(r.ok, true);
    assert.equal(r.mock, true);
    assert.ok((r.row_count ?? 0) >= 1);
  });

  test("reject mutating liq outside allowlist", async () => {
    const del = await runLiqQuery("delete from agent_runs");
    assert.equal(del.ok, false);
    const bad = await runLiqQuery("read not_a_table limit 1");
    assert.equal(bad.ok, false);
  });

  test("MCP config includes li-control-plane-liq when LI_CONTROL_PLANE_STORE=lidb", () => {
    loadRuntimeEnv();
    const mcp = buildControlPlaneLiqMcpServers();
    assert.ok(mcp?.[CONTROL_PLANE_LIQ_MCP_ID]);
    assert.equal(mcp![CONTROL_PLANE_LIQ_MCP_ID].type ?? "stdio", "stdio");
  });

  test.todo("persist agent_runs row via lidb (replaces Supabase REST persist)");
  test.todo("read agent_runs against real lidb engine (LI_LIDB_URL / lis db start)");
  test.todo("liq security harness parity with lidb/tests/security/");
});
