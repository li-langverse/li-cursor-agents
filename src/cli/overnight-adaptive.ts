#!/usr/bin/env node
/**
 * Adaptive overnight runner — selects agents based on prior run history,
 * executes them, records results, generates a digest, and runs self-improvement.
 */
import { loadDotEnv } from "../env.js";
loadDotEnv();

import { runAgent, shouldUseMock, agentsPackageRoot } from "../runner.js";
import { loadHistory, saveHistory, createCycle, recordRun, pruneHistory } from "../history.js";
import type { CycleRecord } from "../history.js";
import { decideAgents } from "../adaptive-scheduler.js";
import { generateDigest, writeDigest } from "../digest.js";
import type { AgentId } from "../types.js";

interface OvernightOptions {
  mock: boolean;
  maxAgents: number;
  forceAgents: AgentId[];
  sleepBetweenMs: number;
  includeSelfImprove: boolean;
}

function parseArgs(argv: string[]): OvernightOptions {
  let mock = false;
  let maxAgents = 5;
  const forceAgents: AgentId[] = [];
  let sleepBetweenMs = 10_000;
  let includeSelfImprove = true;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--mock") mock = true;
    else if (a === "--max-agents") maxAgents = parseInt(argv[++i], 10);
    else if (a === "--force") forceAgents.push(argv[++i] as AgentId);
    else if (a === "--sleep") sleepBetweenMs = parseInt(argv[++i], 10);
    else if (a === "--no-self-improve") includeSelfImprove = false;
    else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    }
  }
  return { mock, maxAgents, forceAgents, sleepBetweenMs, includeSelfImprove };
}

function printHelp(): void {
  console.log(`overnight-adaptive — Self-improving overnight runner

Usage:
  node dist/cli/overnight-adaptive.js [options]

Options:
  --mock              Use mock backend (no API key needed)
  --max-agents N      Maximum agents per cycle (default: 5)
  --force <id>        Force-include an agent (repeatable)
  --sleep <ms>        Sleep between agents in ms (default: 10000)
  --no-self-improve   Skip the self-improvement pass
  --help              Show this help

Environment:
  CURSOR_API_KEY      Required for real SDK runs
  CURSOR_MOCK=1       Force mock mode
`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(msg: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  console.error(`[${ts}] ${msg}`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const root = agentsPackageRoot();
  const useMock = shouldUseMock(options.mock);

  log(`overnight-adaptive start (mock=${useMock}, maxAgents=${options.maxAgents})`);

  const history = loadHistory(root);
  const cycle = createCycle(history);

  const schedule = decideAgents(history, {
    maxAgents: options.maxAgents,
    forceInclude: options.forceAgents.length > 0 ? options.forceAgents : undefined,
  });

  log(`Schedule reasoning:`);
  for (const r of schedule.reasoning) {
    log(`  ${r}`);
  }
  log(`Agents to run: ${schedule.agents.join(", ")}`);

  for (const agentId of schedule.agents) {
    log(`=== Running: ${agentId} ===`);
    try {
      const result = await runAgent({
        agentId,
        cwd: root,
        mock: options.mock,
        dryRun: false,
      });
      recordRun(cycle, result);
      log(`  ${agentId}: ${result.status} (${result.durationMs}ms)`);
    } catch (err) {
      log(`  ${agentId}: ERROR — ${err instanceof Error ? err.message : String(err)}`);
      recordRun(cycle, {
        agentId,
        backend: useMock ? "mock" : "cursor-sdk",
        status: "error",
        durationMs: 0,
        outputPath: "",
        error: err instanceof Error ? err.message : String(err),
      });
    }

    if (agentId !== schedule.agents[schedule.agents.length - 1]) {
      await sleep(options.sleepBetweenMs);
    }
  }

  if (options.includeSelfImprove && !schedule.agents.includes("self_improve")) {
    log(`=== Running: self_improve (reflection pass) ===`);
    try {
      const result = await runAgent({
        agentId: "self_improve",
        cwd: root,
        mock: options.mock,
        dryRun: false,
        extraInstruction: buildSelfImproveContext(cycle),
      });
      recordRun(cycle, result);
      log(`  self_improve: ${result.status}`);
    } catch (err) {
      log(`  self_improve: ERROR — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  cycle.completedAt = new Date().toISOString();
  cycle.nextPriorities = inferNextPriorities(cycle);

  const digest = generateDigest({ root, cycle });
  const digestPath = writeDigest(root, cycle, digest);
  cycle.digest = digestPath;
  log(`Digest written: ${digestPath}`);

  pruneHistory(history);
  saveHistory(root, history);
  log(`History saved (${history.cycles.length} cycles total)`);

  log("overnight-adaptive complete");
  console.log(JSON.stringify({ cycleId: cycle.cycleId, agents: cycle.agentsRun, digest: digestPath }, null, 2));
}

function buildSelfImproveContext(cycle: CycleRecord): string {
  const lines = [
    "## Current cycle results for self-improvement analysis:",
    "",
    `Agents run: ${cycle.agentsRun.join(", ")}`,
    "",
    "Results:",
  ];
  for (const r of cycle.results) {
    lines.push(`- ${r.agentId}: ${r.status} (${r.durationMs}ms, ${r.findings?.length ?? 0} findings)`);
  }
  return lines.join("\n");
}

function inferNextPriorities(cycle: CycleRecord): string[] {
  const priorities: string[] = [];

  const errored = cycle.results.filter((r) => r.status === "error");
  for (const r of errored) {
    priorities.push(r.agentId);
  }

  const productive = cycle.results
    .filter((r) => r.status === "finished" && (r.findings?.length ?? 0) > 2)
    .sort((a, b) => (b.findings?.length ?? 0) - (a.findings?.length ?? 0));

  for (const r of productive.slice(0, 2)) {
    if (!priorities.includes(r.agentId)) {
      priorities.push(r.agentId);
    }
  }

  const notRun = ["ecosystem_explorer", "implementation_gaps", "numerics_research", "pr_review", "issue_planner"]
    .filter((id) => !cycle.agentsRun.includes(id));
  for (const id of notRun.slice(0, 2)) {
    if (!priorities.includes(id)) {
      priorities.push(id);
    }
  }

  return priorities;
}

main().catch((err) => {
  console.error("overnight-adaptive fatal:", err);
  process.exit(1);
});
