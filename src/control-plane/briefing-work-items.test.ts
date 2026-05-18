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
