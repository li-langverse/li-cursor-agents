/**
 * E2E: read-only control-plane Postgres (local Supabase).
 * Run: LI_E2E_DB=1 npm run build && LI_E2E_DB=1 node --test dist/e2e/control-plane-db.e2e.js
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadRuntimeEnv } from "../env.js";
import { dbEnabled } from "../db/client.js";
import { runReadOnlyQuery, describeTable } from "../db/read-query.js";
import { buildControlPlaneDbMcpServers, CONTROL_PLANE_DB_MCP_ID } from "../mcp/mcp-config.js";

const e2eDb = process.env.LI_E2E_DB === "1";
const suite = e2eDb ? describe : describe.skip;

suite("control-plane db e2e", () => {
  test("dbEnabled after loadRuntimeEnv", () => {
    loadRuntimeEnv();
    assert.ok(dbEnabled(), "expected supabase configured for LI_E2E_DB=1");
  });

  test("runReadOnlyQuery counts agent_runs", async () => {
    loadRuntimeEnv();
    const r = await runReadOnlyQuery("SELECT count(*)::int AS n FROM agent_runs");
    assert.equal(r.ok, true);
    assert.ok((r.rows?.[0]?.n as number) >= 0);
  });

  test("describeTable agent_runs", async () => {
    const r = await describeTable("agent_runs");
    assert.equal(r.ok, true);
    assert.ok((r.rows?.length ?? 0) >= 5);
  });

  test("rejects mutating SQL", async () => {
    const r = await runReadOnlyQuery("DELETE FROM agent_runs");
    assert.equal(r.ok, false);
  });

  test("MCP config includes li-control-plane-db", () => {
    loadRuntimeEnv();
    const mcp = buildControlPlaneDbMcpServers();
    assert.ok(mcp?.[CONTROL_PLANE_DB_MCP_ID]);
    assert.equal(mcp![CONTROL_PLANE_DB_MCP_ID].type ?? "stdio", "stdio");
  });
});
