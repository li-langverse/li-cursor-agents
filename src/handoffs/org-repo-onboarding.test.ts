import assert from "node:assert/strict";
import test from "node:test";
import { setupE2eEnv } from "../e2e/helpers.js";
import { applyOrgRepoOnboarderPostRun } from "./org-repo-onboarding.js";
import { listHandoffs } from "./handoff-store.js";
import type { AgentRunResult } from "../types.js";

test("applyOrgRepoOnboarderPostRun creates downstream handoffs", async () => {
  const env = setupE2eEnv("v1");
  try {
    const briefing = {
      org_new_repos_discovery: {
        new_repos: ["li-new-pkg"],
        new_repo_entries: [
          {
            repo: "li-new-pkg",
            classification: "unclassified",
            onboarding_steps: [
              { agent: "ci_maintainer", action: "add_ci_yml", reason: "CI bootstrap" },
              { agent: "docs_maintainer", action: "live_docs_smoke", reason: "Docs smoke" },
            ],
          },
        ],
      },
    };
    const result: AgentRunResult = {
      agentId: "org_repo_onboarder",
      backend: "mock",
      status: "finished",
      durationMs: 1,
      outputText: "## Executive summary\n- onboard\n",
      outputPath: "/tmp/org_repo_onboarder-test.md",
    };
    const created = await applyOrgRepoOnboarderPostRun(result, briefing, "hash-test");
    assert.equal(created.length, 2);
    const pending = await listHandoffs({ status: "pending", limit: 20 });
    const ci = pending.find((h) => h.to_agents.includes("ci_maintainer"));
    assert.ok(ci);
    assert.equal(ci?.work?.repo, "li-new-pkg");
    assert.equal(ci?.work?.onboarding_action, "add_ci_yml");
  } finally {
    env.restoreEnv();
  }
});
