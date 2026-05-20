import { test } from "node:test";
import assert from "node:assert/strict";
import {
  auditRunCompletion,
  extractPrUrls,
  hasNumericsTestEvidence,
} from "./run-completion.js";

test("extractPrUrls finds github PR links", () => {
  const urls = extractPrUrls("Opened https://github.com/li-langverse/lic/pull/42 for review.");
  assert.equal(urls.length, 1);
  assert.match(urls[0], /pull\/42/);
});

test("repo-workflow agent without PR is premature in production", () => {
  const c = auditRunCompletion({
    agentId: "ci_maintainer",
    outputText: "## Summary\n- Did some work\n",
    backend: "cursor-sdk",
    auditContext: { mode: "production", skipPush: false, smokeRun: false },
  });
  assert.equal(c.premature, true);
  assert.ok(c.gaps.some((g) => g.includes("PR URL")));
});

test("agent_kit with PR URL is complete", () => {
  const c = auditRunCompletion({
    agentId: "agent_kit_maintainer",
    outputText: "Done https://github.com/li-langverse/benchmarks/pull/99",
    backend: "cursor-sdk",
    rolloutPrUrls: ["https://github.com/li-langverse/benchmarks/pull/99"],
  });
  assert.equal(c.complete, true);
  assert.equal(c.premature, false);
});

test("numerics_researcher without bench evidence is premature", () => {
  const c = auditRunCompletion({
    agentId: "numerics_researcher",
    outputText: "## Executive summary\n- Researched Horner\n- Filed issue\n",
    backend: "cursor-sdk",
  });
  assert.equal(c.premature, true);
  assert.ok(c.gaps.some((g) => g.includes("bench")));
});

test("autoresearch with li-tests path evidence passes", () => {
  const pr = "https://github.com/li-langverse/lic/pull/100";
  const c = auditRunCompletion({
    agentId: "autoresearch",
    outputText: `Added li-tests/manifest.toml entry horner_pure_li_v2 and benchmark row horner_pure_li. PR: ${pr}`,
    backend: "cursor-sdk",
    rolloutPrUrls: [pr],
  });
  assert.equal(c.premature, false);
  assert.ok(hasNumericsTestEvidence("docs/numerics/studies/foo.md"));
});
