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

test("repo-workflow agent without PR is premature", () => {
  const c = auditRunCompletion({
    agentId: "ci_maintainer",
    outputText: "## Summary\n- Did some work\n",
    backend: "cursor-sdk",
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

test("mentioning trusted.lean without claiming an edit is not a gap", () => {
  const c = auditRunCompletion({
    agentId: "code_implementer",
    outputText:
      "Queue references trusted.lean policy; no file edits this run. https://github.com/li-langverse/lic/pull/1",
    backend: "cursor-sdk",
    rolloutPrUrls: ["https://github.com/li-langverse/lic/pull/1"],
  });
  assert.ok(!c.gaps.some((g) => g.includes("trusted.lean")));
});

test("code_implementer SDK matrix smoke may mention trusted.lean read-only", () => {
  const prev = process.env.LI_SDK_MATRIX_MODE;
  process.env.LI_SDK_MATRIX_MODE = "sequential";
  try {
    const c = auditRunCompletion({
      agentId: "code_implementer",
      outputText: [
        "OK- Reviewed implementation queue including trusted.lean policy (read-only smoke).",
        "No edits; queue item std.io on lic is top priority for a production run.",
        "## Agent deliverable",
        "- [x] SDK matrix smoke completed",
      ].join("\n"),
      backend: "cursor-sdk",
    });
    assert.equal(c.premature, false);
    assert.equal(c.complete, true);
  } finally {
    if (prev === undefined) delete process.env.LI_SDK_MATRIX_MODE;
    else process.env.LI_SDK_MATRIX_MODE = prev;
  }
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
