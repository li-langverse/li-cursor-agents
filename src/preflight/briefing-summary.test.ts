import { test } from "node:test";
import assert from "node:assert/strict";
import { compactBriefingForPrompt } from "./briefing-summary.js";

test("compactBriefingForPrompt is much smaller than full briefing", () => {
  const full = {
    generated_at: "2026-05-17T18:00Z",
    recommended_agents: [{ agent: "bench_improver", reason: "red" }],
    ecosystem_audit: { benchmarks: { red: [{ id: "horner_pure_li" }] } },
    issue_triage: { repos: Array.from({ length: 50 }, (_, i) => ({ repo: `r${i}` })) },
    preflight_runs: {
      ecosystem_audit: { exit_code: 0 },
      org_ci_audit: { exit_code: 1, stdout_tail: "x".repeat(5000) },
    },
  };
  const compact = compactBriefingForPrompt(full);
  const fullLen = JSON.stringify(full, null, 2).length;
  assert.ok(compact.length < fullLen / 2, `compact=${compact.length} full=${fullLen}`);
  assert.match(compact, /horner_pure_li/);
  assert.match(compact, /bench_improver/);
});
