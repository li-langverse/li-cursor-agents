import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { agentLog } from "../agent-log.js";
import { saveOrgSupervisorCycle } from "../db/org-supervisor-cycle.js";
import { workerConsole } from "../worker/worker-console.js";
import { agentsPackageRoot } from "../runner.js";
import { reconcileOrphanedK8sJobs } from "../org/k8s-job-reconcile.js";
import { idleLimitReached } from "../org/supervisor-idle.js";
import { getPrBackoff } from "../org-prs/org-pr-coordination.js";
import { issueRef } from "./org-issue-supervisor-config.js";
import {
  activeTriageClaimsForDb,
  activeTriageIssueRefs,
  claimTriageIssue,
  countActiveTriageWorkers,
  pruneTerminalTriageEntries,
  readTriageActiveState,
  readTriageQueueCount,
  readTriageQueueIssues,
  setTriageCooldown,
  triageCooldownUntilForRef,
  updateTriageIssueStatus,
} from "./org-issue-triage-coordination.js";
import {
  computeTriageDesiredWorkers,
  orgIssueTriageRefCooldownMs,
  orgIssueTriageSupervisorEnabled,
  orgIssueTriageSupervisorIntervalMs,
  orgIssueTriageSupervisorMaxIdleCycles,
  orgIssueTriageSupervisorMaxWorkers,
} from "./org-issue-triage-config.js";
import {
  createTriageJob,
  isInKubernetesCluster,
  listTriageJobs,
} from "./org-issue-triage-k8s-client.js";

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

function runPython(scriptName: string): { ok: boolean; tail: string } {
  const root = agentsPackageRoot();
  const script = join(root, "scripts", scriptName);
  if (!existsSync(script)) return { ok: false, tail: `missing ${script}` };
  const py = process.platform === "win32" ? "python" : "python3";
  const proc = spawnSync(py, [script], {
    cwd: root,
    env: process.env,
    encoding: "utf8",
    timeout: 3_600_000,
  });
  const tail = `${proc.stdout ?? ""}${proc.stderr ?? ""}`.trim().slice(-2000);
  return { ok: proc.status === 0, tail };
}

function readQueueOpenTotal(root: string): number {
  const path = join(root, "data", "goal-directed-sprints", "org-issue-queue.json");
  if (!existsSync(path)) return 0;
  const q = JSON.parse(readFileSync(path, "utf8")) as { report?: { total_open?: number } };
  return q.report?.total_open ?? 0;
}

export interface TriageSupervisorTickResult {
  openCount: number;
  triageCount: number;
  desiredWorkers: number;
  activeWorkers: number;
  spawned: number;
  message: string;
}

