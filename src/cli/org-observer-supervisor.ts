#!/usr/bin/env node
import { loadRuntimeEnv } from "../env.js";
loadRuntimeEnv();
import { installProcessStabilityHandlers } from "../swarm/process-stability.js";
installProcessStabilityHandlers("org-observer-supervisor");
import { readFileSync } from "node:fs";
import https from "node:https";
import { runOrgObserverSupervisorLoop } from "../org-observer/org-observer-supervisor-loop.js";
import { orgObserverTick } from "../org-observer/org-observer-tick.js";

const cmd = process.argv[2] ?? "supervise";

function inClusterConfig() {
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

async function ensureSupervisorDeployment(): Promise<{ ok: boolean; message: string }> {
  const cfg = inClusterConfig();
  if (!cfg) {
    return { ok: false, message: "wake skipped: not in kubernetes cluster" };
  }
  const ns = process.env.LI_ORG_OBSERVER_NAMESPACE?.trim() || cfg.namespace;
  const name = process.env.LI_ORG_OBSERVER_DEPLOYMENT?.trim() || "li-org-observer-supervisor";
  const getPath = `/apis/apps/v1/namespaces/${ns}/deployments/${name}`;
  const getRes = await k8sRequest(cfg, "GET", getPath);
  if (getRes.status === 404) {
    return { ok: false, message: `deployment ${name} not found` };
  }
  const patchRes = await k8sRequest(
    cfg,
    "PATCH",
    `/apis/apps/v1/namespaces/${ns}/deployments/${name}`,
    { spec: { replicas: 1 } },
    "application/merge-patch+json",
  );
  if (patchRes.status !== 200) {
    return { ok: false, message: `scale deployment failed (${patchRes.status})` };
  }
  return { ok: true, message: `deployment ${name} scaled to 1 replica` };
}

function k8sRequest(
  cfg: NonNullable<ReturnType<typeof inClusterConfig>>,
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

if (cmd === "wake") {
  const result = await ensureSupervisorDeployment();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

if (cmd === "once") {
  const tick = await orgObserverTick();
  console.log(JSON.stringify(tick, null, 2));
  process.exit(tick.stability.ok ? 0 : 1);
}

if (cmd === "supervise" || cmd === "start") {
  const abort = new AbortController();
  process.on("SIGINT", () => abort.abort());
  process.on("SIGTERM", () => abort.abort());
  await runOrgObserverSupervisorLoop(abort.signal);
  process.exit(0);
}

console.error(`Usage: node dist/cli/org-observer-supervisor.js <wake|once|supervise>`);
process.exit(1);
