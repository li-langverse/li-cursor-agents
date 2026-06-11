import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { agentLog } from "../agent-log.js";
import { workerConsole } from "../worker/worker-console.js";
import { agentsPackageRoot } from "../runner.js";
import { sprintDataDir } from "../org-issues/org-issue-coordination.js";
import {
  ORG_SUPERVISOR_DEPLOYMENTS,
  ORG_WAKE_CRONJOBS,
  STUCK_CONTAINER_REASONS,
  STUCK_SUPERVISOR_REASONS,
  type UnblockerAction,
  orgUnblockerLongRunJobMinutes,
  orgUnblockerNamespace,
  orgUnblockerStuckJobMinutes,
} from "./org-unblocker-config.js";
import { inClusterConfig, k8sRequest } from "./org-unblocker-k8s.js";
import {
  healBackoffFiles,
  pruneExpiredCooldowns,
  pruneExpiredIssueSkips,
  pruneTerminalLaneClaims,
  reconcileOrphanedLaneClaims,
} from "./org-unblocker-state.js";

const SECRETS_NAME = "li-agents-secrets";

export type { UnblockerAction };

export interface UnblockerTickResult {
  actions: UnblockerAction[];
  message: string;
}

function auditPath(root = agentsPackageRoot()): string {
  return join(sprintDataDir(root), "org-unblocker-audit.jsonl");
}

