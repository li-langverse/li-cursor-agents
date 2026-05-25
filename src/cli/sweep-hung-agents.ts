#!/usr/bin/env node
/**
 * Garbage-collect hung agent processes (stale SDK locks, idle run-agent, orphan swarms).
 *
 * Usage:
 *   npm run agents:sweep-hung              # dry-run (default)
 *   npm run agents:sweep-hung -- --apply
 *   bash scripts/sweep-hung-agents.sh --apply
 */
import { loadRuntimeEnv } from "../env.js";
loadRuntimeEnv();
import {
  formatHungAgentSweepReport,
  runHungAgentSweep,
} from "../ops/hung-agent-sweep.js";

const apply = process.argv.includes("--apply");
const force = process.argv.includes("--force");
const json = process.argv.includes("--json");

const report = await runHungAgentSweep({ apply, force });

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(formatHungAgentSweepReport(report));
}

process.exit(0);
