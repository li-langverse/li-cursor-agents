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

test("enrichBriefingFile merges UX audits into structured implementation_queue", async () => {
  const root = mkdtempSync(join(tmpdir(), "li-brief-ux-"));
  const latest = join(root, "data", "latest");
  mkdirSync(latest, { recursive: true });
  const path = join(latest, "agent-briefing.json");
  writeFileSync(
    path,
    JSON.stringify({
      generated_at: "2026-05-19T12:00:00Z",
      ui_audit: { summary: { failing: 1 } },
      ux_audit: { targets: [{ id: "docs", status: "fail" }] },
      remediation_manifest: {
        implementation_queue: [{ kind: "ui_remediation", reason: "fixture contrast" }],
      },
    }),
    "utf8",
  );

  const result = await enrichBriefingFile({
    benchmarksRoot: root,
    mirrorToAgentsPackage: false,
  });
  assert.equal(result.ok, true);
  const out = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  const iq = out.implementation_queue as { work_queue: unknown[]; sources: string[] };
  assert.ok(iq && Array.isArray(iq.work_queue));
  assert.ok(iq.sources.includes("remediation_manifest"));
  assert.ok(iq.work_queue.some((w) => (w as { reason?: string }).reason === "fixture contrast"));
  const agents = (out.recommended_agents as Array<{ agent: string }>).map((r) => r.agent);
  assert.ok(agents.includes("docs_ui_tester"));
  assert.ok(agents.includes("docs_ux_tester"));
  rmSync(root, { recursive: true, force: true });
});
