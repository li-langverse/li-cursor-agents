#!/usr/bin/env node
import { loadRuntimeEnv } from "../env.js";
loadRuntimeEnv();
import { installProcessStabilityHandlers } from "../swarm/process-stability.js";
installProcessStabilityHandlers("org-planner-worker");
import {
  appendPlannerAudit,
  readActiveState,
  updatePlanStatus,
} from "../org-planner/org-planner-coordination.js";
import {
  claimHandoffForPlanning,
  runOrgPlannerCycle,
} from "../org-planner/org-planner-plan-cycle.js";
import type { PlannerWorkKind } from "../org-planner/org-planner-coordination.js";
import { workerConsole } from "../worker/worker-console.js";

function parseArgs(argv: string[]) {
  let planRef = "";
  let kind: PlannerWorkKind = "issue_plan";
  let workerId = process.env.HOSTNAME ?? "local";
  let issueRef = "";
  let repo = "";
  let number: number | undefined;
  let goalId = "";
  let sessionId = "";
  let handoffId = "";
  let mock = false;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--plan-ref") planRef = argv[++i] ?? "";
    else if (a === "--kind") kind = (argv[++i] ?? "issue_plan") as PlannerWorkKind;
    else if (a === "--worker-id") workerId = argv[++i] ?? workerId;
    else if (a === "--issue") issueRef = argv[++i] ?? "";
    else if (a === "--repo") repo = argv[++i] ?? "";
    else if (a === "--number") number = Number(argv[++i]);
    else if (a === "--goal-id") goalId = argv[++i] ?? "";
    else if (a === "--session-id") sessionId = argv[++i] ?? "";
    else if (a === "--handoff-id") handoffId = argv[++i] ?? "";
    else if (a === "--mock") mock = true;
    else if (a === "--dry-run") dryRun = true;
  }

  return { planRef, kind, workerId, issueRef, repo, number, goalId, sessionId, handoffId, mock, dryRun };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.planRef) {
    console.error(
      "Usage: org-planner-worker --plan-ref REF --kind issue_plan|research_plan --worker-id ID [lane args]",
    );
    process.exit(1);
  }

  const state = readActiveState();
  const entry = state.plans[args.planRef];
  if (!entry || entry.workerId !== args.workerId) {
    workerConsole("org-planner-worker", "ERROR", `not claimed by worker ${args.workerId}: ${args.planRef}`);
    process.exit(1);
  }

  if (args.handoffId) {
    await claimHandoffForPlanning(args.handoffId);
  }

  updatePlanStatus(args.planRef, "running", `planner ${args.workerId} started`);
  workerConsole("org-planner-worker", "info", `claimed plan ${args.planRef} kind=${args.kind}`);

  const result = await runOrgPlannerCycle({
    planRef: args.planRef,
    kind: args.kind,
    workerId: args.workerId,
    issueRef: args.issueRef || entry.issueRef,
    repo: args.repo || entry.repo,
    number: args.number ?? entry.number,
    goalId: args.goalId || entry.goalId,
    sessionId: args.sessionId || entry.sessionId,
    handoffId: args.handoffId || entry.handoffId,
    mock: args.mock,
    dryRun: args.dryRun,
  });

  appendPlannerAudit({
    planRef: args.planRef,
    kind: args.kind,
    workerId: args.workerId,
    status: result.status,
    agentId: result.agentId,
    planReady: result.planReady,
    agentStatus: result.agentStatus,
    durationMs: result.durationMs,
    error: result.error,
    outputTail: result.outputTail,
  });

  updatePlanStatus(
    args.planRef,
    result.status,
    result.ok
      ? result.planReady
        ? "plan ready"
        : "agent run finished"
      : (result.error ?? "planner failed"),
  );

  workerConsole(
    "org-planner-worker",
    result.ok ? "info" : "ERROR",
    `finished ${args.planRef} status=${result.status} planReady=${result.planReady}`,
  );

  console.log(JSON.stringify({ planRef: args.planRef, workerId: args.workerId, ...result }, null, 2));
  if (!result.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
