#!/usr/bin/env node
import { loadRuntimeEnv } from "../env.js";
loadRuntimeEnv();
import { installProcessStabilityHandlers } from "../swarm/process-stability.js";
installProcessStabilityHandlers("org-researcher");
import {
  appendResearchAudit,
  readActiveState,
  updateResearchStatus,
} from "../org-research/org-research-coordination.js";
import { runOrgResearchCycle } from "../org-research/org-research-cycle.js";
import { parseResearchRef } from "../org-research/org-research-supervisor-config.js";
import { workerConsole } from "../worker/worker-console.js";

function parseArgs(argv: string[]) {
  let research = "";
  let workerId = process.env.HOSTNAME ?? "local";
  let mock = false;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--research") research = argv[++i] ?? "";
    else if (a === "--worker-id") workerId = argv[++i] ?? workerId;
    else if (a === "--mock") mock = true;
    else if (a === "--dry-run") dryRun = true;
  }
  return { research, workerId, mock, dryRun };
}

async function main(): Promise<void> {
  const { research, workerId, mock, dryRun } = parseArgs(process.argv.slice(2));
  const parsed = parseResearchRef(research);
  if (!parsed) {
    console.error(
      "Usage: org-researcher --research <goalId>@<dimension> [--worker-id ID] [--mock] [--dry-run]",
    );
    process.exit(1);
  }

  const ref = research;
  const state = readActiveState();
  const entry = state.research[ref];
  if (!entry || entry.workerId !== workerId) {
    workerConsole("org-researcher", "ERROR", `not claimed by worker ${workerId}: ${ref}`);
    process.exit(1);
  }

  updateResearchStatus(ref, "running", `researcher ${workerId} started`);
  workerConsole("org-researcher", "info", `claimed research ${ref} dimension=${entry.dimension}`);

  const result = await runOrgResearchCycle({ researchRef: ref, workerId, mock, dryRun });

  appendResearchAudit({
    researchRef: ref,
    goalId: result.goalId,
    dimension: result.dimension,
    workerId,
    status: result.status,
    agentId: result.agentId,
    stub: result.stub,
    agentStatus: result.agentStatus,
    durationMs: result.durationMs,
    error: result.error,
    outputTail: result.outputTail,
  });

  updateResearchStatus(
    ref,
    result.status,
    result.ok
      ? result.stub
        ? "stub completed"
        : "agent run finished"
      : (result.error ?? "researcher failed"),
  );

  workerConsole(
    "org-researcher",
    result.ok ? "info" : "ERROR",
    `finished ${ref} status=${result.status} dimension=${result.dimension} agent=${result.agentId} stub=${result.stub}`,
  );

  console.log(JSON.stringify({ research: ref, workerId, ...result }, null, 2));
  if (!result.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
