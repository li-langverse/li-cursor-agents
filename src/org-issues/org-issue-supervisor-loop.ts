import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { agentLog } from "../agent-log.js";
import { saveOrgSupervisorCycle } from "../db/org-supervisor-cycle.js";
import { workerConsole } from "../worker/worker-console.js";
import { agentsPackageRoot } from "../runner.js";
import {
  activeClaimsForDb,
  activeIssueRefs,
  claimIssue,
  countActiveWorkers,
  pruneTerminalActiveEntries,
  readActiveState,
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
  desiredWorkers: number;
  activeWorkers: number;
  spawned: number;
  message: string;
}

export async function orgIssueSupervisorTick(): Promise<SupervisorTickResult> {
  const root = agentsPackageRoot();
  pruneTerminalActiveEntries(root);

  const countRes = runPython("org-issue-open-count.py");
  let openCount = parseOpenCount(countRes.tail) ?? readQueueOpenTotal(root);

  const classify = runPython("org-classify-open-issues.py");
  if (classify.ok) {
    openCount = readQueueOpenTotal(root) || openCount;
  } else {
    workerConsole("org-issue-supervisor", "warn", `classify failed: ${classify.tail.slice(-200)}`);
  }

  const desiredWorkers = computeDesiredWorkers(openCount, orgIssueSupervisorMaxWorkers());
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
  }

  const slots = Math.max(0, desiredWorkers - activeWorkers);
  const queued = readImplementQueueIssues(root);
  const activeSet = activeIssueRefs(readActiveState(root));
  let spawned = 0;

  for (const issue of queued) {
    if (spawned >= slots) break;
    const ref = issueRef(issue.repo, issue.number);
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

  const msg = `open=${openCount} desired=${desiredWorkers} active=${activeWorkers} spawned=${spawned}`;
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

  return { openCount, desiredWorkers, activeWorkers, spawned, message: msg };
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
      if (tick.openCount <= 0) {
        workerConsole("org-issue-supervisor", "info", "no open issues — exiting");
        break;
      }
      if (tick.desiredWorkers === 0 || (tick.activeWorkers === 0 && tick.spawned === 0)) {
        idleCycles++;
        if (idleCycles >= maxIdle) {
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


