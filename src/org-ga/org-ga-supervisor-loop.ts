import { randomBytes } from "node:crypto";
import { agentLog } from "../agent-log.js";
import { saveOrgSupervisorCycle } from "../db/org-supervisor-cycle.js";
import { idleLimitReached } from "../org/supervisor-idle.js";
import { workerConsole } from "../worker/worker-console.js";
import { agentsPackageRoot } from "../runner.js";
import {
  activeClaimsForDb,
  activeGaRefs,
  claimGaAudit,
  countActiveGaWorkers,
  pendingGaCount,
  readGaActiveState,
  setGaCursor,
  updateGaAuditStatus,
  updateGaJobName,
  pruneTerminalActiveEntries,
} from "./org-ga-coordination.js";
import { createGaAuditorJob, isInKubernetesCluster, listGaAuditorJobs } from "./org-ga-k8s-client.js";
import { pickPendingGaWork, loadOrgRepoList } from "./org-ga-repo-queue.js";
import {
  computeDesiredGaWorkers,
  defaultGaLanes,
  orgGaSupervisorEnabled,
  orgGaSupervisorIntervalMs,
  orgGaSupervisorMaxIdleCycles,
  orgGaSupervisorMaxWorkers,
} from "./org-ga-supervisor-config.js";

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
  });
}

export interface GaSupervisorTickResult {
  pendingCount: number;
  desiredWorkers: number;
  activeWorkers: number;
  spawned: number;
  message: string;
}

export async function orgGaSupervisorTick(): Promise<GaSupervisorTickResult> {
  const root = agentsPackageRoot();
  pruneTerminalActiveEntries(root);

  const repos = loadOrgRepoList();
  const lanes = defaultGaLanes();
  const pendingCount = pendingGaCount(root);
  const desiredWorkers = computeDesiredGaWorkers(pendingCount, orgGaSupervisorMaxWorkers());

  let state = readGaActiveState(root);
  let activeWorkers = countActiveGaWorkers(state);

  if (isInKubernetesCluster()) {
    const jobs = await listGaAuditorJobs();
    activeWorkers = jobs.filter((j) => j.active).length;
    for (const job of jobs) {
      if (job.succeeded || job.failed) {
        const entry = Object.values(state.audits).find((e) => e.jobName === job.name);
        if (entry && (entry.status === "claimed" || entry.status === "running")) {
          updateGaAuditStatus(
            entry.gaRef,
            job.succeeded ? "completed" : "failed",
            job.succeeded ? "job succeeded" : "job failed",
            root,
          );
        }
      }
    }
    state = readGaActiveState(root);
  }

  const slots = Math.max(0, desiredWorkers - activeWorkers);
  const activeSet = activeGaRefs(readGaActiveState(root));
  let cursor = readGaActiveState(root).cursor;
  let spawned = 0;

  for (let i = 0; i < slots; i += 1) {
    const pick = pickPendingGaWork(activeSet, cursor, lanes, repos);
    if (!pick) break;

    cursor = pick.nextCursor;
    const workerId = randomBytes(4).toString("hex");
    if (!claimGaAudit(pick.repo, pick.lane, workerId, undefined, root)) continue;
    activeSet.add(pick.ref);

    if (!isInKubernetesCluster()) {
      updateGaAuditStatus(pick.ref, "running", "local stub (no k8s)", root);
      spawned++;
      workerConsole("org-ga-supervisor", "info", `local stub claimed ${pick.ref}`);
      continue;
    }

    const created = await createGaAuditorJob({
      gaRef: pick.ref,
      repo: pick.repo,
      lane: pick.lane,
      workerId,
    });
    if (!created.ok) {
      updateGaAuditStatus(pick.ref, "failed", created.message, root);
      workerConsole("org-ga-supervisor", "ERROR", `spawn failed ${pick.ref}: ${created.message}`);
      continue;
    }
    updateGaAuditStatus(pick.ref, "running", `job ${created.jobName}`, root);
    if (created.jobName) updateGaJobName(pick.ref, created.jobName, root);
    spawned++;
    workerConsole(
      "org-ga-supervisor",
      "info",
      `spawned job ${created.jobName} for ${pick.ref}`,
    );
  }

  setGaCursor(cursor, root);

  const msg = `repos=${repos.length} lanes=${lanes.length} pending=${pendingCount} desired=${desiredWorkers} active=${activeWorkers} spawned=${spawned}`;
  workerConsole("org-ga-supervisor", "info", msg);
  agentLog("org-ga-supervisor", "info", msg);

  const latest = readGaActiveState(root);
  await saveOrgSupervisorCycle("ga", {
    open_count: pendingCount,
    desired_workers: desiredWorkers,
    active_claims: activeClaimsForDb(latest),
  }).catch((err) => {
    workerConsole("org-ga-supervisor", "warn", `db sync failed: ${String(err)}`);
  });

  return { pendingCount, desiredWorkers, activeWorkers, spawned, message: msg };
}

export async function runOrgGaSupervisorLoop(signal?: AbortSignal): Promise<void> {
  if (!orgGaSupervisorEnabled()) {
    workerConsole("org-ga-supervisor", "warn", "supervisor disabled (set LI_ORG_GA_SUPERVISOR_ENABLED=1)");
    return;
  }

  const intervalMs = orgGaSupervisorIntervalMs();
  const maxIdle = orgGaSupervisorMaxIdleCycles();
  let idleCycles = 0;

  workerConsole("org-ga-supervisor", "info", `loop started interval_ms=${intervalMs} max_idle=${maxIdle}`);

  while (!signal?.aborted) {
    try {
      const tick = await orgGaSupervisorTick();
      if (tick.desiredWorkers === 0 || (tick.activeWorkers === 0 && tick.spawned === 0)) {
        idleCycles++;
        if (idleLimitReached(idleCycles, maxIdle)) {
          workerConsole("org-ga-supervisor", "info", `idle limit reached (${maxIdle}) — exiting`);
          break;
        }
      } else {
        idleCycles = 0;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      agentLog("org-ga-supervisor", "ERROR", msg);
      workerConsole("org-ga-supervisor", "ERROR", msg);
    }
    await sleep(intervalMs, signal);
  }
}
