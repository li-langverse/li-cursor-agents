#!/usr/bin/env node
import { loadRuntimeEnv } from "../env.js";
loadRuntimeEnv();
import { installProcessStabilityHandlers } from "../swarm/process-stability.js";
installProcessStabilityHandlers("org-pr-reviewer");
import {
  appendReviewAudit,
  readActiveState,
  updatePrStatus,
} from "../org-prs/org-pr-coordination.js";
import { runOrgPrReviewCycle } from "../org-prs/org-pr-review-cycle.js";
import { parsePrRef } from "../org-prs/org-pr-supervisor-config.js";
import { workerConsole } from "../worker/worker-console.js";

function parseArgs(argv: string[]) {
  let pr = "";
  let workerId = process.env.HOSTNAME ?? "local";
  let mock = false;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--pr") pr = argv[++i] ?? "";
    else if (a === "--worker-id") workerId = argv[++i] ?? workerId;
    else if (a === "--mock") mock = true;
    else if (a === "--dry-run") dryRun = true;
  }
  return { pr, workerId, mock, dryRun };
}

async function main(): Promise<void> {
  const { pr, workerId, mock, dryRun } = parseArgs(process.argv.slice(2));
  if (!parsePrRef(pr)) {
    console.error(
      "Usage: org-pr-reviewer --pr li-langverse/<repo>#<num> [--worker-id ID] [--mock] [--dry-run]",
    );
    process.exit(1);
  }

  const state = readActiveState();
  const entry = state.prs[pr];
  if (!entry || entry.workerId !== workerId || entry.role !== "reviewer") {
    workerConsole("org-pr-reviewer", "ERROR", `not claimed by reviewer ${workerId}: ${pr}`);
    process.exit(1);
  }

  updatePrStatus(pr, "running", `reviewer ${workerId} started`);
  const result = await runOrgPrReviewCycle({ prRef: pr, workerId, mock, dryRun });

  appendReviewAudit({
    prRef: pr,
    workerId,
    role: "reviewer",
    status: result.status,
    agentId: result.agentId,
    durationMs: result.durationMs,
    error: result.error,
    outputTail: result.outputTail,
  });

  updatePrStatus(
    pr,
    result.status,
    result.ok ? "review finished" : (result.error ?? "failed"),
  );

  workerConsole("org-pr-reviewer", result.ok ? "info" : "ERROR", `finished ${pr}`);
  console.log(JSON.stringify({ pr, workerId, ...result }, null, 2));
  if (!result.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
