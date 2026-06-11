import { randomBytes } from "node:crypto";
import { agentLog } from "../agent-log.js";
import { workerConsole } from "../worker/worker-console.js";
import { agentsPackageRoot } from "../runner.js";
import { reconcileOrphanedK8sJobs } from "../org/k8s-job-reconcile.js";
import { idleLimitReached } from "../org/supervisor-idle.js";
import { listHandoffs } from "../handoffs/handoff-store.js";
import { loadImplementGoals, pickNextImplementWorkForAgent } from "../implement-goals/load-goals.js";
import { loadLaneState } from "../lanes/lane-state.js";
import { pickHandoffImplementTarget } from "../lanes/implement-lane.js";
import {
  activeClaimsForDb,
  activeImplementRefs,
  appendImplementAudit,
  claimImplement,
  countActiveWorkers,
  pruneTerminalActiveEntries,
  readActiveState,
  updateImplementStatus,
} from "./org-implement-coordination.js";
import {
  createImplementGoalsJob,
  isInKubernetesCluster,
  listImplementGoalsJobs,
} from "./org-implement-k8s-client.js";
import {
  computeDesiredWorkers,
  implementRefForGoal,
  implementRefForHandoff,
  orgImplementSupervisorEnabled,
  orgImplementSupervisorIntervalMs,
  orgImplementSupervisorMaxIdleCycles,
  orgImplementSupervisorMaxWorkers,
} from "./org-implement-supervisor-config.js";

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
  });
}

async function countPendingWork(root: string): Promise<number> {
  const handoffs = await listHandoffs({
    status: ["pending", "pending_placement", "claimed"],
    limit: 50,
  });
  const implementHandoffs = handoffs.filter(
    (h) =>
      h.to_agents.some((a) => a === "code_implementer" || a === "package_architect") &&
      h.status !== "done",
  ).length;

  const laneState = loadLaneState();
  const goals = loadImplementGoals();
  let goalWork = 0;
  for (const agentId of ["code_implementer", "package_architect"] as const) {
    if (pickNextImplementWorkForAgent(
      agentId,
      goals,
      laneState.implement_goal_last_run_at ?? {},
      laneState.implement_goal_last_gate_pass ?? {},
    )) {
      goalWork++;
    }
  }

  const active = activeImplementRefs(readActiveState(root)).size;
  return implementHandoffs + goalWork - active;
}

export interface SupervisorTickResult {
  pendingCount: number;
  desiredWorkers: number;
  activeWorkers: number;
  spawned: number;
  message: string;
}

