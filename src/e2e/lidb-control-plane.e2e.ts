/**
 * E2E: lidb control-plane harness (mock liq + optional real liorm).
 * Mock: LI_CONTROL_PLANE_STORE=lidb LI_E2E_LIDB=1 LI_LIDB_MOCK=1 npm run test:e2e:lidb
 * Engine: LI_E2E_LIDB_ENGINE=1 LI_LIDB_REPO=../lidb npm run test:e2e:lidb-engine
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
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
import { probeLidbEngine, runLidbBridge, clearLidbProbeCache } from "../db/lidb-liorm.js";
import { upsertAgentRunLidb } from "../db/lidb-persist.js";
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
const engineSuite = process.env.LI_E2E_LIDB_ENGINE === "1" ? describe : describe.skip;

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
    clearLidbProbeCache();
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
});

engineSuite("lidb control-plane engine e2e", () => {
  const e2eDataDir = join(tmpdir(), "li-cursor-agents-lidb-e2e");
  mkdirSync(e2eDataDir, { recursive: true });
  process.env.LI_DATA_DIR = e2eDataDir;
  process.env.LIDB_DATA_DIR = e2eDataDir;

  test("probeLidbEngine when lidb_embed available", async () => {
    delete process.env.LI_LIDB_MOCK;
    clearLidbProbeCache();
    const ok = await probeLidbEngine();
    if (!ok) {
      assert.fail("lidb_embed probe failed — set LI_LIDB_REPO to sibling lidb and build lidb_embed");
    }
    assert.equal(ok, true);
  });

  test("runLiqQuery read agent_runs via liorm without mock", async () => {
    delete process.env.LI_LIDB_MOCK;
    process.env.LI_LIDB_URL = process.env.LI_LIDB_URL ?? "lidb://embedded";
    clearLidbProbeCache();
    const r = await runLiqQuery("read agent_runs limit 5");
    assert.equal(r.ok, true);
    assert.equal(r.mock, false);
  });

  test("persist agent_runs via liorm bridge", async () => {
    delete process.env.LI_LIDB_MOCK;
    process.env.LI_LIDB_URL = process.env.LI_LIDB_URL ?? "lidb://embedded";
    clearLidbProbeCache();
    const runId = `e2e-wp-e-${Date.now()}`;
    await upsertAgentRunLidb({
      run: {
        agentId: "e2e",
        backend: "mock",
        status: "finished",
        outputPath: `/tmp/${runId}.md`,
        outputText: "wp-e persist probe",
        durationMs: 1,
      },
    });
    const read = await runLidbBridge("read_liq", `read agent_runs limit 50`);
    assert.equal(read.ok, true);
    assert.ok(read.rows?.some((row) => row.run_id === runId || row.id === runId));
  });

  test("persist handoffs via liorm bridge", async () => {
    delete process.env.LI_LIDB_MOCK;
    process.env.LI_LIDB_URL = process.env.LI_LIDB_URL ?? "lidb://embedded";
    clearLidbProbeCache();
    const handoffId = `e2e-handoff-${Date.now()}`;
    const { runLidbBridge } = await import("../db/lidb-liorm.js");
    const write = await runLidbBridge(
      "upsert_handoff",
      JSON.stringify({
        handoff_id: handoffId,
        from_agent: "e2e-from",
        to_agents: ["e2e-to"],
        status: "pending_placement",
        briefing_hash: "e2e-brief",
        source_run_id: "e2e-run",
        work: { note: "wp-e handoff probe" },
      }),
    );
    assert.equal(write.ok, true);
    const read = await runLidbBridge(
      "exec_sql",
      "SELECT handoff_id FROM agent_handoffs WHERE handoff_id = ?",
      JSON.stringify([handoffId]),
    );
    assert.equal(read.ok, true);
    assert.ok(read.rows?.some((r) => r.handoff_id === handoffId));
  });

  test("persist control_plane_reports via liorm bridge", async () => {
    delete process.env.LI_LIDB_MOCK;
    process.env.LI_LIDB_URL = process.env.LI_LIDB_URL ?? "lidb://embedded";
    clearLidbProbeCache();
    const { runLidbBridge } = await import("../db/lidb-liorm.js");
    const reportId = `e2e-report-${Date.now()}`;
    const write = await runLidbBridge(
      "upsert_control_plane_report",
      JSON.stringify({
        id: reportId,
        generated_at: new Date().toISOString(),
        briefing_hash: "e2e-brief-report",
        payload: { probe: true },
        is_latest: true,
      }),
    );
    assert.equal(write.ok, true);
    const read = await runLidbBridge(
      "exec_sql",
      "SELECT id FROM control_plane_reports WHERE id = ?",
      JSON.stringify([reportId]),
    );
    assert.equal(read.ok, true);
    assert.ok(read.rows?.some((r) => r.id === reportId));
  });
});
