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
import { runOrgLaneObserverTick } from "../org/org-lane-observer-tick.js";
import {
  applyIssueFailurePolicy,
  isIssueSkipped,
  issueRefFromQueue,
} from "./org-issue-failure-policy.js";
import { getPrBackoff } from "../org-prs/org-pr-coordination.js";
import {
  activeClaimsForDb,
  activeIssueRefs,
  claimIssue,
  countActiveWorkers,
  pruneTerminalActiveEntries,
  readActiveState,
  readImplementQueueCount,
  readImplementQueueIssues,
  updateIssueStatus,
} from "./org-issue-coordination.js";
import {
  createImplementerJob,
  isInKubernetesCluster,
  listImplementerJobs,
} from "./org-issue-k8s-client.js";
import {
  computeDesiredWorkers,
  issueRef,
  orgIssueSupervisorEnabled,
  orgIssueSupervisorIntervalMs,
  orgIssueSupervisorMaxIdleCycles,
  orgIssueSupervisorMaxWorkers,
} from "./org-issue-supervisor-config.js";

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

function runPython(scriptName: string, args: string[] = []): { ok: boolean; tail: string } {
  const root = agentsPackageRoot();
  const script = join(root, "scripts", scriptName);
  if (!existsSync(script)) return { ok: false, tail: `missing ${script}` };
  const py = process.platform === "win32" ? "python" : "python3";
  const proc = spawnSync(py, [script, ...args], {
    cwd: root,
    env: process.env,
    encoding: "utf8",
    timeout: 3_600_000,
  });
  const tail = `${proc.stdout ?? ""}${proc.stderr ?? ""}`.trim().slice(-2000);
  return { ok: proc.status === 0, tail };
}

function parseOpenCount(tail: string): number | null {
  const m = /open_issues=(\d+)/.exec(tail);
  return m ? Number(m[1]) : null;
}

function readQueueOpenTotal(root: string): number {
  const path = join(root, "data", "goal-directed-sprints", "org-issue-queue.json");
  if (!existsSync(path)) return 0;
  const q = JSON.parse(readFileSync(path, "utf8")) as { report?: { total_open?: number } };
  return q.report?.total_open ?? 0;
}

export interface SupervisorTickResult {
  openCount: number;
  implementCount: number;
  desiredWorkers: number;
  activeWorkers: number;
  spawned: number;
  message: string;
}