export async function orgImplementGoalsSupervisorTick(): Promise<SupervisorTickResult> {
  const root = agentsPackageRoot();
  pruneTerminalActiveEntries(root);

  const pendingCount = Math.max(0, await countPendingWork(root));
  const desiredWorkers = computeDesiredWorkers(pendingCount, orgImplementSupervisorMaxWorkers());
  let state = readActiveState(root);
  let activeWorkers = countActiveWorkers(state);

  if (isInKubernetesCluster()) {
    const jobs = await listImplementGoalsJobs();
    activeWorkers = jobs.filter((j) => j.active).length;
    for (const job of jobs) {
      if (job.succeeded || job.failed) {
        const entry = Object.values(state.implement).find((e) => e.jobName === job.name);
        if (entry && (entry.status === "claimed" || entry.status === "running")) {
          updateImplementStatus(
            entry.implementRef,
            job.succeeded ? "completed" : "failed",
            job.succeeded ? "job succeeded" : "job failed",
            root,
          );
        }
      }
    }
    const reconciled = reconcileOrphanedK8sJobs(
      state.implement,
      jobs,
      (ref) => updateImplementStatus(ref, "failed", "job missing (reconciled)", root),
    );
    if (reconciled) {
      workerConsole("org-implement-goals-supervisor", "info", `reconciled ${reconciled} orphan claim(s)`);
    }
    state = readActiveState(root);
  }

  const slots = Math.max(0, desiredWorkers - activeWorkers);
  const activeSet = activeImplementRefs(readActiveState(root));
  let spawned = 0;

  for (let attempt = 0; attempt < slots + 2 && spawned < slots; attempt++) {
    const handoffTarget = await pickHandoffImplementTarget();
    if (handoffTarget) {
      const implementRef = implementRefForHandoff(handoffTarget.handoff.handoff_id);
      if (activeSet.has(implementRef)) continue;

      const workerId = randomBytes(4).toString("hex");
      if (!claimImplement({
        implementRef,
        kind: "handoff",
        agentId: handoffTarget.agentId,
        handoffId: handoffTarget.handoff.handoff_id,
        workerId,
      }, root)) {
        continue;
      }

      if (!isInKubernetesCluster()) {
        updateImplementStatus(implementRef, "running", "local stub (no k8s)", root);
        spawned++;
        continue;
      }

      const created = await createImplementGoalsJob({ implementRef, workerId });
      if (!created.ok) {
        updateImplementStatus(implementRef, "failed", created.message, root);
        workerConsole("org-implement-goals-supervisor", "ERROR", `spawn failed ${implementRef}: ${created.message}`);
        continue;
      }
      updateImplementStatus(implementRef, "running", `job ${created.jobName}`, root, created.jobName);
      spawned++;
      activeSet.add(implementRef);
      workerConsole("org-implement-goals-supervisor", "info", `spawned ${created.jobName} handoff=${implementRef}`);
      continue;
    }

    const laneState = loadLaneState();
    const goals = loadImplementGoals();
    let picked: ReturnType<typeof pickNextImplementWorkForAgent> = null;
    let agentId: "code_implementer" | "package_architect" = "code_implementer";
    for (const aid of ["code_implementer", "package_architect"] as const) {
      picked = pickNextImplementWorkForAgent(
        aid,
        goals,
        laneState.implement_goal_last_run_at ?? {},
        laneState.implement_goal_last_gate_pass ?? {},
      );
      if (picked) {
        agentId = aid;
        break;
      }
    }
    if (!picked) break;

    const implementRef = implementRefForGoal(picked.goal.id, picked.todo.id);
    if (activeSet.has(implementRef)) break;

    const workerId = randomBytes(4).toString("hex");
    if (!claimImplement({
      implementRef,
      kind: "implement_goal",
      agentId,
      goalId: picked.goal.id,
      todoId: picked.todo.id,
      workerId,
    }, root)) {
      break;
    }

    if (!isInKubernetesCluster()) {
      updateImplementStatus(implementRef, "running", "local stub (no k8s)", root);
      spawned++;
      break;
    }

    const created = await createImplementGoalsJob({ implementRef, workerId });
    if (!created.ok) {
      updateImplementStatus(implementRef, "failed", created.message, root);
      workerConsole("org-implement-goals-supervisor", "ERROR", `spawn failed ${implementRef}: ${created.message}`);
      break;
    }
    updateImplementStatus(implementRef, "running", `job ${created.jobName}`, root, created.jobName);
    spawned++;
    workerConsole(
      "org-implement-goals-supervisor",
      "info",
      `spawned ${created.jobName} goal=${picked.goal.id} todo=${picked.todo.id}`,
    );
    break;
  }

  const msg = `pending=${pendingCount} desired=${desiredWorkers} active=${activeWorkers} spawned=${spawned}`;
  workerConsole("org-implement-goals-supervisor", "info", msg);
  agentLog("org-implement-goals-supervisor", "info", msg);

  const latest = readActiveState(root);
  void activeClaimsForDb(latest);

  return { pendingCount, desiredWorkers, activeWorkers, spawned, message: msg };
}

export async function runOrgImplementGoalsSupervisorLoop(signal?: AbortSignal): Promise<void> {
  if (!orgImplementSupervisorEnabled()) {
    workerConsole(
      "org-implement-goals-supervisor",
      "warn",
      "supervisor disabled (set LI_ORG_IMPLEMENT_SUPERVISOR_ENABLED=1)",
    );
    return;
  }

  const intervalMs = orgImplementSupervisorIntervalMs();
  const maxIdle = orgImplementSupervisorMaxIdleCycles();
  let idleCycles = 0;

  workerConsole(
    "org-implement-goals-supervisor",
    "info",
    `loop started interval_ms=${intervalMs} max_idle=${maxIdle === 0 ? "Infinity" : maxIdle}`,
  );

  while (!signal?.aborted) {
    try {
      const tick = await orgImplementGoalsSupervisorTick();
      if (tick.pendingCount <= 0 || tick.desiredWorkers === 0 || (tick.activeWorkers === 0 && tick.spawned === 0)) {
        idleCycles++;
        if (idleLimitReached(idleCycles, maxIdle)) {
          workerConsole("org-implement-goals-supervisor", "info", `idle limit reached (${maxIdle}) — exiting`);
          break;
        }
      } else {
        idleCycles = 0;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      agentLog("org-implement-goals-supervisor", "ERROR", msg);
      workerConsole("org-implement-goals-supervisor", "ERROR", msg);
    }
    await sleep(intervalMs, signal);
  }
}

export { appendImplementAudit };
