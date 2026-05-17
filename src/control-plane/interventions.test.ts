import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { scanInterventions } from "./interventions.js";

test("scanInterventions flags merge-approved governance PR", () => {
  const briefing = JSON.parse(
    readFileSync(join(process.cwd(), "fixtures", "mock-briefing.json"), "utf8"),
  );
  const withPr = {
    ...briefing,
    pr_program: {
      all_open: [
        {
          repo: "roadmap",
          number: 4,
          title: "docs",
          url: "https://github.com/li-langverse/roadmap/pull/4",
          merge_approved: true,
          gate_ready_with_approval: false,
          gate_blockers_if_approved: ["governance_repo: roadmap requires human merge"],
        },
      ],
    },
  };
  const items = scanInterventions(withPr, {});
  assert.ok(items.some((i) => i.kind === "governance_merge"));
});

test("scanInterventions detects preflight failure", () => {
  const items = scanInterventions(
    {
      preflight_runs: { plan_audit: { exit_code: 1 } },
      recommended_agents: [],
    },
    {},
  );
  assert.ok(items.some((i) => i.kind === "preflight_failed"));
});
