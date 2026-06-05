#!/usr/bin/env node
import { loadRuntimeEnv } from "../env.js";
loadRuntimeEnv();
import { installProcessStabilityHandlers } from "../swarm/process-stability.js";
installProcessStabilityHandlers("org-pr-merge-worker");
import {
  runOrgPrMergeWorkerOnce,
  startOrgPrMergeWorkerLoop,
  stopOrgPrMergeWorkerLoop,
} from "../org-prs/org-pr-merge-worker-loop.js";
import { isOrgPrMergeWorkerAlwaysOn } from "../org-prs/org-pr-merge-worker-config.js";

const cmd = process.argv[2] ?? "start";

if (cmd === "stop") {
  const r = stopOrgPrMergeWorkerLoop();
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.stopped ? 0 : 1);
}

if (cmd === "once") {
  await runOrgPrMergeWorkerOnce({ force: true });
  process.exit(0);
}

if (!isOrgPrMergeWorkerAlwaysOn()) {
  console.error("Set LI_ORG_PR_MERGE_WORKER_ALWAYS_ON=1 (and GH_TOKEN) before starting");
  process.exit(1);
}

const r = startOrgPrMergeWorkerLoop();
console.log(JSON.stringify(r, null, 2));
if (!r.started && r.message.includes("already running")) process.exit(0);
if (!r.started) process.exit(1);

console.error("Org PR merge worker running — Ctrl+C to stop");
process.on("SIGINT", () => {
  void Promise.resolve(stopOrgPrMergeWorkerLoop()).finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void Promise.resolve(stopOrgPrMergeWorkerLoop()).finally(() => process.exit(0));
});
await new Promise(() => {});
