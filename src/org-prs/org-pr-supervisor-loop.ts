import { randomBytes } from "node:crypto";
import { agentLog } from "../agent-log.js";
import { saveOrgSupervisorCycle } from "../db/org-supervisor-cycle.js";
import { workerConsole } from "../worker/worker-console.js";
import { agentsPackageRoot } from "../runner.js";
import {
  activeClaimsForDb,
  activePrRefs,
  claimPr,
  countActiveWorkers,
  pruneTerminalActiveEntries,
  readActiveState,
  readImplementQueuePrs,
  readQueueOpenTotal,
  updatePrStatus,
} from "./org-pr-coordination.js";
import { createPrImplementerJob, isInKubernetesCluster, listPrImplementerJobs } from "./org-pr-k8s-client.js";
import {
  computeDesiredWorkers,
  orgPrSupervisorEnabled,
  orgPrSupervisorIntervalMs,
  orgPrSupervisorMaxIdleCycles,
  orgPrSupervisorMaxWorkers,
  prRef,
} from "./org-pr-supervisor-config.js";
import { runOrgLaneObserverTick } from "../org/org-lane-observer-tick.js";
import { parsePrOpenCount, refreshPrMergeQueue, runPython, sleep } from "./org-pr-supervisor-shared.js";

export interface PrSupervisorTickResult {
  openCount: number;
  desiredWorkers: number;
  activeWorkers: number;
  spawned: number;
  message: string;
}

export async function orgPrSupervisorTick(): Promise<PrSupervisorTickResult> {
  const root = agentsPackageRoot();
  pruneTerminalActiveEntries(root);

  const countRes = runPython("org-pr-open-count.py");
  let openCount = parsePrOpenCount(countRes.tail) ?? 0;

  const refresh = refreshPrMergeQueue();
  if (refresh.ok) {
    openCount = readQueueOpenTotal(root) || openCount;
  } else {
    workerConsole("org-pr-supervisor", "warn", `queue refresh failed: ${refresh.tail.slice(-200)}`);
  }

  const desiredWorkers = computeDesiredWorkers(openCount, orgPrSupervisorMaxWorkers());
  const state = readActiveState(root);
  let activeWorkers = countActiveWorkers(state, "implementer");

  if (isInKubernetesCluster()) {
    const jobs = await listPrImplementerJobs();
    activeWorkers = jobs.filter((j) => j.active).length;
    for (const job of jobs) {
      if (job.succeeded || job.failed) {
        const entry = Object.values(state.prs).find((e) => e.jobName === job.name);
        if (entry && (entry.status === "claimed" || entry.status === "running")) {
          updatePrStatus(
            entry.prRef,
            job.succeeded ? "completed" : "failed",
            job.succeeded ? "job succeeded" : "job failed",
            root,
          );
        }
      }
    }
  }

  const slots = Math.max(0, desiredWorkers - activeWorkers);
  const queued = readImplementQueuePrs(root);
  const activeSet = activePrRefs(readActiveState(root));
  let spawned = 0;

  for (const row of queued) {
    if (spawned >= slots) break;
    const ref = prRef(row.repo, row.number);
    if (activeSet.has(ref)) continue;

    const workerId = randomBytes(4).toString("hex");
    if (!claimPr(ref, row.repo, row.number, "implementer", workerId, undefined, root)) continue;

    if (!isInKubernetesCluster()) {
      updatePrStatus(ref, "running", "local stub (no k8s)", root);
      spawned++;
      continue;
    }

    const created = await createPrImplementerJob({
      prRef: ref,
      repo: row.repo,
      number: row.number,
      workerId,
    });
    if (!created.ok) {
      updatePrStatus(ref, "failed", created.message, root);
      continue;
    }
    updatePrStatus(ref, "running", `job ${created.jobName}`, root, created.jobName);
    spawned++;
  }

  const msg = `open=${openCount} desired=${desiredWorkers} active=${activeWorkers} spawned=${spawned}`;
  workerConsole("org-pr-supervisor", "info", msg);
  agentLog("org-pr-supervisor", "info", msg);

  const latest = readActiveState(root);
  await saveOrgSupervisorCycle("pr", {
    open_count: openCount,
    desired_workers: desiredWorkers,
    active_claims: activeClaimsForDb(latest),
    last_error: refresh.ok ? null : refresh.tail.slice(-500),
  }).catch((err) => {
    workerConsole("org-pr-supervisor", "warn", `db sync failed: ${String(err)}`);
  });

  const observer = await runOrgLaneObserverTick("pr").catch(() => ({
    message: "",
    demoted: [],
    metaScheduled: false,
  }));
  if (observer.message) workerConsole("org-pr-supervisor", "info", `observer ${observer.message}`);

  return { openCount, desiredWorkers, activeWorkers, spawned, message: msg };
}

export async function runOrgPrSupervisorLoop(signal?: AbortSignal): Promise<void> {
  if (!orgPrSupervisorEnabled()) {
    workerConsole("org-pr-supervisor", "warn", "disabled (set LI_ORG_PR_SUPERVISOR_ENABLED=1)");
    return;
  }

  const intervalMs = orgPrSupervisorIntervalMs();
  const maxIdle = orgPrSupervisorMaxIdleCycles();
  let idleCycles = 0;

  workerConsole("org-pr-supervisor", "info", `loop started interval_ms=${intervalMs}`);

  while (!signal?.aborted) {
    try {
      const tick = await orgPrSupervisorTick();
      if (tick.openCount <= 0 && tick.spawned === 0) {
        workerConsole("org-pr-supervisor", "info", "no open PR work — exiting");
        break;
      }
      if (tick.desiredWorkers === 0 || (tick.activeWorkers === 0 && tick.spawned === 0)) {
        idleCycles++;
        if (idleCycles >= maxIdle) break;
      } else {
        idleCycles = 0;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      agentLog("org-pr-supervisor", "ERROR", msg);
      await saveOrgSupervisorCycle("pr", {
        open_count: 0,
        desired_workers: 0,
        active_claims: [],
        last_error: msg,
      }).catch(() => undefined);
    }
    await sleep(intervalMs, signal);
  }
}
