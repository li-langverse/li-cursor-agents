import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appendAttributionToBody,
  branchNameForAgentRun,
  formatAttributionComment,
  formatCommitMessageWithAttribution,
  parseAttributionFromText,
  parsePrNumberFromUrl,
  prKeyFromUrl,
} from "./swarm-attribution.js";

test("branchNameForAgentRun encodes agent and run suffix", () => {
  assert.equal(
    branchNameForAgentRun("numerics_researcher", "numerics_researcher-1780030100235"),
    "chore/agent-numerics_researcher-30100235",
  );
});

test("formatAttributionComment round-trips via parseAttributionFromText", () => {
  const attr = {
    run_id: "docs_maintainer-1780030100234",
    agent_id: "docs_maintainer",
    repo: "li-demo",
    org: "li-langverse",
    branch: "chore/agent-docs_maintainer-0100234",
  };
  const body = appendAttributionToBody("## Summary\n- docs touch", attr);
  const parsed = parseAttributionFromText(body);
  assert.ok(parsed);
  assert.equal(parsed!.run_id, attr.run_id);
  assert.equal(parsed!.agent_id, attr.agent_id);
  assert.equal(parsed!.repo, attr.repo);
  assert.equal(parsed!.branch, attr.branch);
});

test("parseAttributionFromText reads git commit trailers", () => {
  const msg = `chore(li-demo): post-hook commit

Li-Agent-Run: bench_improver-1780000000123
Li-Agent-Id: bench_improver
`;
  const parsed = parseAttributionFromText(msg);
  assert.ok(parsed);
  assert.equal(parsed!.run_id, "bench_improver-1780000000123");
  assert.equal(parsed!.agent_id, "bench_improver");
});

test("parseAttributionFromText reads branch name pattern", () => {
  const parsed = parseAttributionFromText("branch chore/agent-swarm_observer-a1b2c3d4 pushed");
  assert.ok(parsed);
  assert.equal(parsed!.agent_id, "swarm_observer");
});

test("formatCommitMessageWithAttribution appends trailers once", () => {
  const msg = formatCommitMessageWithAttribution("chore: touch", {
    run_id: "ci_maintainer-99",
    agent_id: "ci_maintainer",
  });
  assert.match(msg, /Li-Agent-Run: ci_maintainer-99/);
  assert.match(formatCommitMessageWithAttribution(msg, { run_id: "x", agent_id: "y" }), /Li-Agent-Run: ci_maintainer-99/);
});

test("prKeyFromUrl and parsePrNumberFromUrl", () => {
  const url = "https://github.com/li-langverse/li-demo/pull/42";
  assert.equal(prKeyFromUrl(url), "li-demo#42");
  assert.equal(parsePrNumberFromUrl(url), 42);
});

test("formatAttributionComment is stable JSON", () => {
  const c = formatAttributionComment({ run_id: "a-1", agent_id: "a" });
  assert.match(c, /^<!-- li-agent-run: \{/);
});
