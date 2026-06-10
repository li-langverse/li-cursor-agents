#!/usr/bin/env node
import { loadRuntimeEnv } from "../env.js";
loadRuntimeEnv();
import { installProcessStabilityHandlers } from "../swarm/process-stability.js";
installProcessStabilityHandlers("org-ga-worker");
import {
  appendGaAudit,
  readGaActiveState,
  updateGaAuditStatus,
} from "../org-ga/org-ga-coordination.js";
import { runOrgGaCycle } from "../org-ga/org-ga-cycle.js";
import { parseGaRef } from "../org-ga/org-ga-supervisor-config.js";
import { workerConsole } from "../worker/worker-console.js";

function parseArgs(argv: string[]) {
  let ga = "";
  let workerId = process.env.HOSTNAME ?? "local";
  let mock = false;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--ga") ga = argv[++i] ?? "";
    else if (a === "--worker-id") workerId = argv[++i] ?? workerId;
    else if (a === "--mock") mock = true;
    else if (a === "--dry-run") dryRun = true;
  }
  return { ga, workerId, mock, dryRun };
}

async function main(): Promise<void> {
  const { ga, workerId, mock, dryRun } = parseArgs(process.argv.slice(2));
  const parsed = parseGaRef(ga);
  if (!parsed) {
    console.error("Usage: org-ga-worker --ga <repo>@<lane> [--worker-id ID] [--mock] [--dry-run]");
    process.exit(1);
  }

  const ref = ga;
  const state = readGaActiveState();
  const entry = state.audits[ref];
  if (!entry || entry.workerId !== workerId) {
    workerConsole("org-ga-worker", "ERROR", `not claimed by worker ${workerId}: ${ref}`);
    process.exit(1);
  }

  updateGaAuditStatus(ref, "running", `ga-worker ${workerId} started`);
  workerConsole("org-ga-worker", "info", `claimed ${ref} lane=${entry.lane} repo=${entry.repo}`);

  const result = await runOrgGaCycle({ gaRef: ref, workerId, mock, dryRun });

  appendGaAudit({
    gaRef: ref,
    repo: result.repo,
    lane: result.lane,
    workerId,
    status: result.status,
    agentId: result.agentId,
    stub: result.stub,
    agentStatus: result.agentStatus,
    durationMs: result.durationMs,
    error: result.error,
    outputTail: result.outputTail,
  });

  updateGaAuditStatus(
    ref,
    result.status,
    result.ok
      ? result.stub
        ? "stub completed"
        : "agent run finished"
      : (result.error ?? "ga-worker failed"),
  );

  workerConsole(
    "org-ga-worker",
    result.ok ? "info" : "ERROR",
    `finished ${ref} status=${result.status} agent=${result.agentId} stub=${result.stub}`,
  );

  console.log(JSON.stringify({ ga: ref, workerId, ...result }, null, 2));
  if (!result.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
