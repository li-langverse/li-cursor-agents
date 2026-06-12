import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  claimGaAudit,
  countGaGhostClaimsByAge,
  readGaActiveState,
  reconcileGaActiveWithK8sJobs,
  writeGaActiveState,
} from "./org-ga-coordination.js";

function sprintDir(root: string): string {
  return join(root, "data", "goal-directed-sprints");
}

test("reconcileGaActiveWithK8sJobs clears orphaned running claims", () => {
  const root = mkdtempSync(join(tmpdir(), "ga-reconcile-"));
  mkdirSync(sprintDir(root), { recursive: true });
  try {
    const staleAt = new Date(Date.now() - 8 * 3_600_000).toISOString();
    writeGaActiveState(
      {
        cursor: { repo: 0, lane: 0 },
        audits: {
          "li-langverse/lic@unit": {
            gaRef: "li-langverse/lic@unit",
            repo: "li-langverse/lic",
            lane: "unit",
            workerId: "abc",
            status: "running",
            jobName: "li-org-ga-lic-unit-dead",
            updatedAt: staleAt,
          },
        },
      },
      root,
    );

    const result = reconcileGaActiveWithK8sJobs([], root);
    assert.equal(result.orphanedJobs, 1);

    const state = readGaActiveState(root);
    assert.equal(Object.keys(state.audits).length, 0);

    const audit = readFileSync(join(sprintDir(root), "org-ga-audit.jsonl"), "utf8");
    assert.match(audit, /job missing \(reconciled\)/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reconcileGaActiveWithK8sJobs marks terminal jobs completed", () => {
  const root = mkdtempSync(join(tmpdir(), "ga-reconcile-"));
  mkdirSync(sprintDir(root), { recursive: true });
  try {
    claimGaAudit("li-langverse/lic", "unit", "w1", "li-org-ga-lic-unit-live", root);
    writeGaActiveState(
      {
        ...readGaActiveState(root),
        audits: {
          "li-langverse/lic@unit": {
            ...readGaActiveState(root).audits["li-langverse/lic@unit"]!,
            status: "running",
          },
        },
      },
      root,
    );

    const result = reconcileGaActiveWithK8sJobs(
      [
        {
          name: "li-org-ga-lic-unit-live",
          gaRef: "li-langverse/lic@unit",
          active: false,
          succeeded: true,
          failed: false,
        },
      ],
      root,
    );
    assert.equal(result.terminalUpdated, 1);
    assert.equal(Object.keys(readGaActiveState(root).audits).length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("countGaGhostClaimsByAge ignores fresh claims", () => {
  const root = mkdtempSync(join(tmpdir(), "ga-reconcile-"));
  mkdirSync(sprintDir(root), { recursive: true });
  try {
    claimGaAudit("li-langverse/lic", "unit", "w1", "job-1", root);
    assert.equal(countGaGhostClaimsByAge(readGaActiveState(root), 3_600_000), 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
