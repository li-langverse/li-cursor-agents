import { FINISHED_JOB_TTL_SECONDS } from "../k8s/finished-job-ttl.js";
import { readFileSync } from "node:fs";
import https from "node:https";
import { randomBytes } from "node:crypto";
import {
  implementSlug,
  orgImplementSupervisorDeploymentName,
  orgImplementSupervisorImage,
  orgImplementSupervisorNamespace,
  orgImplementSupervisorNodeSelector,
} from "./org-implement-supervisor-config.js";

interface InClusterConfig {
  baseUrl: string;
  token: string;
  ca: Buffer;
  namespace: string;
}

export interface K8sJobSummary {
  name: string;
  implementRef: string;
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

export function isInKubernetesCluster(): boolean {
  return inClusterConfig() !== null;
}

function sanitizeLabel(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 63);
}

function jobLabels(implementRef: string, workerId: string): Record<string, string> {
  return {
    "app.kubernetes.io/name": "li-org-implement-goals-worker",
    "li-langverse.io/org-implement": sanitizeLabel(implementRef),
    "li-langverse.io/worker-id": sanitizeLabel(workerId),
    "li-langverse.io/managed-by": "org-implement-goals-supervisor",
  };
}

export function implementJobName(implementRef: string): string {
  const suffix = randomBytes(3).toString("hex");
  const base = `li-org-implg-${implementSlug(implementRef)}-${suffix}`;
  return base.slice(0, 63);
}

const workerVolumeMounts = [
  { name: "sprint-data", mountPath: "/app/data/goal-directed-sprints" },
  { name: "handoffs-data", mountPath: "/app/data/handoffs" },
  { name: "lanes-data", mountPath: "/app/data/lanes" },
];

const workerVolumes = [
  { name: "sprint-data", persistentVolumeClaim: { claimName: "li-agents-sprint-data" } },
  { name: "handoffs-data", persistentVolumeClaim: { claimName: "li-agents-sprint-data" } },
  { name: "lanes-data", persistentVolumeClaim: { claimName: "li-agents-sprint-data" } },
];

export async function listImplementGoalsJobs(): Promise<K8sJobSummary[]> {
  const cfg = inClusterConfig();
  if (!cfg) return [];
  const ns = orgImplementSupervisorNamespace();
  const path = `/apis/batch/v1/namespaces/${ns}/jobs?labelSelector=${encodeURIComponent("li-langverse.io/managed-by=org-implement-goals-supervisor")}`;
  const res = await k8sRequest(cfg, "GET", path);
  if (res.status !== 200 || !res.body || typeof res.body !== "object") return [];
  const items = (res.body as { items?: unknown[] }).items ?? [];
  const out: K8sJobSummary[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const job = item as {
      metadata?: { name?: string; labels?: Record<string, string>; annotations?: Record<string, string> };
      status?: { active?: number; succeeded?: number; failed?: number };
    };
    const name = job.metadata?.name ?? "";
    const implementRef =
      job.metadata?.annotations?.["li-langverse.io/org-implement-ref"] ??
      job.metadata?.labels?.["li-langverse.io/org-implement"] ??
      name;
    out.push({
      name,
      implementRef,
      active: (job.status?.active ?? 0) > 0,
      succeeded: (job.status?.succeeded ?? 0) > 0,
      failed: (job.status?.failed ?? 0) > 0,
    });
  }
  return out;
}

export async function createImplementGoalsJob(options: {
  implementRef: string;
  workerId: string;
}): Promise<{ ok: boolean; jobName?: string; message?: string }> {
  const cfg = inClusterConfig();
  if (!cfg) {
    return { ok: false, message: "not in kubernetes cluster" };
  }
  const ns = orgImplementSupervisorNamespace();
  const jobName = implementJobName(options.implementRef);
  const nodeSelector = orgImplementSupervisorNodeSelector();
  const image = orgImplementSupervisorImage();
  const labels = jobLabels(options.implementRef, options.workerId);

  const job = {
    apiVersion: "batch/v1",
    kind: "Job",
    metadata: {
      name: jobName,
      namespace: ns,
      labels,
      annotations: {
        "li-langverse.io/org-implement-ref": options.implementRef,
      },
    },
    spec: {
      backoffLimit: 0,
      ttlSecondsAfterFinished: FINISHED_JOB_TTL_SECONDS,
      activeDeadlineSeconds: 7200,
      template: {
        metadata: {
          labels,
          annotations: {
            "li-langverse.io/org-implement-ref": options.implementRef,
          },
        },
        spec: {
          restartPolicy: "Never",
          serviceAccountName: "li-org-implement-goals-worker",
          nodeSelector,
          containers: [
            {
              name: "implement-goals-worker",
              image,
              imagePullPolicy: "IfNotPresent",
              command: [
                "/app/deploy/org-worker-entrypoint.sh",
                "node",
                "dist/cli/org-implement-goals-worker.js",
                "--implement",
                options.implementRef,
                "--worker-id",
                options.workerId,
              ],
              envFrom: [{ configMapRef: { name: "li-org-implement-goals-supervisor" } }],
              env: [
                {
                  name: "GITLAB_TOKEN",
                  valueFrom: {
                    secretKeyRef: { name: "li-agents-secrets", key: "GITLAB_TOKEN", optional: true },
                  },
                },
                {
                  name: "GH_TOKEN",
                  valueFrom: {
                    secretKeyRef: { name: "li-agents-secrets", key: "GH_SWARM_TOKEN", optional: true },
                  },
                },
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
              ],
              resources: {
                requests: { cpu: "250m", memory: "512Mi" },
                limits: { cpu: "2", memory: "2Gi" },
              },
              volumeMounts: workerVolumeMounts,
            },
          ],
          volumes: workerVolumes,
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
  const ns = orgImplementSupervisorNamespace();
  const name = orgImplementSupervisorDeploymentName();
  const getPath = `/apis/apps/v1/namespaces/${ns}/deployments/${name}`;
  const getRes = await k8sRequest(cfg, "GET", getPath);

  if (getRes.status === 404) {
    return {
      ok: false,
      message: `deployment ${name} not found — apply deploy/k8s/engine/deployment-org-implement-goals-supervisor.yaml first`,
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
