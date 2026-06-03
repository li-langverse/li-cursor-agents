#!/usr/bin/env node
import { loadRuntimeEnv } from "../env.js";
loadRuntimeEnv();
import { installProcessStabilityHandlers } from "../swarm/process-stability.js";
installProcessStabilityHandlers("org-planner-supervisor");
import { runOrgPlannerSupervisorLoop } from "../org-planner/org-planner-supervisor-loop.js";
import { ensureSupervisorDeployment } from "../org-planner/org-planner-k8s-client.js";

const cmd = process.argv[2] ?? "supervise";

if (cmd === "wake") {
  const result = await ensureSupervisorDeployment();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

if (cmd === "supervise" || cmd === "start") {
  const abort = new AbortController();
  process.on("SIGINT", () => abort.abort());
  process.on("SIGTERM", () => abort.abort());
  await runOrgPlannerSupervisorLoop(abort.signal);
  process.exit(0);
}

console.error(`Usage: node dist/cli/org-planner-supervisor.js <wake|supervise>`);
process.exit(1);
