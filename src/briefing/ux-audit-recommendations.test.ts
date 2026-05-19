import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mergeRemediationQueueFromManifest,
  mergeUxAuditRecommendations,
  uxAuditRecommendations,
} from "./ux-audit-recommendations.js";

test("uxAuditRecommendations suggests testers when audits fail", () => {
  const rec = uxAuditRecommendations({
    ui_audit: { summary: { failing: 2 } },
    ux_audit: { targets: [{ status: "fail" }] },
  });
  const agents = new Set(rec.map((r) => r.agent));
  assert.ok(agents.has("docs_ui_tester"));
  assert.ok(agents.has("gui_ux_tester"));
  assert.ok(agents.has("docs_ux_tester"));
});

test("mergeUxAuditRecommendations prepends without duplicates", () => {
  const out = mergeUxAuditRecommendations({
    recommended_agents: [{ agent: "docs_ui_tester", reason: "existing" }],
    ui_audit: { summary: { failing: 1 } },
    ux_audit: { targets: [] },
  });
  const agents = (out.recommended_agents as Array<{ agent: string }>).map((r) => r.agent);
  assert.equal(agents.filter((a) => a === "docs_ui_tester").length, 1);
  assert.ok(agents.includes("gui_ui_tester"));
});

test("mergeRemediationQueueFromManifest uses structured implementation_queue", () => {
  const out = mergeRemediationQueueFromManifest({
    implementation_queue: {
      work_queue: [{ kind: "bug", reason: "existing" }],
      sources: ["ci_bug_triage"],
    },
    remediation_manifest: {
      implementation_queue: [{ kind: "ui_remediation", reason: "contrast fail" }],
    },
  });
  const iq = out.implementation_queue as { work_queue: Array<{ reason?: string }>; sources: string[] };
  assert.equal(iq.work_queue.length, 2);
  assert.ok(iq.sources.includes("remediation_manifest"));
  assert.ok(iq.work_queue.some((w) => w.reason === "contrast fail"));
});
