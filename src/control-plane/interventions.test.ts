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

test("scanInterventions flags agent incomplete runs", () => {
  const items = scanInterventions(
    {
      agent_incomplete_runs: [{ agent_id: "ci_maintainer", run_id: "x", gaps: ["no_pr_url"] }],
      recommended_agents: [],
    },
    {},
  );
  assert.ok(items.some((i) => i.kind === "agent_incomplete"));
});

test("scanInterventions flags numerics deliverable gaps", () => {
  const items = scanInterventions(
    {
      agent_deliverable_gaps: {
        plan_open_items: 0,
        incomplete_runs: 0,
        agent_prs_blocked: 1,
        numerics_without_evidence: 1,
      },
      agent_pr_deliverable_failures: [
        {
          repo: "lic",
          number: 99,
          url: "https://github.com/li-langverse/lic/pull/99",
          blockers: ["numerics_test_or_bench_evidence: missing"],
        },
      ],
      recommended_agents: [],
    },
    {},
  );
  assert.ok(items.some((i) => i.kind === "implementation_gap" && i.title.includes("lic#99")));
});

test("scanInterventions links red benchmarks to bench drill-down", () => {
  const items = scanInterventions(
    {
      benchmark_dashboard_base: "https://li-langverse.github.io/benchmarks",
      ecosystem_audit: {
        benchmarks: {
          red: [{ id: "horner_pure_li", ratio_vs_cpp: 88.8 }],
          deep_links: [
            {
              id: "horner_pure_li",
              url: "https://li-langverse.github.io/benchmarks/bench/horner_pure_li/",
            },
          ],
        },
      },
      recommended_agents: [],
    },
    {},
  );
  const red = items.find((i) => i.kind === "ci_red");
  assert.ok(red);
  assert.ok(
    red!.links.some((u) => u.includes("/bench/horner_pure_li/")),
    `expected bench deep link, got ${red!.links.join(", ")}`,
  );
  assert.ok(!red!.links.includes("https://li-langverse.github.io/benchmarks/"));
});

test("scanInterventions builds bench link from first red id when deep_links absent", () => {
  const items = scanInterventions(
    {
      ecosystem_audit: { benchmarks: { red: [{ id: "matmul_blocked" }] } },
      recommended_agents: [],
    },
    {},
  );
  const red = items.find((i) => i.kind === "ci_red");
  assert.equal(red?.links[0], "https://li-langverse.github.io/benchmarks/bench/matmul_blocked/");
});

test("org_agent_kit_audit exit 1 with drift is not a human preflight failure", () => {
  const items = scanInterventions(
    {
      preflight_runs: { org_agent_kit_audit: { exit_code: 1 } },
      org_agent_kit_audit: {
        repos_needing_sync: [{ repo: "lic", status: "drift" }],
      },
      recommended_agents: [
        { agent: "agent_kit_maintainer", reason: "1 repos missing or drifted agent-kit" },
      ],
    },
    {},
  );
  assert.ok(!items.some((i) => i.kind === "preflight_failed" && i.title.includes("org_agent_kit")));
});
