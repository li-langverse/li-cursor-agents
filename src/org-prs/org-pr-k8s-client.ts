import { FINISHED_JOB_TTL_SECONDS } from "../k8s/finished-job-ttl.js";
import { readFileSync } from "node:fs";
import https from "node:https";
import { randomBytes } from "node:crypto";
import {
  orgPrSupervisorDeploymentName,
  orgPrSupervisorImage,
  orgPrSupervisorNamespace,
  orgPrSupervisorNodeSelector,
  orgReviewerSupervisorDeploymentName,
  prSlug,
} from "./org-pr-supervisor-config.js";

interface InClusterConfig {
  baseUrl: string;
  token: string;
  ca: Buffer;
  namespace: string;
}

export interface K8sPrJobSummary {
  name: string;
  prRef: string;
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

function jobLabels(
  managedBy: string,
  appName: string,
  prRef: string,
  workerId: string,
): Record<string, string> {
  return {
    "app.kubernetes.io/name": appName,
    "li-langverse.io/org-pr": sanitizeLabel(prRef),
    "li-langverse.io/worker-id": sanitizeLabel(workerId),
    "li-langverse.io/managed-by": managedBy,
  };
}

function prJobName(prefix: string, repo: string, number: number): string {
  const suffix = randomBytes(3).toString("hex");
  return `${prefix}-${prSlug(repo, number)}-${suffix}`.slice(0, 63);
}

async function listJobs(managedBy: string): Promise<K8sPrJobSummary[]> {
  const cfg = inClusterConfig();
  if (!cfg) return [];
  const ns = orgPrSupervisorNamespace();
  const path = `/apis/batch/v1/namespaces/${ns}/jobs?labelSelector=${encodeURIComponent(`li-langverse.io/managed-by=${managedBy}`)}`;
  const res = await k8sRequest(cfg, "GET", path);
  if (res.status !== 200 || !res.body || typeof res.body !== "object") return [];
  const items = (res.body as { items?: unknown[] }).items ?? [];
  const out: K8sPrJobSummary[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const job = item as {
      metadata?: { name?: string; labels?: Record<string, string>; annotations?: Record<string, string> };
      status?: { active?: number; succeeded?: number; failed?: number };
    };
    const name = job.metadata?.name ?? "";
    const prRef =
      job.metadata?.annotations?.["li-langverse.io/org-pr-ref"] ??
      job.metadata?.labels?.["li-langverse.io/org-pr"] ??
      name;
    out.push({
      name,
      prRef,
      active: (job.status?.active ?? 0) > 0,
      succeeded: (job.status?.succeeded ?? 0) > 0,
      failed: (job.status?.failed ?? 0) > 0,
    });
  }
  return out;
}

export function listPrImplementerJobs(): Promise<K8sPrJobSummary[]> {
  return listJobs("org-pr-supervisor");
}

export function listPrReviewerJobs(): Promise<K8sPrJobSummary[]> {
  return listJobs("org-pr-reviewer-supervisor");
}

async function createPrWorkerJob(options: {
  prRef: string;
  repo: string;
  number: number;
  workerId: string;
  managedBy: string;
  appName: string;
  jobPrefix: string;
  serviceAccount: string;
  configMap: string;
  cli: string;
}): Promise<{ ok: boolean; jobName?: string; message?: string }> {
  const cfg = inClusterConfig();
  if (!cfg) return { ok: false, message: "not in kubernetes cluster" };

  const ns = orgPrSupervisorNamespace();
  const jobName = prJobName(options.jobPrefix, options.repo, options.number);
  const labels = jobLabels(options.managedBy, options.appName, options.prRef, options.workerId);

  const job = {
    apiVersion: "batch/v1",
    kind: "Job",
    metadata: {
      name: jobName,
      namespace: ns,
      labels,
      annotations: { "li-langverse.io/org-pr-ref": options.prRef },
    },
    spec: {
      backoffLimit: 0,
      ttlSecondsAfterFinished: FINISHED_JOB_TTL_SECONDS,
      activeDeadlineSeconds: 7200,
      template: {
        metadata: { labels, annotations: { "li-langverse.io/org-pr-ref": options.prRef } },
        spec: {
          restartPolicy: "Never",
          serviceAccountName: options.serviceAccount,
          nodeSelector: orgPrSupervisorNodeSelector(),
          containers: [
            {
              name: "worker",
              image: orgPrSupervisorImage(),
              imagePullPolicy: "IfNotPresent",
              command: [
                "/app/deploy/org-worker-entrypoint.sh",
                "node",
                options.cli,
                "--pr",
                options.prRef,
                "--worker-id",
                options.workerId,
              ],
              envFrom: [{ configMapRef: { name: options.configMap } }],
              env: [
                {
                  name: "GH_TOKEN",
                  valueFrom: { secretKeyRef: { name: "li-agents-secrets", key: "GH_SWARM_TOKEN" } },
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
            { name: "sprint-data", persistentVolumeClaim: { claimName: "li-agents-sprint-data" } },
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

export function createPrImplementerJob(options: {
  prRef: string;
  repo: string;
  number: number;
  workerId: string;
}): Promise<{ ok: boolean; jobName?: string; message?: string }> {
  return createPrWorkerJob({
    ...options,
    managedBy: "org-pr-supervisor",
    appName: "li-org-pr-implementer",
    jobPrefix: "li-org-pr-impl",
    serviceAccount: "li-org-pr-implementer",
    configMap: "li-org-pr-supervisor",
    cli: "dist/cli/org-pr-implementer.js",
  });
}

export function createPrReviewerJob(options: {
  prRef: string;
  repo: string;
  number: number;
  workerId: string;
}): Promise<{ ok: boolean; jobName?: string; message?: string }> {
  return createPrWorkerJob({
    ...options,
    managedBy: "org-pr-reviewer-supervisor",
    appName: "li-org-pr-reviewer",
    jobPrefix: "li-org-pr-rev",
    serviceAccount: "li-org-pr-reviewer",
    configMap: "li-org-reviewer-supervisor",
    cli: "dist/cli/org-pr-reviewer.js",
  });
}

async function ensureDeployment(name: string): Promise<{ ok: boolean; message: string }> {
  const cfg = inClusterConfig();
  if (!cfg) {
    return { ok: false, message: "wake skipped: not in kubernetes cluster (apply Deployment manually)" };
  }
  const ns = orgPrSupervisorNamespace();
  const getPath = `/apis/apps/v1/namespaces/${ns}/deployments/${name}`;
  const getRes = await k8sRequest(cfg, "GET", getPath);
  if (getRes.status === 404) {
    return { ok: false, message: `deployment ${name} not found — apply deploy/k8s/engine manifests first` };
  }
  if (getRes.status !== 200) {
    return { ok: false, message: `get deployment failed (${getRes.status})` };
  }
  const patchRes = await k8sRequest(cfg, "PATCH", getPath, { spec: { replicas: 1 } }, "application/merge-patch+json");
  if (patchRes.status !== 200) {
    return { ok: false, message: `scale deployment failed (${patchRes.status})` };
  }
  return { ok: true, message: `deployment ${name} scaled to 1 replica in ${ns}` };
}

export function ensurePrSupervisorDeployment(): Promise<{ ok: boolean; message: string }> {
  return ensureDeployment(orgPrSupervisorDeploymentName());
}

export function ensureReviewerSupervisorDeployment(): Promise<{ ok: boolean; message: string }> {
  return ensureDeployment(orgReviewerSupervisorDeploymentName());
}