export async function orgIssueSupervisorTick(): Promise<SupervisorTickResult> {
  const root = agentsPackageRoot();
  pruneTerminalActiveEntries(root);

  const backoff = getPrBackoff(root);
  const backoffUntilMs = backoff?.until ? Date.parse(backoff.until) : NaN;
  if (Number.isFinite(backoffUntilMs) && Date.now() < backoffUntilMs) {
    const msg = `GitHub rate limit backoff until ${backoff!.until}${backoff?.reason ? ` (${backoff.reason})` : ""}`;
    workerConsole("org-issue-supervisor", "info", msg);
    return {
      openCount: readQueueOpenTotal(root),
      implementCount: readImplementQueueCount(root),
      desiredWorkers: 0,
      activeWorkers: 0,
      spawned: 0,
      message: msg,
    };
  }

  const countRes = runPython("org-issue-open-count.py");
  let openCount = parseOpenCount(countRes.tail) ?? readQueueOpenTotal(root);

  const classify = runPython("org-classify-open-issues.py");
  if (classify.ok) {
    openCount = readQueueOpenTotal(root) || openCount;
  } else {
    workerConsole("org-issue-supervisor", "warn", `classify failed: ${classify.tail.slice(-200)}`);
  }

  const policy = applyIssueFailurePolicy(root);
  if (policy.demoted.length) {
    workerConsole(
      "org-issue-supervisor",
      "info",
      `failure policy demoted ${policy.demoted.length} issue(s)`,
    );
  }

  const implementCount = readImplementQueueCount(root);
  const desiredWorkers = computeDesiredWorkers(implementCount, orgIssueSupervisorMaxWorkers());
  const state = readActiveState(root);
  const activeRefs = activeIssueRefs(state);
  let activeWorkers = countActiveWorkers(state);

  if (isInKubernetesCluster()) {
    const jobs = await listImplementerJobs();
    activeWorkers = jobs.filter((j) => j.active).length;
    for (const job of jobs) {
      if (job.succeeded || job.failed) {
        const entry = Object.values(state.issues).find((e) => e.jobName === job.name);
        if (entry && (entry.status === "claimed" || entry.status === "running")) {
          updateIssueStatus(
            entry.issueRef,
            job.succeeded ? "completed" : "failed",
            job.succeeded ? "job succeeded" : "job failed",
            root,
          );
        }
      }
    }
    const reconciled = reconcileOrphanedK8sJobs(state.issues, jobs, (ref) =>
      updateIssueStatus(ref, "failed", "job missing (reconciled)", root),
    );
    if (reconciled) {
      workerConsole(
        "org-issue-supervisor",
        "info",
        `reconciled ${reconciled} orphaned job claim(s)`,
      );
    }
  }

  const slots = Math.max(0, desiredWorkers - activeWorkers);
  const queued = readImplementQueueIssues(root);
  const activeSet = activeIssueRefs(readActiveState(root));
  let spawned = 0;

  for (const issue of queued) {
    if (spawned >= slots) break;
    const ref = issueRefFromQueue(issue.repo, issue.number);
    if (isIssueSkipped(ref, root)) {
      workerConsole("org-issue-supervisor", "info", `skip cooldown ${ref}`);
      continue;
    }
    if (activeSet.has(ref)) continue;

    const workerId = randomBytes(4).toString("hex");
    if (!claimIssue(ref, issue.repo, issue.number, workerId, undefined, root)) continue;

    if (!isInKubernetesCluster()) {
      updateIssueStatus(ref, "running", "local stub (no k8s)", root);
      spawned++;
      workerConsole("org-issue-supervisor", "info", `local stub claimed ${ref}`);
      continue;
    }

    const created = await createImplementerJob({
      issueRef: ref,
      repo: issue.repo,
      number: issue.number,
      workerId,
    });
    if (!created.ok) {
      updateIssueStatus(ref, "failed", created.message, root);
      workerConsole("org-issue-supervisor", "ERROR", `spawn failed ${ref}: ${created.message}`);
      continue;
    }
    updateIssueStatus(ref, "running", `job ${created.jobName}`, root, created.jobName);
    spawned++;
    workerConsole("org-issue-supervisor", "info", `spawned job ${created.jobName} for ${ref}`);
  }

  const msg = `open=${openCount} implement=${implementCount} desired=${desiredWorkers} active=${activeWorkers} spawned=${spawned}`;
  workerConsole("org-issue-supervisor", "info", msg);
  agentLog("org-issue-supervisor", "info", msg);

  const latest = readActiveState(root);
  await saveOrgSupervisorCycle("issue", {
    open_count: openCount,
    desired_workers: desiredWorkers,
    active_claims: activeClaimsForDb(latest),
    last_error: classify.ok ? null : classify.tail.slice(-500),
  }).catch((err) => {
    workerConsole("org-issue-supervisor", "warn", `db sync failed: ${String(err)}`);
  });

  const observer = await runOrgLaneObserverTick("issue").catch((err) => {
    workerConsole("org-issue-supervisor", "warn", `observer: ${String(err)}`);
    return { message: "observer error", demoted: [], metaScheduled: false };
  });
  if (observer.message) {
    workerConsole("org-issue-supervisor", "info", `observer ${observer.message}`);
  }

  return { openCount, implementCount, desiredWorkers, activeWorkers, spawned, message: msg };
}

export async function runOrgIssueSupervisorLoop(signal?: AbortSignal): Promise<void> {
  if (!orgIssueSupervisorEnabled()) {
    workerConsole("org-issue-supervisor", "warn", "supervisor disabled (set LI_ORG_ISSUE_SUPERVISOR_ENABLED=1)");
    return;
  }

  const intervalMs = orgIssueSupervisorIntervalMs();
  const maxIdle = orgIssueSupervisorMaxIdleCycles();
  let idleCycles = 0;

  workerConsole("org-issue-supervisor", "info", `loop started interval_ms=${intervalMs} max_idle=${maxIdle}`);

  while (!signal?.aborted) {
    try {
      const tick = await orgIssueSupervisorTick();
      if (
        tick.implementCount <= 0 ||
        tick.desiredWorkers === 0 ||
        (tick.activeWorkers === 0 && tick.spawned === 0)
      ) {
        idleCycles++;
        if (idleLimitReached(idleCycles, maxIdle)) {
          workerConsole("org-issue-supervisor", "info", `idle limit reached (${maxIdle}) — exiting`);
          break;
        }
      } else {
        idleCycles = 0;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      agentLog("org-issue-supervisor", "ERROR", msg);
      workerConsole("org-issue-supervisor", "ERROR", msg);
    }
    await sleep(intervalMs, signal);
  }
}


