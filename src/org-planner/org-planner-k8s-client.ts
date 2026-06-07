import { FINISHED_JOB_TTL_SECONDS } from "../k8s/finished-job-ttl.js";
import { k8sGitHubSecretEnv } from "../org/k8s-github-secret-env.js";
import { readFileSync } from "node:fs";
import https from "node:https";
import { randomBytes } from "node:crypto";
import {
  orgPlannerSupervisorDeploymentName,
  orgPlannerSupervisorImage,
  orgPlannerSupervisorNamespace,
  orgPlannerSupervisorNodeSelector,
  planSlug,
} from "./org-planner-supervisor-config.js";
import type { PlannerWorkKind } from "./org-planner-coordination.js";

interface InClusterConfig {
  baseUrl: string;
  token: string;
  ca: Buffer;
  namespace: string;
}

export interface K8sPlannerJobSummary {
  name: string;
  planRef: string;
  active: boolean;
  succeeded: boolean;
  failed: boolean;
}

function inClusterConfig(): InClusterConfig | null {
  try {
    const token = readFileSync("/var/run/secrets/kubernetes.io/serviceaccount/token", "utf8").trim();
    const ca = readFileSync("/var/run/secrets/kubernetes.io/serviceaccount/ca.crt");
    const namespace = readFileSync("/var/run/secrets/kubernetes.io/serviceaccount/namespace", "utf8").trim();
    const host = process.env.KUBERNETES_SERVICE_HOST;
    const port = process.env.KUBERNETES_SERVICE_PORT_HTTPS ?? "443";
    if (!host) return null;
    return { baseUrl: `https://${host}:${port}`, token, ca, namespace };
  } catch {
    return null;
  }
}

