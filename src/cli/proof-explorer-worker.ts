#!/usr/bin/env node
import { loadRuntimeEnv } from "../env.js";
loadRuntimeEnv();
import { installProcessStabilityHandlers } from "../swarm/process-stability.js";
installProcessStabilityHandlers("li-proof-explorer");
import {
  runProofExplorerWorkerOnce,
  startProofExplorerWorkerLoop,
  stopProofExplorerWorkerLoop,
} from "../proof-explorer/proof-explorer-worker-loop.js";
import { isProofExplorerWorkerAlwaysOn } from "../proof-explorer/proof-explorer-worker-config.js";

const cmd = process.argv[2] ?? "start";

if (cmd === "stop") {
  const r = stopProofExplorerWorkerLoop();
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.stopped ? 0 : 1);
}

if (cmd === "once") {
  await runProofExplorerWorkerOnce({ force: true });
  process.exit(0);
}

if (!isProofExplorerWorkerAlwaysOn()) {
  console.error("Set LI_PROOF_EXPLORER_ALWAYS_ON=1 (and CURSOR_API_KEY, GH_TOKEN) before starting");
  process.exit(1);
}

const r = startProofExplorerWorkerLoop();
console.log(JSON.stringify(r, null, 2));
if (!r.started && r.message.includes("already running")) process.exit(0);
if (!r.started) process.exit(1);

console.error("li-proof-explorer worker running — Ctrl+C to stop");
process.on("SIGINT", () => {
  void Promise.resolve(stopProofExplorerWorkerLoop()).finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void Promise.resolve(stopProofExplorerWorkerLoop()).finally(() => process.exit(0));
});
