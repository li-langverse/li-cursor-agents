#!/usr/bin/env node
import { loadRuntimeEnv } from "../env.js";
loadRuntimeEnv();
import { installProcessStabilityHandlers } from "../swarm/process-stability.js";
installProcessStabilityHandlers("org-issue-triage");
import {
  appendTriageAudit,
  readTriageActiveState,
  updateTriageIssueStatus,
} from "../org-issues/org-issue-triage-coordination.js";
import { runOrgIssueTriageCycle } from "../org-issues/org-issue-triage-cycle.js";
import { parseIssueRef } from "../org-issues/org-issue-supervisor-config.js";
import { workerConsole } from "../worker/worker-console.js";

function parseArgs(argv: string[]) {
  let issue = "";
  let workerId = process.env.HOSTNAME ?? "local";
  let mock = false;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--issue") issue = argv[++i] ?? "";
    else if (a === "--worker-id") workerId = argv[++i] ?? workerId;
    else if (a === "--mock") mock = true;
    else if (a === "--dry-run") dryRun = true;
  }
  return { issue, workerId, mock, dryRun };
}

async function main(): Promise<void> {
  const { issue, workerId, mock, dryRun } = parseArgs(process.argv.slice(2));
  if (!parseIssueRef(issue)) {
    console.error(
      "Usage: org-issue-triage --issue li-langverse/<repo>#<num> [--worker-id ID] [--mock] [--dry-run]",
    );
    process.exit(1);
  }

  const ref = issue;
  const state = readTriageActiveState();
  const entry = state.issues[ref];
  if (!entry || entry.workerId !== workerId) {
    workerConsole("org-issue-triage", "ERROR", `not claimed by worker ${workerId}: ${ref}`);
    process.exit(1);
  }

  updateTriageIssueStatus(ref, "running", `triage ${workerId} started`);
  const result = await runOrgIssueTriageCycle({ issueRef: ref, workerId, mock, dryRun });

  appendTriageAudit({
    issueRef: ref,
    workerId,
    status: result.status,
    agentId: result.agentId,
    issueClosed: result.issueClosed,
    routed: result.routed,
    agentStatus: result.agentStatus,
    durationMs: result.durationMs,
    error: result.error,
    outputTail: result.outputTail,
  });

  updateTriageIssueStatus(
    ref,
    result.status,
    result.issueClosed ? "issue closed" : (result.error ?? "triage finished"),
  );

  workerConsole(
    "org-issue-triage",
    result.ok ? "info" : "ERROR",
    `finished ${ref} closed=${result.issueClosed} routed=${result.routed ?? "none"}`,
  );

  console.log(JSON.stringify({ issue: ref, workerId, ...result }, null, 2));
  if (!result.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
