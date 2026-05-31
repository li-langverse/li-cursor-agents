import { randomBytes } from "node:crypto";
import { agentLog } from "../agent-log.js";
import { saveOrgSupervisorCycle } from "../db/org-supervisor-cycle.js";
import { workerConsole } from "../worker/worker-console.js";
import { agentsPackageRoot } from "../runner.js";
import {
  activeClaimsForDb,
  activeDimensions,
  activeResearchRefs,
  advanceDimensionCursor,
  claimResearch,
  countActiveWorkers,
  loadResearchDimensions,
  pickNextDimension,
  pruneTerminalActiveEntries,
  readActiveState,
  updateResearchStatus,
} from "./org-research-coordination.js";
import {
  createResearcherJob,
  isInKubernetesCluster,
  listResearcherJobs,
} from "./org-research-k8s-client.js";
import {
  computeDesiredWorkers,
  orgResearchSupervisorEnabled,
  orgResearchSupervisorIntervalMs,
  orgResearchSupervisorMaxIdleCycles,
  orgResearchSupervisorMaxWorkers,
  researchRef,
} from "./org-research-supervisor-config.js";
import { countOpenResearchGoals, readResearchQueue } from "./org-research-cycle.js";

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

export interface SupervisorTickResult {
  openCount: number;
  desiredWorkers: number;
  activeWorkers: number;
  spawned: number;
  message: string;
}

export async function orgResearchSupervisorTick(): Promise<SupervisorTickResult> {
  const root = agentsPackageRoot();
  pruneTerminalActiveEntries(root);

  const openCount = countOpenResearchGoals();
  const desiredWorkers = computeDesiredWorkers(openCount, orgResearchSupervisorMaxWorkers());
  const dimensions = loadResearchDimensions(root);
  let state = readActiveState(root);
  let activeWorkers = countActiveWorkers(state);

  if (isInKubernetesCluster()) {
    const jobs = await listResearcherJobs();
    activeWorkers = jobs.filter((j) => j.active).length;
    for (const job of jobs) {
      if (job.succeeded || job.failed) {
        const entry = Object.values(state.research).find((e) => e.jobName === job.name);
        if (entry && (entry.status === "claimed" || entry.status === "running")) {
          updateResearchStatus(
            entry.researchRef,
            job.succeeded ? "completed" : "failed",
            job.succeeded ? "job succeeded" : "job failed",
            root,
          );
        }
      }
    }
    state = readActiveState(root);
  }

  const slots = Math.max(0, desiredWorkers - activeWorkers);
  const queued = readResearchQueue();
  const activeSet = activeResearchRefs(readActiveState(root));
  const inUseDims = activeDimensions(readActiveState(root));
  let cursor = readActiveState(root).dimensionCursor;
  let spawned = 0;

  for (const goalId of queued) {
    if (spawned >= slots) break;

    const { dimension, nextCursor } = pickNextDimension(dimensions, cursor, inUseDims);
    cursor = nextCursor;
    const ref = researchRef(goalId, dimension);
    if (activeSet.has(ref)) continue;

    const workerId = randomBytes(4).toString("hex");
    if (!claimResearch(ref, goalId, dimension, workerId, undefined, root)) continue;
    inUseDims.add(dimension);

    if (!isInKubernetesCluster()) {
      updateResearchStatus(ref, "running", "local stub (no k8s)", root);
      spawned++;
      workerConsole("org-research-supervisor", "info", `local stub claimed ${ref}`);
      continue;
    }

    const created = await createResearcherJob({
      researchRef: ref,
      goalId,
      dimension,
      workerId,
    });
    if (!created.ok) {
      updateResearchStatus(ref, "failed", created.message, root);
      workerConsole("org-research-supervisor", "ERROR", `spawn failed ${ref}: ${created.message}`);
      continue;
    }
    updateResearchStatus(ref, "running", `job ${created.jobName}`, root, created.jobName);
    spawned++;
    workerConsole(
      "org-research-supervisor",
      "info",
      `spawned job ${created.jobName} for ${ref} dimension=${dimension}`,
    );
  }

  advanceDimensionCursor(cursor, root);

  const msg = `open=${openCount} desired=${desiredWorkers} active=${activeWorkers} spawned=${spawned} dims=${dimensions.join(",")}`;
  workerConsole("org-research-supervisor", "info", msg);
  agentLog("org-research-supervisor", "info", msg);

  const latest = readActiveState(root);
  await saveOrgSupervisorCycle("research", {
    open_count: openCount,
    desired_workers: desiredWorkers,
    active_claims: activeClaimsForDb(latest),
  }).catch((err) => {
    workerConsole("org-research-supervisor", "warn", `db sync failed: ${String(err)}`);
  });

  return { openCount, desiredWorkers, activeWorkers, spawned, message: msg };
}

export async function runOrgResearchSupervisorLoop(signal?: AbortSignal): Promise<void> {
  if (!orgResearchSupervisorEnabled()) {
    workerConsole("org-research-supervisor", "warn", "supervisor disabled (set LI_ORG_RESEARCH_SUPERVISOR_ENABLED=1)");
    return;
  }

  const intervalMs = orgResearchSupervisorIntervalMs();
  const maxIdle = orgResearchSupervisorMaxIdleCycles();
  let idleCycles = 0;

  workerConsole("org-research-supervisor", "info", `loop started interval_ms=${intervalMs} max_idle=${maxIdle}`);

  while (!signal?.aborted) {
    try {
      const tick = await orgResearchSupervisorTick();
      if (tick.openCount <= 0) {
        workerConsole("org-research-supervisor", "info", "no open research goals — exiting");
        break;
      }
      if (tick.desiredWorkers === 0 || (tick.activeWorkers === 0 && tick.spawned === 0)) {
        idleCycles++;
        if (idleCycles >= maxIdle) {
          workerConsole("org-research-supervisor", "info", `idle limit reached (${maxIdle}) — exiting`);
          break;
        }
      } else {
        idleCycles = 0;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      agentLog("org-research-supervisor", "ERROR", msg);
      workerConsole("org-research-supervisor", "ERROR", msg);
    }
    await sleep(intervalMs, signal);
  }
}
