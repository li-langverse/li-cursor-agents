import { test } from "node:test";
import assert from "node:assert/strict";
import {
  branchNameForAgentRun,
  formatCommitMessageWithAttribution,
  defaultSwarmPrBody,
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

test("defaultSwarmPrBody includes run_id as plain markdown not HTML comment", () => {
  const body = defaultSwarmPrBody("docs_maintainer", {
    run_id: "docs_maintainer-100",
    agent_id: "docs_maintainer",
    branch: "chore/agent-docs_maintainer-00000100",
  });
  assert.match(body, /docs_maintainer-100/);
  assert.doesNotMatch(body, /<!--/);
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
  const gh = "https://github.com/li-langverse/li-demo/pull/42";
  assert.equal(prKeyFromUrl(gh), "li-demo#42");
  assert.equal(parsePrNumberFromUrl(gh), 42);
  const gl = "https://gitlab.lilangverse.xyz/li-langverse/lic/-/merge_requests/7";
  assert.equal(prKeyFromUrl(gl), "lic#7");
  assert.equal(parsePrNumberFromUrl(gl), 7);
});
