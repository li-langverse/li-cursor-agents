#!/usr/bin/env node
import { loadRuntimeEnv } from "../env.js";
loadRuntimeEnv();
import { installProcessStabilityHandlers } from "../swarm/process-stability.js";
installProcessStabilityHandlers("org-implement-goals-worker");
import {
  appendImplementAudit,
  readActiveState,
  updateImplementStatus,
} from "../org-implement-goals/org-implement-coordination.js";
import { runOrgImplementCycle } from "../org-implement-goals/org-implement-cycle.js";
import { parseImplementRef } from "../org-implement-goals/org-implement-supervisor-config.js";
import { workerConsole } from "../worker/worker-console.js";

function parseArgs(argv: string[]) {
  let implement = "";
  let workerId = process.env.HOSTNAME ?? "local";
  let mock = false;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--implement") implement = argv[++i] ?? "";
    else if (a === "--worker-id") workerId = argv[++i] ?? workerId;
    else if (a === "--mock") mock = true;
    else if (a === "--dry-run") dryRun = true;
  }
  return { implement, workerId, mock, dryRun };
}

async function main(): Promise<void> {
  const { implement, workerId, mock, dryRun } = parseArgs(process.argv.slice(2));
  if (!parseImplementRef(implement)) {
    console.error(
      "Usage: org-implement-goals-worker --implement <handoff:ID|goal:ID:todo> [--worker-id ID] [--mock] [--dry-run]",
    );
    process.exit(1);
  }

  const state = readActiveState();
  const entry = state.implement[implement];
  if (!entry || entry.workerId !== workerId) {
    workerConsole("org-implement-goals-worker", "ERROR", `not claimed by worker ${workerId}: ${implement}`);
    process.exit(1);
  }

  updateImplementStatus(implement, "running", `worker ${workerId} started`);
  workerConsole("org-implement-goals-worker", "info", `claimed ${implement} kind=${entry.kind}`);

  const result = await runOrgImplementCycle({ implementRef: implement, workerId, mock, dryRun });

  appendImplementAudit({
    implementRef: implement,
    workerId,
    kind: result.kind,
    status: result.status,
    agentId: result.agentId,
    handoffId: result.handoffId,
    goalId: result.goalId,
    todoId: result.todoId,
    gatePass: result.gatePass,
    stub: result.stub,
    agentStatus: result.agentStatus,
    durationMs: result.durationMs,
    error: result.error,
    outputTail: result.outputTail,
  });

  updateImplementStatus(
    implement,
    result.status,
    result.ok
      ? result.kind === "implement_goal"
        ? `gate=${result.gatePass}`
        : "handoff done"
      : (result.error ?? "worker failed"),
  );

  workerConsole(
    "org-implement-goals-worker",
    result.ok ? "info" : "ERROR",
    `finished ${implement} status=${result.status} agent=${result.agentId}`,
  );

  console.log(JSON.stringify({ implement, workerId, ...result }, null, 2));
  if (!result.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
