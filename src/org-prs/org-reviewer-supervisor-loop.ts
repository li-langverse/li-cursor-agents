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
  isPrBusy,
  pruneTerminalActiveEntries,
  readActiveState,
  readReviewQueuePrs,
  readQueueOpenTotal,
  updatePrStatus,
} from "./org-pr-coordination.js";
import {
  createPrReviewerJob,
  isInKubernetesCluster,
  listPrReviewerJobs,
} from "./org-pr-k8s-client.js";
import {
  computeDesiredWorkers,
  orgReviewerSupervisorEnabled,
  orgReviewerSupervisorIntervalMs,
  orgReviewerSupervisorMaxIdleCycles,
  orgReviewerSupervisorMaxWorkers,
  prRef,
} from "./org-pr-supervisor-config.js";
import { runOrgLaneObserverTick } from "../org/org-lane-observer-tick.js";
import { parsePrOpenCount, refreshPrMergeQueue, runPython, sleep } from "./org-pr-supervisor-shared.js";

export interface ReviewerSupervisorTickResult {
  openCount: number;
  desiredWorkers: number;
  activeWorkers: number;
  spawned: number;
  message: string;
}

export async function orgReviewerSupervisorTick(): Promise<ReviewerSupervisorTickResult> {
  const root = agentsPackageRoot();
  pruneTerminalActiveEntries(root);

  const countRes = runPython("org-pr-open-count.py");
  let openCount = parsePrOpenCount(countRes.tail) ?? 0;

  const refresh = refreshPrMergeQueue();
  if (refresh.ok) {
    openCount = readQueueOpenTotal(root) || openCount;
  } else {
    workerConsole("org-reviewer-supervisor", "warn", `merge queue refresh failed: ${refresh.tail.slice(-200)}`);
  }

  const reviewQueue = readReviewQueuePrs(root);
  const reviewOpen = reviewQueue.length;
  const desiredWorkers = computeDesiredWorkers(reviewOpen, orgReviewerSupervisorMaxWorkers());

  const state = readActiveState(root);
  let activeWorkers = countActiveWorkers(state, "reviewer");

  if (isInKubernetesCluster()) {
    const jobs = await listPrReviewerJobs();
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
  const activeSet = activePrRefs(readActiveState(root));
  let spawned = 0;

  for (const row of reviewQueue) {
    if (spawned >= slots) break;
    const ref = prRef(row.repo, row.number);
    if (activeSet.has(ref)) continue;
    const latest = readActiveState(root);
    if (isPrBusy(latest, ref)) continue;

    const workerId = randomBytes(4).toString("hex");
    if (!claimPr(ref, row.repo, row.number, "reviewer", workerId, undefined, root)) continue;

    if (!isInKubernetesCluster()) {
      updatePrStatus(ref, "running", "local stub (no k8s)", root);
      spawned++;
      continue;
    }

    const created = await createPrReviewerJob({
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

  const msg = `review_queue=${reviewOpen} org_open=${openCount} desired=${desiredWorkers} active=${activeWorkers} spawned=${spawned}`;
  workerConsole("org-reviewer-supervisor", "info", msg);
  agentLog("org-reviewer-supervisor", "info", msg);

  const latest = readActiveState(root);
  await saveOrgSupervisorCycle("review", {
    open_count: reviewOpen,
    desired_workers: desiredWorkers,
    active_claims: activeClaimsForDb(latest),
    last_error: refresh.ok ? null : refresh.tail.slice(-500),
  }).catch((err) => {
    workerConsole("org-reviewer-supervisor", "warn", `db sync failed: ${String(err)}`);
  });

  if (reviewOpen === 0 && openCount > 0) {
    workerConsole(
      "org-reviewer-supervisor",
      "warn",
      `review_queue empty but org has ${openCount} open PRs — check org-pr-merge-queue.json green/blocked buckets`,
    );
  }

  const observer = await runOrgLaneObserverTick("review").catch(() => ({
    message: "",
    demoted: [],
    metaScheduled: false,
  }));
  if (observer.message) workerConsole("org-reviewer-supervisor", "info", `observer ${observer.message}`);

  return { openCount: reviewOpen, desiredWorkers, activeWorkers, spawned, message: msg };
}

export async function runOrgReviewerSupervisorLoop(signal?: AbortSignal): Promise<void> {
  if (!orgReviewerSupervisorEnabled()) {
    workerConsole("org-reviewer-supervisor", "warn", "disabled (set LI_ORG_REVIEWER_SUPERVISOR_ENABLED=1)");
    return;
  }

  const intervalMs = orgReviewerSupervisorIntervalMs();
  const maxIdle = orgReviewerSupervisorMaxIdleCycles();
  let idleCycles = 0;

  while (!signal?.aborted) {
    try {
      const tick = await orgReviewerSupervisorTick();
      if (tick.openCount <= 0 && tick.spawned === 0) {
        workerConsole("org-reviewer-supervisor", "info", "no PRs in review queue — exiting");
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
      agentLog("org-reviewer-supervisor", "ERROR", msg);
      await saveOrgSupervisorCycle("review", {
        open_count: 0,
        desired_workers: 0,
        active_claims: [],
        last_error: msg,
      }).catch(() => undefined);
    }
    await sleep(intervalMs, signal);
  }
}
