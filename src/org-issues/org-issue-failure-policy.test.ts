import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  applyIssueFailurePolicy,
  demoteIssueFromImplement,
  isIssueSkipped,
  setIssueSkip,
} from "./org-issue-failure-policy.js";

test("demoteIssueFromImplement moves row to route_planner", () => {
  const root = mkdtempSync(join(tmpdir(), "li-org-policy-"));
  const sprint = join(root, "data", "goal-directed-sprints");
  mkdirSync(sprint, { recursive: true });
  writeFileSync(
    join(sprint, "org-issue-queue.json"),
    JSON.stringify({
      report: { implement: 1, route_planner: 0 },
      implement: [{ repo: "benchmarks", number: 266, title: "t" }],
      route_planner: [],
    }),
  );
  const ok = demoteIssueFromImplement("benchmarks", 266, "too many failures", root);
  assert.equal(ok, true);
  const q = JSON.parse(
    readFileSync(join(sprint, "org-issue-queue.json"), "utf8") as string,
  ) as { implement: unknown[]; route_planner: unknown[] };
  assert.equal(q.implement.length, 0);
  assert.equal(q.route_planner.length, 1);
});

test("isIssueSkipped respects until timestamp", () => {
  const root = mkdtempSync(join(tmpdir(), "li-org-skip-"));
  mkdirSync(join(root, "data", "goal-directed-sprints"), { recursive: true });
  setIssueSkip("li-langverse/benchmarks#266", "test", 3, root);
  assert.equal(isIssueSkipped("li-langverse/benchmarks#266", root), true);
});

test("applyIssueFailurePolicy demotes after repeated audit failures", () => {
  const root = mkdtempSync(join(tmpdir(), "li-org-audit-"));
  const sprint = join(root, "data", "goal-directed-sprints");
  mkdirSync(sprint, { recursive: true });
  writeFileSync(
    join(sprint, "org-issue-queue.json"),
    JSON.stringify({
      report: { implement: 1 },
      implement: [{ repo: "benchmarks", number: 266 }],
      route_planner: [],
    }),
  );
  const audit = join(sprint, "org-issue-implement-audit.jsonl");
  const ref = "li-langverse/benchmarks#266";
  for (let i = 0; i < 3; i++) {
    writeFileSync(
      audit,
      `${JSON.stringify({ issueRef: ref, status: "failed" })}\n`,
      { flag: "a" },
    );
  }
  process.env.LI_ORG_ISSUE_MAX_FAILURES = "3";
  const r = applyIssueFailurePolicy(root);
  assert.ok(r.demoted.includes(ref));
});
