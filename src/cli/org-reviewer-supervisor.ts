#!/usr/bin/env node
import { loadRuntimeEnv } from "../env.js";
loadRuntimeEnv();
import { installProcessStabilityHandlers } from "../swarm/process-stability.js";
installProcessStabilityHandlers("org-reviewer-supervisor");
import { runOrgReviewerSupervisorLoop } from "../org-prs/org-reviewer-supervisor-loop.js";
import { ensureReviewerSupervisorDeployment } from "../org-prs/org-pr-k8s-client.js";

const cmd = process.argv[2] ?? "supervise";

if (cmd === "wake") {
  const result = await ensureReviewerSupervisorDeployment();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

if (cmd === "supervise" || cmd === "start") {
  const abort = new AbortController();
  process.on("SIGINT", () => abort.abort());
  process.on("SIGTERM", () => abort.abort());
  await runOrgReviewerSupervisorLoop(abort.signal);
  process.exit(0);
}

console.error(`Usage: node dist/cli/org-reviewer-supervisor.js <wake|supervise>`);
process.exit(1);
