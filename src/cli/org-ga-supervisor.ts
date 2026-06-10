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

console.error(`Usage: node dist/cli/org-ga-supervisor.js <wake|supervise>`);
process.exit(1);
