#!/usr/bin/env node
import { loadRuntimeEnv } from "../env.js";
loadRuntimeEnv();
import { dispatchSwarmAuditRefresh } from "../benchmarks/dispatch-swarm-audit.js";

function parseArgs(argv: string[]) {
  let dryRun = false;
  for (const a of argv) {
    if (a === "--dry-run") dryRun = true;
    else if (a === "--help" || a === "-h") {
      console.log(`Usage: dispatch-benchmarks-audit [--dry-run]

Dispatches repository_dispatch event_type=swarm-audit-refresh to li-langverse/benchmarks.
Requires LI_BENCHMARKS_DISPATCH_TOKEN or GH_TOKEN with dispatch scope.
`);
      process.exit(0);
    }
  }
  return { dryRun };
}

const { dryRun } = parseArgs(process.argv.slice(2));
const result = dispatchSwarmAuditRefresh({
  dryRun,
  runUrl: process.env.GITHUB_SERVER_URL
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : undefined,
});

if (result.skipped) {
  console.error(result.skip_reason ?? "skipped");
  process.exit(0);
}
if (!result.ok) {
  console.error(result.error ?? "dispatch failed");
  process.exit(1);
}
console.log(dryRun ? result.skip_reason : "dispatched swarm-audit-refresh");
