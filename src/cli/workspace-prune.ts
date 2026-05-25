#!/usr/bin/env node
/**
 * Prune stale isolated clones under data/workspaces/.
 *
 * Usage:
 *   npm run workspace:prune
 *   npm run workspace:prune -- --dry-run
 */
import {
  formatWorkspacePruneReport,
  pruneWorkspaces,
} from "../repo-workflow/workspace-prune.js";

function main(): void {
  const report = pruneWorkspaces({
    dryRun: process.argv.includes("--dry-run"),
    skipThrottle: true,
    force: process.argv.includes("--force"),
  });
  console.log(formatWorkspacePruneReport(report));
}

main();
