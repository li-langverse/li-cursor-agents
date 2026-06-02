import { readFileSync } from "node:fs";
import https from "node:https";
import { randomBytes } from "node:crypto";
import {
  orgResearchSupervisorDeploymentName,
  orgResearchSupervisorImage,
  orgResearchSupervisorNamespace,
  orgResearchSupervisorNodeSelector,
  researchSlug,
} from "./org-research-supervisor-config.js";

interface InClusterConfig {
  baseUrl: string;
  token: string;
  ca: Buffer;
  namespace: string;
}

export interface K8sJobSummary {
  name: string;
  researchRef: string;
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

function jobLabels(researchRef: string, workerId: string): Record<string, string> {
  return {
    "app.kubernetes.io/name": "li-org-researcher",
    "li-langverse.io/org-research": sanitizeLabel(researchRef),
    "li-langverse.io/worker-id": sanitizeLabel(workerId),
    "li-langverse.io/managed-by": "org-research-supervisor",
  };
}

export function researcherJobName(goalId: string, dimension: string): string {
  const suffix = randomBytes(3).toString("hex");
  const base = `li-org-res-${researchSlug(goalId, dimension)}-${suffix}`;
  return base.slice(0, 63);
}

export async function listResearcherJobs(): Promise<K8sJobSummary[]> {
  const cfg = inClusterConfig();
  if (!cfg) return [];
  const ns = orgResearchSupervisorNamespace();
  const path = `/apis/batch/v1/namespaces/${ns}/jobs?labelSelector=${encodeURIComponent("li-langverse.io/managed-by=org-research-supervisor")}`;
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
    const researchRef =
      job.metadata?.annotations?.["li-langverse.io/org-research-ref"] ??
      job.metadata?.labels?.["li-langverse.io/org-research"] ??
      name;
    out.push({
      name,
      researchRef,
      active: (job.status?.active ?? 0) > 0,
      succeeded: (job.status?.succeeded ?? 0) > 0,
      failed: (job.status?.failed ?? 0) > 0,
    });
  }
  return out;
}

export async function createResearcherJob(options: {
  researchRef: string;
  goalId: string;
  dimension: string;
  workerId: string;
}): Promise<{ ok: boolean; jobName?: string; message?: string }> {
  const cfg = inClusterConfig();
  if (!cfg) {
    return { ok: false, message: "not in kubernetes cluster" };
  }
  const ns = orgResearchSupervisorNamespace();
  const jobName = researcherJobName(options.goalId, options.dimension);
  const nodeSelector = orgResearchSupervisorNodeSelector();
  const image = orgResearchSupervisorImage();
  const labels = jobLabels(options.researchRef, options.workerId);

  const job = {
    apiVersion: "batch/v1",
    kind: "Job",
    metadata: {
      name: jobName,
      namespace: ns,
      labels,
      annotations: {
        "li-langverse.io/org-research-ref": options.researchRef,
        "li-langverse.io/research-dimension": options.dimension,
      },
    },
    spec: {
      backoffLimit: 0,
      ttlSecondsAfterFinished: 86400,
      activeDeadlineSeconds: 7200,
      template: {
        metadata: {
          labels,
          annotations: {
            "li-langverse.io/org-research-ref": options.researchRef,
            "li-langverse.io/research-dimension": options.dimension,
          },
        },
        spec: {
          restartPolicy: "Never",
          serviceAccountName: "li-org-researcher",
          nodeSelector,
          containers: [
            {
              name: "researcher",
              image,
              imagePullPolicy: "Always",
              command: [
                "/app/deploy/org-worker-entrypoint.sh",
                "node",
                "dist/cli/org-researcher.js",
                "--research",
                options.researchRef,
                "--worker-id",
                options.workerId,
              ],
              envFrom: [{ configMapRef: { name: "li-org-research-supervisor" } }],
              env: [
                {
                  name: "GH_TOKEN",
                  valueFrom: { secretKeyRef: { name: "li-agents-secrets", key: "GH_TOKEN" } },
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
                { name: "sprint-data", mountPath: "/app/data/goal-directed-sprints" },
              ],
            },
          ],
          volumes: [
            {
              name: "sprint-data",
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
  const ns = orgResearchSupervisorNamespace();
  const name = orgResearchSupervisorDeploymentName();
  const getPath = `/apis/apps/v1/namespaces/${ns}/deployments/${name}`;
  const getRes = await k8sRequest(cfg, "GET", getPath);

  if (getRes.status === 404) {
    return {
      ok: false,
      message: `deployment ${name} not found - apply deploy/k8s/engine/deployment-org-research-supervisor.yaml first`,
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
