#!/usr/bin/env node
/**
 * One-shot G&A queue reconcile — sync org-ga-active.json with K8s Batch Jobs.
 * Used by CronJob when supervisor tick is delayed or reconcile failed silently.
 */
import { loadRuntimeEnv } from "../env.js";
loadRuntimeEnv();
import { installProcessStabilityHandlers } from "../swarm/process-stability.js";
installProcessStabilityHandlers("org-ga-reconcile");
import {
  countGaGhostClaimsByAge,
  pendingGaCount,
  readGaActiveState,
  reconcileGaActiveWithK8sJobs,
} from "../org-ga/org-ga-coordination.js";
import { isInKubernetesCluster, listGaAuditorJobs } from "../org-ga/org-ga-k8s-client.js";
import { workerConsole } from "../worker/worker-console.js";

async function main(): Promise<void> {
  const ghostsBefore = countGaGhostClaimsByAge(readGaActiveState());
  let reconciled = {
    terminalUpdated: 0,
    orphanedJobs: 0,
    staleByAge: 0,
    orphanClaims: 0,
  };

  if (isInKubernetesCluster()) {
    const jobs = await listGaAuditorJobs();
    reconciled = reconcileGaActiveWithK8sJobs(jobs);
  } else {
    workerConsole("org-ga-reconcile", "warn", "not in cluster — PVC-only ghost count");
  }

  const ghostsAfter = countGaGhostClaimsByAge(readGaActiveState());
  const pending = pendingGaCount();
  const report = {
    ok: ghostsAfter === 0 || reconciled.orphanedJobs + reconciled.staleByAge + reconciled.orphanClaims > 0,
    ghosts_before: ghostsBefore,
    ghosts_after: ghostsAfter,
    pending,
    ...reconciled,
  };

  console.log(JSON.stringify(report, null, 2));
  workerConsole("org-ga-reconcile", "info", JSON.stringify(report));

  if (ghostsAfter >= Number(process.env.LI_ORG_GA_GHOST_FAIL_THRESHOLD ?? 10)) {
    console.error(`FAIL: ${ghostsAfter} ghost ga claims remain`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
