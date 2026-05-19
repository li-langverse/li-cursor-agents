import assert from "node:assert/strict";
import test from "node:test";
import {
  orgNewReposDiscoveryFromBriefing,
  recommendOnboarderReason,
} from "./discovery.js";

test("orgNewReposDiscoveryFromBriefing parses discovery payload", () => {
  const d = orgNewReposDiscoveryFromBriefing({
    org_new_repos_discovery: {
      new_repos: ["li-new-pkg"],
      stale_known_repos: ["ghost"],
      new_repo_entries: [
        {
          repo: "li-new-pkg",
          classification: "candidate_official",
          onboarding_steps: [{ agent: "ci_maintainer", action: "add_ci_yml", reason: "CI" }],
        },
      ],
    },
  });
  assert.ok(d);
  assert.deepEqual(d.new_repos, ["li-new-pkg"]);
  assert.equal(d.new_repo_entries?.[0]?.onboarding_steps[0]?.agent, "ci_maintainer");
  assert.equal(recommendOnboarderReason(d), "1 new org repo(s): li-new-pkg");
});

test("recommendOnboarderReason returns null when no new repos", () => {
  assert.equal(recommendOnboarderReason({ new_repos: [] }), null);
});
