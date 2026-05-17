#!/usr/bin/env node
/**
 * CLI: sweep uncommitted work in sibling repos, open PRs, restart control plane.
 *
 * Usage:
 *   npm run workspace:sweep
 *   LI_REPO_WORKFLOW_SKIP_PUSH=1 npm run workspace:sweep
 */
import { runWorkspaceDirtySweep, formatWorkspaceSweepReport } from "../repo-workflow/workspace-sweep.js";
import { resolveBenchmarksRoot } from "../preflight.js";

async function main(): Promise<void> {
  const benchmarksRoot = resolveBenchmarksRoot();
  const report = await runWorkspaceDirtySweep({
    benchmarksRoot,
    dryRun: process.argv.includes("--dry-run"),
    skipPush: process.env.LI_REPO_WORKFLOW_SKIP_PUSH === "1",
    runTests: process.argv.includes("--test") || process.env.LI_WORKSPACE_SWEEP_RUN_TESTS === "1",
    restart: !process.argv.includes("--no-restart"),
  });
  console.log(formatWorkspaceSweepReport(report));
  const failed = report.sweeps.some((s) => !s.push.ok && !s.push.skipped);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
