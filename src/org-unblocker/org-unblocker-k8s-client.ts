import { orgUnblockerDeploymentName, orgUnblockerNamespace } from "./org-unblocker-config.js";
import { inClusterConfig, k8sRequest } from "./org-unblocker-k8s.js";

export async function ensureUnblockerDeployment(): Promise<{ ok: boolean; message: string }> {
  const cfg = inClusterConfig();
  if (!cfg) {
    return { ok: false, message: "wake skipped: not in kubernetes cluster" };
  }
  const ns = orgUnblockerNamespace();
  const name = orgUnblockerDeploymentName();
  const path = `/apis/apps/v1/namespaces/${ns}/deployments/${name}`;
  const getRes = await k8sRequest(cfg, "GET", path);
  if (getRes.status === 404) {
    return { ok: false, message: `deployment ${name} not found — apply k8s manifests first` };
  }
  if (getRes.status !== 200) {
    return { ok: false, message: `get deployment failed (${getRes.status})` };
  }
  const patchRes = await k8sRequest(
    cfg,
    "PATCH",
    path,
    { spec: { replicas: 1 } },
    "application/merge-patch+json",
  );
  if (patchRes.status !== 200) {
    return { ok: false, message: `scale deployment failed (${patchRes.status})` };
  }
  return { ok: true, message: `deployment ${name} scaled to 1 replica in ${ns}` };
}
