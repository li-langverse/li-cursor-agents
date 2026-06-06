#!/usr/bin/env node
/**
 * Smoke check for org-issue triage audit health (local PVC or cluster mount).
 * Usage: node scripts/test-org-triage-health.mjs [audit.jsonl path]
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const defaultAudit = join(root, "data", "goal-directed-sprints", "org-issue-triage-audit.jsonl");
const auditPath = process.argv[2] ?? defaultAudit;

if (!existsSync(auditPath)) {
  console.error(`skip: no audit file at ${auditPath}`);
  process.exit(0);
}

const rows = readFileSync(auditPath, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const now = Date.now();
const dayMs = 24 * 60 * 60 * 1000;
const recent = rows.filter((r) => now - Date.parse(String(r.ts)) < dayMs);

const completed = recent.filter((r) => r.status === "completed");
const failed = recent.filter((r) => r.status === "failed");
const closed = recent.filter((r) => r.issueClosed === true);
const mcpClose = recent.filter((r) =>
  /close_github_issue/i.test(String(r.outputTail ?? "")),
);

console.log(`org-triage-health: audit=${auditPath}`);
console.log(`  total_rows=${rows.length} recent_24h=${recent.length}`);
console.log(`  completed=${completed.length} failed=${failed.length} closed=${closed.length}`);
console.log(`  mcp_close_github_issue=${mcpClose.length}`);

if (recent.length === 0) {
  console.error("FAIL: no triage audit rows in the last 24h");
  process.exit(1);
}

const failRate = failed.length / recent.length;
if (failRate > 0.5) {
  console.error(`FAIL: triage fail rate ${(failRate * 100).toFixed(0)}% (>50%)`);
  process.exit(1);
}

if (completed.length >= 3 && closed.length === 0 && mcpClose.length === 0) {
  console.error("FAIL: triage completes but never closes issues (check close_github_issue MCP)");
  process.exit(1);
}

console.log("PASS: org triage health checks OK");
