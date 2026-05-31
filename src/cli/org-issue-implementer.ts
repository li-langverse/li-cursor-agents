#!/usr/bin/env node
import { loadRuntimeEnv } from "../env.js";
loadRuntimeEnv();
import { installProcessStabilityHandlers } from "../swarm/process-stability.js";
installProcessStabilityHandlers("org-issue-implementer");
import {
  appendImplementAudit,
  readActiveState,
  updateIssueStatus,
} from "../org-issues/org-issue-coordination.js";
import { runOrgIssueImplementCycle } from "../org-issues/org-issue-implement-cycle.js";
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
  const parsed = parseIssueRef(issue);
  if (!parsed) {
    console.error(
      "Usage: org-issue-implementer --issue li-langverse/<repo>#<num> [--worker-id ID] [--mock] [--dry-run]",
    );
    process.exit(1);
  }

  const ref = issue;
  const state = readActiveState();
  const entry = state.issues[ref];
  if (!entry || entry.workerId !== workerId) {
    workerConsole("org-issue-implementer", "ERROR", `not claimed by worker ${workerId}: ${ref}`);
    process.exit(1);
  }

  updateIssueStatus(ref, "running", `implementer ${workerId} started`);
  workerConsole("org-issue-implementer", "info", `claimed issue ${ref}`);

  const result = await runOrgIssueImplementCycle({ issueRef: ref, workerId, mock, dryRun });

  appendImplementAudit({
    issueRef: ref,
    workerId,
    status: result.status,
    agentId: result.agentId,
    issueClosed: result.issueClosed,
    issueWasOpen: result.issueWasOpen,
    agentStatus: result.agentStatus,
    durationMs: result.durationMs,
    error: result.error,
    outputTail: result.outputTail,
    stub: false,
  });

  updateIssueStatus(
    ref,
    result.status,
    result.ok
      ? result.issueClosed
        ? "issue closed"
        : "agent run finished"
      : (result.error ?? "implementer failed"),
  );

  workerConsole(
    "org-issue-implementer",
    result.ok ? "info" : "ERROR",
    `finished ${ref} status=${result.status} closed=${result.issueClosed} agent=${result.agentId}`,
  );

  console.log(JSON.stringify({ issue: ref, workerId, ...result }, null, 2));
  if (!result.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
