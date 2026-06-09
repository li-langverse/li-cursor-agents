#!/usr/bin/env node
import { loadRuntimeEnv } from "../env.js";
loadRuntimeEnv();
import { installProcessStabilityHandlers } from "../swarm/process-stability.js";
installProcessStabilityHandlers("org-issue-worker");
import {
  runOrgIssueWorkerLoopOnce,
  startOrgIssueWorkerLoop,
  stopOrgIssueWorkerLoop,
} from "../org-issues/org-issue-worker-loop.js";
import { isOrgIssueWorkerAlwaysOn } from "../org-issues/org-issue-worker-config.js";

const cmd = process.argv[2] ?? "start";

if (cmd === "stop") {
  const r = stopOrgIssueWorkerLoop();
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.stopped ? 0 : 1);
}

if (cmd === "once") {
  await runOrgIssueWorkerLoopOnce({ force: true });
  process.exit(0);
}

if (!isOrgIssueWorkerAlwaysOn()) {
  console.error("Set LI_ORG_ISSUE_WORKER_ALWAYS_ON=1 (and GITLAB_TOKEN) before starting");
  process.exit(1);
}

const r = startOrgIssueWorkerLoop();
console.log(JSON.stringify(r, null, 2));
if (!r.started && r.message.includes("already running")) process.exit(0);
if (!r.started) process.exit(1);

console.error("Org issue worker running — Ctrl+C to stop");
process.on("SIGINT", () => {
  void Promise.resolve(stopOrgIssueWorkerLoop()).finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void Promise.resolve(stopOrgIssueWorkerLoop()).finally(() => process.exit(0));
});
await new Promise(() => {});
