#!/usr/bin/env node
import { loadRuntimeEnv } from "../env.js";
loadRuntimeEnv();
import { installProcessStabilityHandlers } from "../swarm/process-stability.js";
installProcessStabilityHandlers("org-ga-supervisor");
import { runOrgGaSupervisorLoop } from "../org-ga/org-ga-supervisor-loop.js";
import { ensureGaSupervisorDeployment } from "../org-ga/org-ga-k8s-client.js";

const cmd = process.argv[2] ?? "supervise";

if (cmd === "wake") {
  const result = await ensureGaSupervisorDeployment();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

if (cmd === "supervise" || cmd === "start") {
  const abort = new AbortController();
  process.on("SIGINT", () => abort.abort());
  process.on("SIGTERM", () => abort.abort());
  await runOrgGaSupervisorLoop(abort.signal);
  process.exit(0);
}

if (cmd === "reconcile") {
  const { reconcileGaActiveWithK8sJobs, countGaGhostClaimsByAge, readGaActiveState, pendingGaCount } =
    await import("../org-ga/org-ga-coordination.js");
  const { isInKubernetesCluster, listGaAuditorJobs } = await import("../org-ga/org-ga-k8s-client.js");
  if (!isInKubernetesCluster()) {
    console.error("reconcile requires in-cluster K8s");
    process.exit(1);
  }
  const jobs = await listGaAuditorJobs();
  const before = countGaGhostClaimsByAge(readGaActiveState());
  const result = reconcileGaActiveWithK8sJobs(jobs);
  const after = countGaGhostClaimsByAge(readGaActiveState());
  console.log(JSON.stringify({ before, after, pending: pendingGaCount(), ...result }, null, 2));
  process.exit(after > 0 ? 1 : 0);
}

console.error(`Usage: node dist/cli/org-ga-supervisor.js <wake|supervise|reconcile>`);
process.exit(1);
