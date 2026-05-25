import assert from "node:assert/strict";
import test from "node:test";
import { pushBriefingDerivedWorkItems } from "./briefing-work-items.js";
import type { AgentWorkQueueItem } from "./agent-work-queue.js";

test("pushBriefingDerivedWorkItems enqueues PR and security work", () => {
  const items: AgentWorkQueueItem[] = [];
  const seen = new Set<string>();
  pushBriefingDerivedWorkItems(items, seen, {
    pr_program: {
      all_open: [
        {
          repo: "lic",
          number: 8,
          title: "docs vision",
          ci: "fail",
          url: "https://github.com/li-langverse/lic/pull/8",
        },
      ],
    },
    org_ci_audit: {
      repos_ok: ["lic", "benchmarks", "roadmap"],
      repos_missing_ci: [{ repo: "li-local-ci" }],
    },
    ci_bug_triage: {
      work_queue: [{ repo: "lic", number: 40, reason: "GHA failing", kind: "pr_ci" }],
    },
  });

  const agents = new Set(items.map((i) => i.agent_id));
  assert.ok(agents.has("pr_reviewer"));
  assert.ok(agents.has("pr_alignment"));
  assert.ok(agents.has("security_auditor"));
  assert.ok(agents.has("bug_fixer"));
  assert.ok(agents.has("ci_maintainer"));
  assert.equal(items.filter((i) => i.agent_id === "pr_reviewer").length, 1);
});

test("pushBriefingDerivedWorkItems enqueues org repo onboarding fan-out", () => {
  const items: AgentWorkQueueItem[] = [];
  const seen = new Set<string>();
  pushBriefingDerivedWorkItems(items, seen, {
    org_new_repos_discovery: {
      new_repos: ["li-new-pkg"],
      new_repo_entries: [
        {
          repo: "li-new-pkg",
          classification: "candidate_official",
          onboarding_steps: [
            { agent: "ci_maintainer", action: "add_ci_yml", reason: "Add CI on li-new-pkg" },
            { agent: "agent_kit_maintainer", action: "sync_agent_kit", reason: "Sync kit" },
          ],
        },
      ],
    },
  });
  const agents = new Set(items.map((i) => i.agent_id));
  assert.ok(agents.has("org_repo_onboarder"));
  assert.ok(agents.has("ci_maintainer"));
  assert.ok(agents.has("agent_kit_maintainer"));
  assert.ok(items.some((i) => i.id === "org:onboard:discovery"));
});
