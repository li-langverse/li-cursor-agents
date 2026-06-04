#!/usr/bin/env node
import { loadRuntimeEnv } from "../env.js";
loadRuntimeEnv();
import { installProcessStabilityHandlers } from "../swarm/process-stability.js";
installProcessStabilityHandlers("org-issue-triage-supervisor");
import { runOrgIssueTriageSupervisorLoop } from "../org-issues/org-issue-triage-supervisor-loop.js";
import { ensureTriageSupervisorDeployment } from "../org-issues/org-issue-triage-k8s-client.js";

const cmd = process.argv[2] ?? "supervise";

if (cmd === "wake") {
  const result = await ensureTriageSupervisorDeployment();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

if (cmd === "supervise" || cmd === "start") {
  const abort = new AbortController();
  process.on("SIGINT", () => abort.abort());
  process.on("SIGTERM", () => abort.abort());
  await runOrgIssueTriageSupervisorLoop(abort.signal);
  process.exit(0);
}

console.error(`Usage: node dist/cli/org-issue-triage-supervisor.js <wake|supervise>`);
process.exit(1);