function appendAudit(row: Record<string, unknown>, root = agentsPackageRoot()): void {
  const path = auditPath(root);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify({ ts: new Date().toISOString(), ...row })}\n`, "utf8");
}

async function ensureSwarmSecrets(
  cfg: NonNullable<ReturnType<typeof inClusterConfig>>,
  ns: string,
): Promise<UnblockerAction[]> {
  const actions: UnblockerAction[] = [];
  const path = `/api/v1/namespaces/${ns}/secrets/${SECRETS_NAME}`;
  const res = await k8sRequest(cfg, "GET", path);
  if (res.status === 404) {
    actions.push({ kind: "secret_missing", detail: SECRETS_NAME });
    return actions;
  }
  if (res.status !== 200 || !res.body || typeof res.body !== "object") {
    actions.push({ kind: "secret_get_failed", detail: `status=${res.status}` });
    return actions;
  }

  const data = (res.body as { data?: Record<string, string> }).data ?? {};
  const patch: Record<string, string> = {};
  if (data.GH_TOKEN && !data.GH_SWARM_TOKEN) patch.GH_SWARM_TOKEN = data.GH_TOKEN;
  if (data.GH_SWARM_TOKEN && !data.GH_TOKEN) patch.GH_TOKEN = data.GH_SWARM_TOKEN;
  if (data.CURSOR_API_KEY && !data.CURSOR_SDK_KEY) patch.CURSOR_SDK_KEY = data.CURSOR_API_KEY;
  if (data.CURSOR_SDK_KEY && !data.CURSOR_API_KEY) patch.CURSOR_API_KEY = data.CURSOR_SDK_KEY;

  if (!Object.keys(patch).length) return actions;

  const patchRes = await k8sRequest(cfg, "PATCH", path, { data: patch }, "application/merge-patch+json");
  if (patchRes.status === 200) {
    actions.push({ kind: "secret_patched", detail: Object.keys(patch).join(",") });
  } else {
    actions.push({ kind: "secret_patch_failed", detail: `status=${patchRes.status}` });
  }
  return actions;
}

interface PodRow {
  name: string;
  jobName?: string;
  deploymentName?: string;
  phase: string;
  waitingReason?: string;
  startedAt?: string;
  runningStartedAt?: string;
}

async function listNamespacePods(
  cfg: NonNullable<ReturnType<typeof inClusterConfig>>,
  ns: string,
): Promise<PodRow[]> {
  const path = `/api/v1/namespaces/${ns}/pods`;
  const res = await k8sRequest(cfg, "GET", path);
  if (res.status !== 200 || !res.body || typeof res.body !== "object") return [];
  const items = (res.body as { items?: unknown[] }).items ?? [];
  const out: PodRow[] = [];

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const pod = item as {
      metadata?: {
        name?: string;
        labels?: Record<string, string>;
        ownerReferences?: { kind?: string; name?: string }[];
      };
      status?: {
        phase?: string;
        startTime?: string;
        containerStatuses?: {
          state?: {
            waiting?: { reason?: string };
            running?: { startedAt?: string };
            terminated?: { reason?: string };
          };
        }[];
      };
    };

    const owners = pod.metadata?.ownerReferences ?? [];
    const jobOwner = owners.find((o) => o.kind === "Job");
    const labels = pod.metadata?.labels ?? {};
    const appLabel = labels.app;

    let waitingReason: string | undefined;
    let runningStartedAt: string | undefined;
    for (const cs of pod.status?.containerStatuses ?? []) {
      const w = cs.state?.waiting?.reason;
      if (w) waitingReason = w;
      if (cs.state?.running?.startedAt) runningStartedAt = cs.state.running.startedAt;
      const term = cs.state?.terminated?.reason;
      if (term === "OOMKilled" || term === "Error") waitingReason = term;
    }

    const row: PodRow = {
      name: pod.metadata?.name ?? "",
      phase: pod.status?.phase ?? "Unknown",
      waitingReason,
      startedAt: pod.status?.startTime,
      runningStartedAt,
    };

    if (jobOwner?.name?.startsWith("li-org-")) {
      row.jobName = jobOwner.name;
    } else if (appLabel && ORG_SUPERVISOR_DEPLOYMENTS.includes(appLabel as (typeof ORG_SUPERVISOR_DEPLOYMENTS)[number])) {
      row.deploymentName = appLabel;
    }
    out.push(row);
  }
  return out;
}

interface JobRow {
  name: string;
  active: boolean;
  succeeded: boolean;
  failed: boolean;
}

async function listOrgJobs(
  cfg: NonNullable<ReturnType<typeof inClusterConfig>>,
  ns: string,
): Promise<JobRow[]> {
  const path = `/apis/batch/v1/namespaces/${ns}/jobs`;
  const res = await k8sRequest(cfg, "GET", path);
  if (res.status !== 200 || !res.body || typeof res.body !== "object") return [];
  const items = (res.body as { items?: unknown[] }).items ?? [];
  const out: JobRow[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const job = item as {
      metadata?: { name?: string };
      status?: { active?: number; succeeded?: number; failed?: number };
    };
    const name = job.metadata?.name ?? "";
    if (!name.startsWith("li-org-")) continue;
    out.push({
      name,
      active: (job.status?.active ?? 0) > 0,
      succeeded: (job.status?.succeeded ?? 0) > 0,
      failed: (job.status?.failed ?? 0) > 0,
    });
  }
  return out;
}

async function deleteJob(
  cfg: NonNullable<ReturnType<typeof inClusterConfig>>,
  ns: string,
  name: string,
): Promise<boolean> {
  const path = `/apis/batch/v1/namespaces/${ns}/jobs/${name}?propagationPolicy=Background`;
  const res = await k8sRequest(cfg, "DELETE", path);
  return res.status === 200 || res.status === 202;
}

async function restartDeployment(
  cfg: NonNullable<ReturnType<typeof inClusterConfig>>,
  ns: string,
  name: string,
): Promise<boolean> {
  const path = `/apis/apps/v1/namespaces/${ns}/deployments/${name}`;
  const patch = {
    spec: {
      template: {
        metadata: {
          annotations: {
            "li-langverse.io/unblocker-restartedAt": new Date().toISOString(),
          },
        },
      },
    },
  };
  const res = await k8sRequest(cfg, "PATCH", path, patch, "application/merge-patch+json");
  return res.status === 200;
}

async function healStuckJobs(
  cfg: NonNullable<ReturnType<typeof inClusterConfig>>,
  ns: string,
): Promise<UnblockerAction[]> {
  const actions: UnblockerAction[] = [];
  const stuckMinutes = orgUnblockerStuckJobMinutes();
  const longRunMinutes = orgUnblockerLongRunJobMinutes();
  const stuckCutoff = Date.now() - stuckMinutes * 60_000;
  const longCutoff = Date.now() - longRunMinutes * 60_000;
  const pods = await listNamespacePods(cfg, ns);
  const jobsToDelete = new Set<string>();

  for (const pod of pods) {
    if (!pod.jobName) continue;
    if (pod.waitingReason && STUCK_CONTAINER_REASONS.has(pod.waitingReason)) {
      jobsToDelete.add(pod.jobName);
      continue;
    }
    if (pod.phase === "Pending" && pod.startedAt) {
      const started = Date.parse(pod.startedAt);
      if (Number.isFinite(started) && started < stuckCutoff) {
        jobsToDelete.add(pod.jobName);
      }
      continue;
    }
    if (pod.phase === "Running" && pod.runningStartedAt) {
      const started = Date.parse(pod.runningStartedAt);
      if (Number.isFinite(started) && started < longCutoff) {
        jobsToDelete.add(pod.jobName);
      }
    }
  }

  for (const jobName of jobsToDelete) {
    const ok = await deleteJob(cfg, ns, jobName);
    actions.push({
      kind: ok ? "deleted_stuck_job" : "delete_stuck_job_failed",
      detail: jobName,
    });
  }
  return actions;
}

async function deleteTerminalOrgJobs(
  cfg: NonNullable<ReturnType<typeof inClusterConfig>>,
  ns: string,
): Promise<UnblockerAction[]> {
  const actions: UnblockerAction[] = [];
  const jobs = await listOrgJobs(cfg, ns);
  for (const job of jobs) {
    if (job.active) continue;
    if (!job.succeeded && !job.failed) continue;
    const ok = await deleteJob(cfg, ns, job.name);
    actions.push({
      kind: ok ? "deleted_terminal_job" : "delete_terminal_job_failed",
      detail: job.name,
    });
  }
  return actions;
}

async function healSupervisorPods(
  cfg: NonNullable<ReturnType<typeof inClusterConfig>>,
  ns: string,
): Promise<UnblockerAction[]> {
  const actions: UnblockerAction[] = [];
  const restarted = new Set<string>();
  const pods = await listNamespacePods(cfg, ns);

  for (const pod of pods) {
    if (!pod.deploymentName) continue;
    if (!pod.waitingReason || !STUCK_SUPERVISOR_REASONS.has(pod.waitingReason)) continue;
    if (restarted.has(pod.deploymentName)) continue;
    const ok = await restartDeployment(cfg, ns, pod.deploymentName);
    actions.push({
      kind: ok ? "restarted_supervisor" : "restart_supervisor_failed",
      detail: `${pod.deploymentName} (${pod.waitingReason})`,
    });
    restarted.add(pod.deploymentName);
  }
  return actions;
}

async function scaleSupervisors(
  cfg: NonNullable<ReturnType<typeof inClusterConfig>>,
  ns: string,
): Promise<UnblockerAction[]> {
  const actions: UnblockerAction[] = [];
  for (const name of ORG_SUPERVISOR_DEPLOYMENTS) {
    const path = `/apis/apps/v1/namespaces/${ns}/deployments/${name}`;
    const getRes = await k8sRequest(cfg, "GET", path);
    if (getRes.status === 404) continue;
    if (getRes.status !== 200 || !getRes.body || typeof getRes.body !== "object") continue;
    const replicas = (getRes.body as { spec?: { replicas?: number } }).spec?.replicas ?? 0;
    if (replicas >= 1) continue;
    const patchRes = await k8sRequest(
      cfg,
      "PATCH",
      path,
      { spec: { replicas: 1 } },
      "application/merge-patch+json",
    );
    actions.push({
      kind: patchRes.status === 200 ? "scaled_supervisor" : "scale_supervisor_failed",
      detail: `${name} 0->1`,
    });
  }
  return actions;
}

async function unsuspendCron(
  cfg: NonNullable<ReturnType<typeof inClusterConfig>>,
  ns: string,
  name: string,
): Promise<UnblockerAction | null> {
  const path = `/apis/batch/v1/namespaces/${ns}/cronjobs/${name}`;
  const getRes = await k8sRequest(cfg, "GET", path);
  if (getRes.status === 404) return null;
  if (getRes.status !== 200 || !getRes.body || typeof getRes.body !== "object") return null;
  if ((getRes.body as { spec?: { suspend?: boolean } }).spec?.suspend !== true) return null;
  const patchRes = await k8sRequest(
    cfg,
    "PATCH",
    path,
    { spec: { suspend: false } },
    "application/merge-patch+json",
  );
  return {
    kind: patchRes.status === 200 ? "unsuspended_cron" : "unsuspend_cron_failed",
    detail: name,
  };
}

async function unsuspendAllCrons(
  cfg: NonNullable<ReturnType<typeof inClusterConfig>>,
  ns: string,
): Promise<UnblockerAction[]> {
  const actions: UnblockerAction[] = [];
  for (const name of [...ORG_WAKE_CRONJOBS, "li-org-issue-worker", "li-org-swarm-stability-check"]) {
    const a = await unsuspendCron(cfg, ns, name);
    if (a) actions.push(a);
  }
  return actions;
}

function healDiskState(root = agentsPackageRoot()): UnblockerAction[] {
  return [
    ...healBackoffFiles(root),
    ...pruneExpiredIssueSkips(root),
    ...pruneExpiredCooldowns(root),
    ...pruneTerminalLaneClaims(root),
  ];
}

/** One infra self-heal pass for org swarm workers and supervisors. */
export async function orgUnblockerTick(): Promise<UnblockerTickResult> {
  const root = agentsPackageRoot();
  const cfg = inClusterConfig();
  if (!cfg) {
    const msg = "not in kubernetes cluster";
    workerConsole("org-unblocker", "warn", msg);
    return { actions: [], message: msg };
  }

  const ns = orgUnblockerNamespace();
  const actions: UnblockerAction[] = [];

  actions.push(...healDiskState(root));
  actions.push(...(await ensureSwarmSecrets(cfg, ns)));

  const jobs = await listOrgJobs(cfg, ns);
  const liveJobNames = new Set(jobs.map((j) => j.name));
  actions.push(...reconcileOrphanedLaneClaims(liveJobNames, root));

  actions.push(...(await healStuckJobs(cfg, ns)));
  actions.push(...(await deleteTerminalOrgJobs(cfg, ns)));
  actions.push(...(await healSupervisorPods(cfg, ns)));
  actions.push(...(await scaleSupervisors(cfg, ns)));
  actions.push(...(await unsuspendAllCrons(cfg, ns)));

  const msg =
    actions.length === 0
      ? "ok (no actions)"
      : actions.map((a) => `${a.kind}:${a.detail}`).join("; ");
  workerConsole("org-unblocker", "info", msg);
  agentLog("org-unblocker", "info", msg);

  if (actions.length) {
    appendAudit({ actions, message: msg }, root);
  }

  return { actions, message: msg };
}
