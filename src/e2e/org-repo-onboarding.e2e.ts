/**
 * Integration: org_repo_onboarder mock run + briefing-derived work queue + handoffs.
 */
import { test, describe, after, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runAgent, agentsPackageRoot } from "../runner.js";
import { pushBriefingDerivedWorkItems } from "../control-plane/briefing-work-items.js";
import type { AgentWorkQueueItem } from "../control-plane/agent-work-queue.js";
import { applyOrgRepoOnboarderPostRun } from "../handoffs/org-repo-onboarding.js";
import { listHandoffs } from "../handoffs/handoff-store.js";
import { setupE2eEnv } from "./helpers.js";

describe("org repo onboarding (e2e)", () => {
  let env: ReturnType<typeof setupE2eEnv>;
  const tempDirs: string[] = [];

  before(() => {
    env = setupE2eEnv("v1");
  });

  after(() => {
    env?.restoreEnv();
    for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
  });

  test("mock org_repo_onboarder finishes with discovery briefing", async () => {
    const pkg = agentsPackageRoot();
    const benchRoot = mkdtempSync(join(tmpdir(), "li-org-onboard-"));
    tempDirs.push(benchRoot);
    const discovery = {
      new_repos: ["li-fixture-repo"],
      new_repo_entries: [
        {
          repo: "li-fixture-repo",
          classification: "candidate_official",
          onboarding_steps: [
            { agent: "ci_maintainer", action: "add_ci_yml", reason: "CI for li-fixture-repo" },
          ],
        },
      ],
    };
    const scripts = join(pkg, "fixtures", "e2e-benchmarks", "scripts");
    mkdirSync(join(benchRoot, "scripts"), { recursive: true });
    writeFileSync(
      join(benchRoot, "scripts", "agent-briefing.py"),
      `#!/usr/bin/env python3
import json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/latest/agent-briefing.json"
discovery = ${JSON.stringify(discovery)}
rec = [{"agent": "org_repo_onboarder", "reason": "1 new repo"}]
sys.path.insert(0, "${scripts.replace(/\\/g, "/")}")
from heap_plan import build_heap_plan
data = {
  "recommended_agents": rec,
  "org_new_repos_discovery": discovery,
  "org_roadmap": {"vision_url": "https://github.com/li-langverse/roadmap", "pillars": ["provable"], "loaded_at": "e2e"},
  "heap_plan": build_heap_plan(rec),
}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(data, indent=2))
`,
    );
    const proc = spawnSync("python3", [join(benchRoot, "scripts", "agent-briefing.py")], {
      encoding: "utf8",
    });
    assert.equal(proc.status, 0, proc.stderr || proc.stdout);
    process.env.BENCHMARKS_ROOT = benchRoot;
    const result = await runAgent({
      agentId: "org_repo_onboarder",
      cwd: pkg,
      benchmarksRoot: benchRoot,
      mock: true,
      dryRun: false,
    });
    assert.equal(result.status, "finished");
    assert.match(result.outputText ?? "", /new org repo|li-fixture-repo/i);

    const items: AgentWorkQueueItem[] = [];
    pushBriefingDerivedWorkItems(items, new Set(), { org_new_repos_discovery: discovery });
    assert.ok(items.some((i) => i.agent_id === "org_repo_onboarder"));

    await applyOrgRepoOnboarderPostRun(result, { org_new_repos_discovery: discovery });
    const all = await listHandoffs({ status: "pending", limit: 30 });
    assert.ok(
      all.some((h) => h.work?.repo === "li-fixture-repo"),
      "expected ci_maintainer handoff for li-fixture-repo",
    );
  });

  test("discover-new-org-repos.py fixtures (subprocess)", () => {
    const pkg = agentsPackageRoot();
    const benchScripts = join(pkg, "..", "benchmarks", "scripts");
    const ghFixture = mkdtempSync(join(tmpdir(), "li-gh-fix-"));
    const knownFixture = mkdtempSync(join(tmpdir(), "li-known-fix-"));
    tempDirs.push(ghFixture, knownFixture);
    writeFileSync(join(ghFixture, "github.json"), JSON.stringify(["lic", "li-new-one"]));
    writeFileSync(join(knownFixture, "known.json"), JSON.stringify(["lic", "benchmarks"]));
    const out = join(ghFixture, "discovery.json");
    const proc = spawnSync(
      "python3",
      [
        join(benchScripts, "discover-new-org-repos.py"),
        "--fixture-github",
        join(ghFixture, "github.json"),
        "--fixture-known",
        join(knownFixture, "known.json"),
        "--json-out",
        out,
      ],
      { encoding: "utf8" },
    );
    assert.equal(proc.status, 0, proc.stderr || proc.stdout);
    const payload = JSON.parse(readFileSync(out, "utf8")) as { new_repos: string[] };
    assert.deepEqual(payload.new_repos, ["li-new-one"]);
  });
});
