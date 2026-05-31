#!/usr/bin/env node
import { loadRuntimeEnv } from "../env.js";
loadRuntimeEnv();
import { installProcessStabilityHandlers } from "../swarm/process-stability.js";
installProcessStabilityHandlers("org-pr-supervisor");
import { runOrgPrSupervisorLoop } from "../org-prs/org-pr-supervisor-loop.js";
import { ensurePrSupervisorDeployment } from "../org-prs/org-pr-k8s-client.js";

const cmd = process.argv[2] ?? "supervise";

if (cmd === "wake") {
  const result = await ensurePrSupervisorDeployment();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

if (cmd === "supervise" || cmd === "start") {
  const abort = new AbortController();
  process.on("SIGINT", () => abort.abort());
  process.on("SIGTERM", () => abort.abort());
  await runOrgPrSupervisorLoop(abort.signal);
  process.exit(0);
}

console.error(`Usage: node dist/cli/org-pr-supervisor.js <wake|supervise>`);
process.exit(1);
