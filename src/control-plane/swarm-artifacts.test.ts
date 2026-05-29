import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSwarmArtifactsIndex } from "./swarm-artifacts.js";
import type { RunCatalogEntry } from "./runs-catalog.js";

test("buildSwarmArtifactsIndex collects meta attribution and supports lookup", () => {
  const runs: RunCatalogEntry[] = [
    {
      run_id: "docs_maintainer-100",
      agent_id: "docs_maintainer",
      started_at: "2026-05-29T00:00:00Z",
      status: "finished",
      md_path: "/tmp/docs_maintainer-100.md",
      pr_urls: ["https://github.com/li-langverse/li-demo/pull/7"],
      meta: {
        swarm_attribution: {
          run_id: "docs_maintainer-100",
          agent_id: "docs_maintainer",
          repo: "li-demo",
          branch: "chore/agent-docs_maintainer-00000100",
          commit_sha: "abc123",
          pr_url: "https://github.com/li-langverse/li-demo/pull/7",
          pr_number: 7,
        },
      },
    },
    {
      run_id: "bench_improver-200",
      agent_id: "bench_improver",
      started_at: "2026-05-29T01:00:00Z",
      status: "finished",
      md_path: "/tmp/bench_improver-200.md",
      pr_urls: [],
    },
  ];

  const index = buildSwarmArtifactsIndex(runs);
  assert.equal(index.artifact_count, 1);
  assert.equal(index.by_agent.docs_maintainer, 1);
  assert.equal(index.lookup.branch["chore/agent-docs_maintainer-00000100"], "docs_maintainer-100");
  assert.equal(index.lookup.pr["li-demo#7"], "docs_maintainer-100");
  assert.equal(index.lookup.commit.abc123, "docs_maintainer-100");

  const byRun = buildSwarmArtifactsIndex(runs, { run_id: "docs_maintainer-100" });
  assert.equal(byRun.artifact_count, 1);

  const byPr = buildSwarmArtifactsIndex(runs, { pr: "li-demo#7" });
  assert.equal(byPr.artifacts[0]?.run_id, "docs_maintainer-100");
});
