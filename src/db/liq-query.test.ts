import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReadLiq, runLiqQuery, schemaSnapshot } from "./liq-query.js";

test("schemaSnapshot lists control-plane tables", () => {
  const snap = schemaSnapshot();
  assert.equal(snap.store, "mock-lidb");
  assert.ok(snap.tables.some((t) => t.name === "agent_runs"));
  assert.match(snap.markdown, /agent_runs/);
});

test("parseReadLiq accepts read agent_runs limit 20", () => {
  const p = parseReadLiq("read agent_runs limit 20");
  assert.equal(p.ok, true);
  if (p.ok) {
    assert.equal(p.table, "agent_runs");
    assert.equal(p.limit, 20);
  }
});

test("parseReadLiq rejects mutating liq", () => {
  const p = parseReadLiq("delete from agent_runs");
  assert.equal(p.ok, false);
});

test("runLiqQuery returns mock row without engine", async () => {
  delete process.env.LI_LIDB_URL;
  delete process.env.LI_LIDB_MOCK;
  const r = await runLiqQuery("read agent_runs limit 1");
  assert.equal(r.ok, true);
  assert.equal(r.mock, true);
  assert.equal(r.row_count, 1);
});
