import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { enrichBriefingFile } from "./enrich-briefing-file.js";

test("enrichBriefingFile adds swarm scorecard keys", async () => {
  const root = mkdtempSync(join(tmpdir(), "li-brief-"));
  const latest = join(root, "data", "latest");
  mkdirSync(latest, { recursive: true });
  const path = join(latest, "agent-briefing.json");
  writeFileSync(path, JSON.stringify({ generated_at: "2026-05-17T00:00:00Z" }), "utf8");

  const result = await enrichBriefingFile({
    benchmarksRoot: root,
    mirrorToAgentsPackage: false,
  });
  assert.equal(result.ok, true);
  const out = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  assert.ok(out.swarm_scorecard);
  assert.ok(out.research_goals_status);
  assert.ok(out.handoff_audit);
  assert.ok(out.swarm_enriched_at);
  rmSync(root, { recursive: true, force: true });
});
