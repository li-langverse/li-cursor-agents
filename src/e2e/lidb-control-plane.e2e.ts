/**
 * E2E: lidb control-plane harness (mock liq + disk-backed persist stub).
 * Run: LI_CONTROL_PLANE_STORE=lidb LI_E2E_LIDB=1 LI_LIDB_MOCK=1 npm run test:e2e:lidb
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  assertStoreReady,
  configuredStore,
  exportDiskCacheEnabled,
  lidbMockEnabled,
  lidbReady,
  useLidbStore,
} from "../db/client.js";
import { runLiqQuery, schemaSnapshot } from "../db/liq-query.js";
import {
  buildControlPlaneLiqMcpServers,
  CONTROL_PLANE_LIQ_MCP_ID,
} from "../mcp/mcp-config.js";

/** Reasons the full lidb e2e suite is skipped (for CI logs / harness docs). */
export function lidbE2eSkipReasons(): string[] {
  const reasons: string[] = [];
  if (process.env.LI_E2E_LIDB !== "1") reasons.push("LI_E2E_LIDB!=1");
  if (configuredStore() !== "lidb") reasons.push(`LI_CONTROL_PLANE_STORE=${configuredStore()} (need lidb)`);
  if (!lidbMockEnabled() && !process.env.LI_LIDB_URL?.trim() && !process.env.LI_DATA_DIR?.trim()) {
    reasons.push("set LI_LIDB_MOCK=1, LI_LIDB_URL, or LI_DATA_DIR");
  }
  return reasons;
}

const e2eLidb = process.env.LI_E2E_LIDB === "1" && useLidbStore();
const suite = e2eLidb ? describe : describe.skip;

suite("lidb control-plane e2e", () => {
  test("lidbE2eSkipReasons empty when suite runs", () => {
    process.env.LI_LIDB_MOCK = process.env.LI_LIDB_MOCK ?? "1";
    assert.deepEqual(lidbE2eSkipReasons(), []);
  });

  test("assertStoreReady and lidbReady with mock harness", () => {
    process.env.LI_LIDB_MOCK = "1";
    assert.ok(lidbReady());
    assert.doesNotThrow(() => assertStoreReady());
    assert.ok(exportDiskCacheEnabled());
  });

  test("runLiqQuery read agent_runs returns mock row", async () => {
    process.env.LI_LIDB_MOCK = "1";
    const r = await runLiqQuery("read agent_runs limit 5");
    assert.equal(r.ok, true);
    assert.equal(r.mock, true);
    assert.ok((r.row_count ?? 0) >= 1);
  });

  test("schemaSnapshot lists agent_runs", () => {
    const snap = schemaSnapshot();
    assert.ok(snap.tables.some((t) => t.name === "agent_runs"));
  });

  test("MCP config includes li-control-plane-liq", () => {
    process.env.LI_CONTROL_PLANE_LIQ_MCP = "1";
    const mcp = buildControlPlaneLiqMcpServers();
    assert.ok(mcp?.[CONTROL_PLANE_LIQ_MCP_ID]);
    assert.equal(mcp![CONTROL_PLANE_LIQ_MCP_ID].type ?? "stdio", "stdio");
  });

  test.todo("persist agent_runs via liorm when lidb engine accepts control-plane schema");
  test.todo("runLiqQuery against LI_LIDB_URL without LI_LIDB_MOCK when PH-DB-2 compiler lands");
});