export async function orgIssueTriageSupervisorTick(): Promise<TriageSupervisorTickResult> {
  const root = agentsPackageRoot();
  pruneTerminalTriageEntries(root);

  const backoff = getPrBackoff(root);
  const backoffUntilMs = backoff?.until ? Date.parse(backoff.until) : NaN;
  if (Number.isFinite(backoffUntilMs) && Date.now() < backoffUntilMs) {
    const msg = `GitHub rate limit backoff until ${backoff!.until}`;
    workerConsole("org-issue-triage-supervisor", "info", msg);
    return {
      openCount: readQueueOpenTotal(root),
      triageCount: readTriageQueueCount(root),
      desiredWorkers: 0,
      activeWorkers: 0,
      spawned: 0,
      message: msg,
    };
  }

  const classify = runPython("org-classify-open-issues.py");
  let openCount = readQueueOpenTotal(root);
  if (classify.ok) {
    openCount = readQueueOpenTotal(root);
  } else {
    workerConsole("org-issue-triage-supervisor", "warn", `classify failed: ${classify.tail.slice(-200)}`);
  }

  const triageCount = readTriageQueueCount(root);
  const desiredWorkers = computeTriageDesiredWorkers(triageCount, orgIssueTriageSupervisorMaxWorkers());
  const state = readTriageActiveState(root);
  let activeWorkers = countActiveTriageWorkers(state);

  if (isInKubernetesCluster()) {
    const jobs = await listTriageJobs();
    activeWorkers = jobs.filter((j) => j.active).length;
    for (const job of jobs) {
      if (job.succeeded || job.failed) {
        const entry = Object.values(state.issues).find((e) => e.jobName === job.name);
        if (entry && (entry.status === "claimed" || entry.status === "running")) {
          updateTriageIssueStatus(
            entry.issueRef,
            job.succeeded ? "completed" : "failed",
            job.succeeded ? "job succeeded" : "job failed",
            root,
          );
        }
      }
    }
    const reconciled = reconcileOrphanedK8sJobs(state.issues, jobs, (ref) =>
      updateTriageIssueStatus(ref, "failed", "job missing (reconciled)", root),
    );
    if (reconciled) {
      workerConsole("org-issue-triage-supervisor", "info", `reconciled ${reconciled} orphaned triage claim(s)`);
    }
  }

  const slots = Math.max(0, desiredWorkers - activeWorkers);
  const queued = readTriageQueueIssues(root);
  const activeSet = activeTriageIssueRefs(readTriageActiveState(root));
  let spawned = 0;

  for (const row of queued) {
    if (spawned >= slots) break;
    const ref = issueRef(row.repo, row.number);
    if (triageCooldownUntilForRef(ref, root)) continue;
    if (activeSet.has(ref)) continue;

    const workerId = randomBytes(4).toString("hex");
    const cooldownMs = orgIssueTriageRefCooldownMs();
    setTriageCooldown(ref, new Date(Date.now() + cooldownMs).toISOString(), root);

    if (!claimTriageIssue(ref, row.repo, row.number, workerId, undefined, root)) continue;

    if (!isInKubernetesCluster()) {
      updateTriageIssueStatus(ref, "running", "local stub", root);
      spawned++;
      continue;
    }

    const created = await createTriageJob({
      issueRef: ref,
      repo: row.repo,
      number: row.number,
      workerId,
    });
    if (!created.ok) {
      updateTriageIssueStatus(ref, "failed", created.message, root);
      continue;
    }
    updateTriageIssueStatus(ref, "running", `job ${created.jobName}`, root, created.jobName);
    spawned++;
    workerConsole("org-issue-triage-supervisor", "info", `spawned triage job ${created.jobName} for ${ref}`);
  }

  const msg = `open=${openCount} triage=${triageCount} desired=${desiredWorkers} active=${activeWorkers} spawned=${spawned}`;
  workerConsole("org-issue-triage-supervisor", "info", msg);
  agentLog("org-issue-triage-supervisor", "info", msg);

  const latest = readTriageActiveState(root);
  await saveOrgSupervisorCycle("triage", {
    open_count: openCount,
    desired_workers: desiredWorkers,
    active_claims: activeTriageClaimsForDb(latest),
    last_error: classify.ok ? null : classify.tail.slice(-500),
  }).catch((err) => {
    workerConsole("org-issue-triage-supervisor", "warn", `db sync failed: ${String(err)}`);
  });

  return { openCount, triageCount, desiredWorkers, activeWorkers, spawned, message: msg };
}

export async function runOrgIssueTriageSupervisorLoop(signal?: AbortSignal): Promise<void> {
  if (!orgIssueTriageSupervisorEnabled()) {
    workerConsole(
      "org-issue-triage-supervisor",
      "warn",
      "disabled (set LI_ORG_ISSUE_TRIAGE_SUPERVISOR_ENABLED=1)",
    );
    return;
  }

  const intervalMs = orgIssueTriageSupervisorIntervalMs();
  const maxIdle = orgIssueTriageSupervisorMaxIdleCycles();
  workerConsole(
    "org-issue-triage-supervisor",
    "info",
    `loop started interval_ms=${intervalMs} max_idle=${maxIdle === 0 ? "Infinity" : maxIdle}`,
  );

  let idleCycles = 0;
  while (!signal?.aborted) {
    const tick = await orgIssueTriageSupervisorTick();
    if (
      tick.triageCount <= 0 &&
      tick.spawned === 0 &&
      tick.activeWorkers === 0
    ) {
      idleCycles++;
      if (idleLimitReached(idleCycles, maxIdle)) break;
    } else {
      idleCycles = 0;
    }
    await sleep(intervalMs, signal);
  }
}
