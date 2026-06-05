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
  orgUnblockerNamespace,
  orgUnblockerStuckJobMinutes,
} from "./org-unblocker-config.js";
import { inClusterConfig, k8sRequest } from "./org-unblocker-k8s.js";

const SECRETS_NAME = "li-agents-secrets";

export interface UnblockerAction {
  kind: string;
  detail: string;
}

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
  const gh = data.GH_TOKEN;
  const swarm = data.GH_SWARM_TOKEN;
  const patch: Record<string, string> = {};
  if (gh && !swarm) patch.GH_SWARM_TOKEN = gh;
  if (swarm && !gh) patch.GH_TOKEN = swarm;
  if (!Object.keys(patch).length) return actions;

  const patchRes = await k8sRequest(cfg, "PATCH", path, { data: patch }, "application/merge-patch+json");
  if (patchRes.status === 200) {
    const keys = Object.keys(patch).join(",");
    actions.push({ kind: "secret_patched", detail: keys });
  } else {
    actions.push({ kind: "secret_patch_failed", detail: `status=${patchRes.status}` });
  }
  return actions;
}

interface PodRow {
  name: string;
  jobName?: string;
  phase: string;
  waitingReason?: string;
  startedAt?: string;
}

async function listOrgWorkerPods(
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
        ownerReferences?: { kind?: string; name?: string }[];
      };
      status?: {
        phase?: string;
        startTime?: string;
        containerStatuses?: {
          state?: { waiting?: { reason?: string } };
        }[];
      };
    };
    const owners = pod.metadata?.ownerReferences ?? [];
    const jobOwner = owners.find((o) => o.kind === "Job");
    if (!jobOwner?.name) continue;
    if (!jobOwner.name.startsWith("li-org-")) continue;

    let waitingReason: string | undefined;
    for (const cs of pod.status?.containerStatuses ?? []) {
      const reason = cs.state?.waiting?.reason;
      if (reason) {
        waitingReason = reason;
        break;
      }
    }
    out.push({
      name: pod.metadata?.name ?? "",
      jobName: jobOwner.name,
      phase: pod.status?.phase ?? "Unknown",
      waitingReason,
      startedAt: pod.status?.startTime,
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

async function healStuckJobs(
  cfg: NonNullable<ReturnType<typeof inClusterConfig>>,
  ns: string,
): Promise<UnblockerAction[]> {
  const actions: UnblockerAction[] = [];
  const stuckMinutes = orgUnblockerStuckJobMinutes();
  const cutoff = Date.now() - stuckMinutes * 60_000;
  const pods = await listOrgWorkerPods(cfg, ns);
  const jobsToDelete = new Set<string>();

  for (const pod of pods) {
    if (!pod.jobName) continue;
    if (pod.waitingReason && STUCK_CONTAINER_REASONS.has(pod.waitingReason)) {
      jobsToDelete.add(pod.jobName);
      continue;
    }
    if (pod.phase === "Pending" && pod.startedAt) {
      const started = Date.parse(pod.startedAt);
      if (Number.isFinite(started) && started < cutoff) {
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

async function unsuspendWakeCrons(
  cfg: NonNullable<ReturnType<typeof inClusterConfig>>,
  ns: string,
): Promise<UnblockerAction[]> {
  const actions: UnblockerAction[] = [];
  for (const name of ORG_WAKE_CRONJOBS) {
    const path = `/apis/batch/v1/namespaces/${ns}/cronjobs/${name}`;
    const getRes = await k8sRequest(cfg, "GET", path);
    if (getRes.status === 404) continue;
    if (getRes.status !== 200 || !getRes.body || typeof getRes.body !== "object") continue;
    const suspended = (getRes.body as { spec?: { suspend?: boolean } }).spec?.suspend === true;
    if (!suspended) continue;
    const patchRes = await k8sRequest(
      cfg,
      "PATCH",
      path,
      { spec: { suspend: false } },
      "application/merge-patch+json",
    );
    actions.push({
      kind: patchRes.status === 200 ? "unsuspended_cron" : "unsuspend_cron_failed",
      detail: name,
    });
  }
  return actions;
}

async function unsuspendIssueWorkerCron(
  cfg: NonNullable<ReturnType<typeof inClusterConfig>>,
  ns: string,
): Promise<UnblockerAction[]> {
  const name = "li-org-issue-worker";
  const path = `/apis/batch/v1/namespaces/${ns}/cronjobs/${name}`;
  const getRes = await k8sRequest(cfg, "GET", path);
  if (getRes.status !== 200 || !getRes.body || typeof getRes.body !== "object") return [];
  if ((getRes.body as { spec?: { suspend?: boolean } }).spec?.suspend !== true) return [];
  const patchRes = await k8sRequest(
    cfg,
    "PATCH",
    path,
    { spec: { suspend: false } },
    "application/merge-patch+json",
  );
  return [
    {
      kind: patchRes.status === 200 ? "unsuspended_cron" : "unsuspend_cron_failed",
      detail: name,
    },
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

  actions.push(...(await ensureSwarmSecrets(cfg, ns)));
  actions.push(...(await healStuckJobs(cfg, ns)));
  actions.push(...(await scaleSupervisors(cfg, ns)));
  actions.push(...(await unsuspendWakeCrons(cfg, ns)));
  actions.push(...(await unsuspendIssueWorkerCron(cfg, ns)));

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