function k8sRequest(
  cfg: InClusterConfig,
  method: string,
  path: string,
  body?: unknown,
  contentType = "application/json",
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path.startsWith("/") ? path : `/${path}`, cfg.baseUrl);
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = https.request(
      url,
      {
        method,
        ca: cfg.ca,
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          Accept: "application/json",
          ...(payload
            ? { "Content-Type": contentType, "Content-Length": Buffer.byteLength(payload) }
            : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let parsed: unknown = raw;
          if (raw) {
            try {
              parsed = JSON.parse(raw);
            } catch {
              parsed = raw;
            }
          }
          resolve({ status: res.statusCode ?? 0, body: parsed });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}


const PLANNER_HOTFIX_CM = process.env.LI_ORG_PLANNER_HOTFIX_CONFIGMAP?.trim() || "li-org-planner-hotfix";

export function plannerHotfixVolumeMounts(): Array<{ name: string; mountPath: string; subPath?: string }> {
  // SubPath only — a full-dir mount hides the image's org-planner modules and breaks imports.
  return [
    {
      name: "planner-hotfix",
      mountPath: "/app/dist/org-planner/org-planner-plan-cycle.js",
      subPath: "org-planner-plan-cycle.js",
    },
    {
      name: "planner-hotfix",
      mountPath: "/app/dist/cli/org-planner-worker.js",
      subPath: "org-planner-worker.js",
    },
  ];
}

function plannerHotfixVolumes(): Array<{ name: string; configMap: { name: string; optional?: boolean } }> {
  return [{ name: "planner-hotfix", configMap: { name: PLANNER_HOTFIX_CM, optional: true } }];
}
export function isInKubernetesCluster(): boolean {
  return inClusterConfig() !== null;
}

export function k8sNamespace(): string {
  return inClusterConfig()?.namespace ?? orgPlannerSupervisorNamespace();
}

function sanitizeLabel(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 63);
}

function jobLabels(planRef: string, workerId: string, kind: PlannerWorkKind): Record<string, string> {
  return {
    "app.kubernetes.io/name": "li-org-planner-worker",
    "li-langverse.io/org-plan": sanitizeLabel(planRef),
    "li-langverse.io/planner-kind": kind,
    "li-langverse.io/worker-id": sanitizeLabel(workerId),
    "li-langverse.io/managed-by": "org-planner-supervisor",
  };
}

export function plannerJobName(kind: PlannerWorkKind, key: string): string {
  const suffix = randomBytes(3).toString("hex");
  const base = `li-org-plan-${planSlug(kind, key)}-${suffix}`;
  return base.slice(0, 63);
}

export async function listPlannerJobs(): Promise<K8sPlannerJobSummary[]> {
  const cfg = inClusterConfig();
  if (!cfg) return [];
  const ns = orgPlannerSupervisorNamespace();
  const path = `/apis/batch/v1/namespaces/${ns}/jobs?labelSelector=${encodeURIComponent("li-langverse.io/managed-by=org-planner-supervisor")}`;
  const res = await k8sRequest(cfg, "GET", path);
  if (res.status !== 200 || !res.body || typeof res.body !== "object") return [];
  const items = (res.body as { items?: unknown[] }).items ?? [];
  const out: K8sPlannerJobSummary[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const job = item as {
      metadata?: { name?: string; labels?: Record<string, string>; annotations?: Record<string, string> };
      status?: { active?: number; succeeded?: number; failed?: number };
    };
    const name = job.metadata?.name ?? "";
    const planRef =
      job.metadata?.annotations?.["li-langverse.io/org-plan-ref"] ??
      job.metadata?.labels?.["li-langverse.io/org-plan"] ??
      name;
    out.push({
      name,
      planRef,
      active: (job.status?.active ?? 0) > 0,
      succeeded: (job.status?.succeeded ?? 0) > 0,
      failed: (job.status?.failed ?? 0) > 0,
    });
  }
  return out;
}

export async function createPlannerJob(options: {
  planRef: string;
  kind: PlannerWorkKind;
  workerId: string;
  issueRef?: string;
  repo?: string;
  number?: number;
  goalId?: string;
  sessionId?: string;
  handoffId?: string;
}): Promise<{ ok: boolean; jobName?: string; message?: string }> {
  const cfg = inClusterConfig();
  if (!cfg) {
    return { ok: false, message: "not in kubernetes cluster" };
  }
  const ns = orgPlannerSupervisorNamespace();
  const key =
    options.kind === "issue_plan"
      ? `${options.repo}-${options.number}`
      : `${options.goalId}-${options.sessionId?.slice(0, 8)}`;
  const jobName = plannerJobName(options.kind, key ?? options.planRef);
  const nodeSelector = orgPlannerSupervisorNodeSelector();
  const image = orgPlannerSupervisorImage();
  const labels = jobLabels(options.planRef, options.workerId, options.kind);

  const args = [
    "node",
    "dist/cli/org-planner-worker.js",
    "--plan-ref",
    options.planRef,
    "--kind",
    options.kind,
    "--worker-id",
    options.workerId,
  ];
  if (options.issueRef) args.push("--issue", options.issueRef);
  if (options.repo) args.push("--repo", options.repo);
  if (options.number != null) args.push("--number", String(options.number));
  if (options.goalId) args.push("--goal-id", options.goalId);
  if (options.sessionId) args.push("--session-id", options.sessionId);
  if (options.handoffId) args.push("--handoff-id", options.handoffId);

  const job = {
    apiVersion: "batch/v1",
    kind: "Job",
    metadata: {
      name: jobName,
      namespace: ns,
      labels,
      annotations: {
        "li-langverse.io/org-plan-ref": options.planRef,
      },
    },
    spec: {
      backoffLimit: 0,
      ttlSecondsAfterFinished: FINISHED_JOB_TTL_SECONDS,
      activeDeadlineSeconds: 7200,
      template: {
        metadata: { labels, annotations: { "li-langverse.io/org-plan-ref": options.planRef } },
        spec: {
          restartPolicy: "Never",
          serviceAccountName: "li-org-planner-worker",
          nodeSelector,
          containers: [
            {
              name: "planner",
              image,
              imagePullPolicy: "Always",
              command: args,
              envFrom: [{ configMapRef: { name: "li-org-planner-supervisor" } }],
              env: [
                ...k8sGitHubSecretEnv(),
                {
                  name: "CURSOR_API_KEY",
                  valueFrom: {
                    secretKeyRef: { name: "li-agents-secrets", key: "CURSOR_API_KEY", optional: true },
                  },
                },
                {
                  name: "CURSOR_SDK_KEY",
                  valueFrom: {
                    secretKeyRef: { name: "li-agents-secrets", key: "CURSOR_SDK_KEY", optional: true },
                  },
                },
                {
                  name: "SUPABASE_URL",
                  valueFrom: {
                    secretKeyRef: { name: "li-agents-secrets", key: "SUPABASE_URL", optional: true },
                  },
                },
                {
                  name: "SUPABASE_SERVICE_ROLE_KEY",
                  valueFrom: {
                    secretKeyRef: {
                      name: "li-agents-secrets",
                      key: "SUPABASE_SERVICE_ROLE_KEY",
                      optional: true,
                    },
                  },
                },
              ],
              resources: {
                requests: { cpu: "250m", memory: "512Mi" },
                limits: { cpu: "2", memory: "2Gi" },
              },
              volumeMounts: [
                ...plannerHotfixVolumeMounts(),
                { name: "sprint-data", mountPath: "/app/data/goal-directed-sprints" },
                { name: "handoffs-data", mountPath: "/app/data/handoffs" },
              ],
            },
          ],
          volumes: [
            ...plannerHotfixVolumes(),
            {
              name: "sprint-data",
              persistentVolumeClaim: { claimName: "li-agents-sprint-data" },
            },
            {
              name: "handoffs-data",
              persistentVolumeClaim: { claimName: "li-agents-sprint-data" },
            },
          ],
        },
      },
    },
  };

  const path = `/apis/batch/v1/namespaces/${ns}/jobs`;
  const res = await k8sRequest(cfg, "POST", path, job);
  if (res.status === 201) return { ok: true, jobName };
  const msg =
    typeof res.body === "object" && res.body && "message" in res.body
      ? String((res.body as { message?: string }).message)
      : JSON.stringify(res.body).slice(0, 500);
  return { ok: false, message: `create job failed (${res.status}): ${msg}` };
}

export async function ensureSupervisorDeployment(): Promise<{ ok: boolean; message: string }> {
  const cfg = inClusterConfig();
  if (!cfg) {
    return { ok: false, message: "wake skipped: not in kubernetes cluster (apply Deployment manually)" };
  }
  const ns = orgPlannerSupervisorNamespace();
  const name = orgPlannerSupervisorDeploymentName();
  const getPath = `/apis/apps/v1/namespaces/${ns}/deployments/${name}`;
  const getRes = await k8sRequest(cfg, "GET", getPath);

  if (getRes.status === 404) {
    return {
      ok: false,
      message: `deployment ${name} not found — apply deploy/k8s/engine/deployment-org-planner-supervisor.yaml first`,
    };
  }
  if (getRes.status !== 200) {
    return { ok: false, message: `get deployment failed (${getRes.status})` };
  }

  const patchPath = `/apis/apps/v1/namespaces/${ns}/deployments/${name}`;
  const patch = { spec: { replicas: 1 } };
  const patchRes = await k8sRequest(
    cfg,
    "PATCH",
    patchPath,
    patch,
    "application/merge-patch+json",
  );
  if (patchRes.status !== 200) {
    return { ok: false, message: `scale deployment failed (${patchRes.status})` };
  }

  return { ok: true, message: `deployment ${name} scaled to 1 replica in ${ns}` };
}
