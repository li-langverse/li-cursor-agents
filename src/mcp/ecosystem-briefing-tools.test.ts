import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";
import {
  describePackageFromBriefing,
  listOrgReposFromBriefing,
  searchRepoTree,
} from "./ecosystem-briefing-tools.js";

test("listOrgReposFromBriefing merges explorer repos and org_packages keys", () => {
  const repos = listOrgReposFromBriefing({
    ecosystem_explorer: { repos: ["lic", "benchmarks"] },
    org_packages: { "li-std-math": { status: "ok" } },
  });
  assert.deepEqual(repos, ["benchmarks", "li-std-math", "lic"]);
});

test("describePackageFromBriefing returns org_packages row", () => {
  const row = describePackageFromBriefing(
    {
      org_packages: {
        "li-std-io": { repo: "li-std-io", coverage: 0.9 },
      },
    },
    "li-std-io",
  );
  assert.equal(row?.source, "org_packages");
  assert.equal((row as Record<string, unknown>).repo, "li-std-io");
});

test("searchRepoTree scans fixture explorer tree", () => {
  const bench = join(agentsPackageRoot(), "fixtures", "e2e-benchmarks");
  const treeRoot = join(bench, "fixtures", "explorer-trees", "fixturepkg");
  mkdirSync(treeRoot, { recursive: true });
  writeFileSync(join(treeRoot, "hello_world.li"), "proc main(): void\n  discard 0\n");
  const result = searchRepoTree("fixturepkg", "hello", 5, bench);
  assert.ok(result.matches.length >= 1);
  rmSync(join(bench, "fixtures", "explorer-trees"), { recursive: true, force: true });
});
