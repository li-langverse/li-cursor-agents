import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { appendTriageAudit, triageAuditPath } from "./org-issue-triage-coordination.js";

test("appendTriageAudit replaces duplicate issueRef+workerId row", () => {
  const root = mkdtempSync(join(tmpdir(), "triage-audit-"));
  mkdirSync(join(root, "data", "goal-directed-sprints"), { recursive: true });
  try {
    appendTriageAudit(
      {
        issueRef: "li-langverse/lic#399",
        workerId: "worker-1",
        status: "completed",
        issueClosed: false,
        outputTail: "agent stub",
      },
      root,
    );
    appendTriageAudit(
      {
        issueRef: "li-langverse/lic#399",
        workerId: "worker-1",
        status: "completed",
        issueClosed: false,
        routed: "implement",
        durationMs: 120_000,
        outputTail: "cli summary",
      },
      root,
    );
    const lines = readFileSync(triageAuditPath(root), "utf8").trim().split("\n");
    assert.equal(lines.length, 1);
    const row = JSON.parse(lines[0]!) as Record<string, unknown>;
    assert.equal(row.issueRef, "li-langverse/lic#399");
    assert.equal(row.workerId, "worker-1");
    assert.equal(row.durationMs, 120_000);
    assert.equal(row.outputTail, "cli summary");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
