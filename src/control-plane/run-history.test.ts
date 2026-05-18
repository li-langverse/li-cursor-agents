import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filterProductionRuns,
  isMockCatalogEntry,
  isMockRun,
  shouldPersistRunToHistory,
} from "./run-history.js";

test("isMockRun detects mock backend and runInput.mock", () => {
  assert.equal(isMockRun({ backend: "mock" }), true);
  assert.equal(isMockRun({ backend: "cursor-sdk", runInput: { mock: true } }), true);
  assert.equal(isMockRun({ backend: "cursor-sdk" }), false);
});

test("shouldPersistRunToHistory skips mock unless LI_PERSIST_MOCK_RUNS=1", () => {
  const prev = process.env.LI_PERSIST_MOCK_RUNS;
  delete process.env.LI_PERSIST_MOCK_RUNS;
  assert.equal(
    shouldPersistRunToHistory({
      agentId: "gap_explorer",
      backend: "mock",
      status: "finished",
      durationMs: 1,
      outputPath: "/tmp/x.md",
    }),
    false,
  );
  process.env.LI_PERSIST_MOCK_RUNS = "1";
  assert.equal(
    shouldPersistRunToHistory({
      agentId: "gap_explorer",
      backend: "mock",
      status: "finished",
      durationMs: 1,
      outputPath: "/tmp/x.md",
    }),
    true,
  );
  if (prev === undefined) delete process.env.LI_PERSIST_MOCK_RUNS;
  else process.env.LI_PERSIST_MOCK_RUNS = prev;
});

test("filterProductionRuns drops mock catalog rows", () => {
  const rows = filterProductionRuns([
    {
      run_id: "a",
      agent_id: "x",
      started_at: "2026-01-01T00:00:00Z",
      status: "finished",
      backend: "cursor-sdk",
      md_path: "/data/runs/x-1.md",
    },
    {
      run_id: "b",
      agent_id: "x",
      started_at: "2026-01-01T00:00:00Z",
      status: "finished",
      backend: "mock",
      md_path: "/data/runs/mock/x-2.md",
    },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].run_id, "a");
  assert.equal(isMockCatalogEntry({ run_id: "b", agent_id: "x", started_at: "", status: "", md_path: "/data/runs/mock/b.md" }), true);
});
