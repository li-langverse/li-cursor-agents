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
import { AGENT_REGISTRY } from "../agents/registry.js";
import type { AgentId } from "../types.js";

// ── ANSI helpers ────────────────────────────────────────────────────
const C = {
  reset:   "\x1b[0m",
  bold:    "\x1b[1m",
  dim:     "\x1b[2m",
  green:   "\x1b[32m",
  yellow:  "\x1b[33m",
  red:     "\x1b[31m",
  cyan:    "\x1b[36m",
  magenta: "\x1b[35m",
  blue:    "\x1b[34m",
  bgBlue:  "\x1b[44m",
  white:   "\x1b[37m",
};

interface OvernightOptions {
  mock: boolean;
  maxAgents: number;
  forceAgents: AgentId[];
  sleepBetweenMs: number;
  includeSelfImprove: boolean;
  loop: boolean;
  cycleIntervalMs: number;
}

function parseArgs(argv: string[]): OvernightOptions {
  let mock = false;
  let maxAgents = 5;
  const forceAgents: AgentId[] = [];
  let sleepBetweenMs = 10_000;
  let includeSelfImprove = true;
  let loop = false;
  let cycleIntervalMs = 60 * 60 * 1000;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--mock") mock = true;
    else if (a === "--loop") loop = true;
    else if (a === "--max-agents") maxAgents = parseInt(argv[++i], 10);
    else if (a === "--force") forceAgents.push(argv[++i] as AgentId);
    else if (a === "--sleep") sleepBetweenMs = parseInt(argv[++i], 10);
    else if (a === "--cycle-interval") cycleIntervalMs = parseInt(argv[++i], 10);
    else if (a === "--no-self-improve") includeSelfImprove = false;
    else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    }
  }
  return { mock, maxAgents, forceAgents, sleepBetweenMs, includeSelfImprove, loop, cycleIntervalMs };
}

function printHelp(): void {
  console.log(`overnight-adaptive — Self-improving overnight runner

Usage:
  node dist/cli/overnight-adaptive.js [options]

Options:
  --mock               Use mock backend (no API key needed)
  --loop               Run continuously (cycle -> sleep -> cycle -> …)
  --cycle-interval <ms> Sleep between cycles in loop mode (default: 3600000 = 1h)
  --max-agents N       Maximum agents per cycle (default: 5)
  --force <id>         Force-include an agent (repeatable)
  --sleep <ms>         Sleep between agents within a cycle (default: 10000)
  --no-self-improve    Skip the self-improvement pass
  --help               Show this help

Environment:
  CURSOR_API_KEY      Required for real SDK runs
  CURSOR_MOCK=1       Force mock mode
`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ts(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function log(msg: string): void {
  console.error(`${C.dim}${ts()}${C.reset}  ${msg}`);
}

function banner(text: string): void {
  const line = "─".repeat(60);
  console.error("");
  console.error(`${C.cyan}${line}${C.reset}`);
  console.error(`${C.bold}${C.cyan}  ${text}${C.reset}`);
  console.error(`${C.cyan}${line}${C.reset}`);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60_000);
  const sec = Math.floor((ms % 60_000) / 1000);
  return `${min}m${sec}s`;
}

function statusIcon(status: string): string {
  switch (status) {
    case "finished": return `${C.green}✓${C.reset}`;
    case "error":    return `${C.red}✗${C.reset}`;
    case "dry-run":  return `${C.yellow}⊘${C.reset}`;
    default:         return `${C.dim}?${C.reset}`;
  }
}

function progressBar(current: number, total: number, width = 20): string {
  const filled = Math.round((current / total) * width);
  const bar = "█".repeat(filled) + "░".repeat(width - filled);
  return `${C.blue}${bar}${C.reset}`;
}

async function runCycle(options: OvernightOptions, cycleNumber: number): Promise<void> {
  const root = agentsPackageRoot();
  const useMock = shouldUseMock(options.mock);
  const cycleStart = Date.now();

  banner(`CYCLE ${cycleNumber}  ${useMock ? "[MOCK]" : "[SDK]"}  max=${options.maxAgents} agents`);

  const history = loadHistory(root);
  const cycle = createCycle(history);

  const schedule = decideAgents(history, {
    maxAgents: options.maxAgents,
    forceInclude: options.forceAgents.length > 0 ? options.forceAgents : undefined,
  });

  log(`${C.magenta}Scheduler:${C.reset} ${schedule.reasoning[schedule.reasoning.length - 1]}`);
  log(`${C.bold}Queue:${C.reset} ${schedule.agents.map((a) => `${C.cyan}${a}${C.reset}`).join("  ")}`);
  console.error("");

  const totalAgents = schedule.agents.length + (options.includeSelfImprove ? 1 : 0);
  let completed = 0;

  for (const agentId of schedule.agents) {
    completed++;
    const agentDef = AGENT_REGISTRY.find((a) => a.id === agentId);
    const label = agentDef?.name ?? agentId;
    const webTag = agentDef?.needsWeb ? ` ${C.yellow}[web]${C.reset}` : "";

    log(`${progressBar(completed, totalAgents)} ${C.bold}${label}${C.reset}${webTag}  (${completed}/${totalAgents})`);

    const agentStart = Date.now();
    try {
      const result = await runAgent({
        agentId,
        cwd: root,
        mock: options.mock,
        dryRun: false,
      });
      recordRun(cycle, result);
      const dur = formatDuration(Date.now() - agentStart);
      const findings = result.outputText ? extractFindingCount(result.outputText) : 0;
      log(`  ${statusIcon(result.status)} ${agentId} ${C.dim}${dur}${C.reset}  ${findings > 0 ? `${C.green}${findings} findings${C.reset}` : `${C.dim}no findings${C.reset}`}`);
    } catch (err) {
      const dur = formatDuration(Date.now() - agentStart);
      const msg = err instanceof Error ? err.message : String(err);
      log(`  ${statusIcon("error")} ${agentId} ${C.dim}${dur}${C.reset}  ${C.red}${msg}${C.reset}`);
      recordRun(cycle, {
        agentId,
        backend: useMock ? "mock" : "cursor-sdk",
        status: "error",
        durationMs: Date.now() - agentStart,
        outputPath: "",
        error: msg,
      });
    }

    if (agentId !== schedule.agents[schedule.agents.length - 1]) {
      await sleep(options.sleepBetweenMs);
    }
  }

  if (options.includeSelfImprove && !schedule.agents.includes("self_improve")) {
    completed++;
    log(`${progressBar(completed, totalAgents)} ${C.magenta}Self-improve (reflection)${C.reset}  (${completed}/${totalAgents})`);
    try {
      const result = await runAgent({
        agentId: "self_improve",
        cwd: root,
        mock: options.mock,
        dryRun: false,
        extraInstruction: buildSelfImproveContext(cycle),
      });
      recordRun(cycle, result);
      log(`  ${statusIcon(result.status)} self_improve`);
    } catch (err) {
      log(`  ${statusIcon("error")} self_improve ${C.red}${err instanceof Error ? err.message : String(err)}${C.reset}`);
    }
  }

  cycle.completedAt = new Date().toISOString();
  cycle.nextPriorities = inferNextPriorities(cycle);

  const digest = generateDigest({ root, cycle });
  const digestPath = writeDigest(root, cycle, digest);
  cycle.digest = digestPath;

  pruneHistory(history);
  saveHistory(root, history);

  const cycleDur = formatDuration(Date.now() - cycleStart);
  const ok = cycle.results.filter((r) => r.status === "finished").length;
  const fail = cycle.results.filter((r) => r.status === "error").length;
  const totalFindings = cycle.results.reduce((sum, r) => sum + (r.findings?.length ?? 0), 0);

  console.error("");
  log(`${C.bold}${C.green}CYCLE ${cycleNumber} DONE${C.reset}  ${cycleDur}  ${C.green}${ok} ok${C.reset} ${fail > 0 ? `${C.red}${fail} err${C.reset}` : ""}  ${totalFindings} findings  ${history.cycles.length} total cycles`);
  log(`${C.dim}Digest: ${digestPath}${C.reset}`);
  log(`${C.dim}Next priorities: ${cycle.nextPriorities.join(", ")}${C.reset}`);
}

function extractFindingCount(text: string): number {
  let count = 0;
  for (const line of text.split("\n")) {
    if (line.trim().startsWith("- **") && line.includes("**:")) count++;
  }
  return count;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const useMock = shouldUseMock(options.mock);

  console.error("");
  console.error(`${C.bold}${C.bgBlue}${C.white} LI-CURSOR-AGENTS  Adaptive Overnight Runner ${C.reset}`);
  console.error("");
  console.error(`  ${C.dim}Mode:${C.reset}      ${useMock ? `${C.yellow}MOCK${C.reset} (no API key)` : `${C.green}SDK${C.reset} (real Cursor API)`}`);
  console.error(`  ${C.dim}Agents:${C.reset}    ${AGENT_REGISTRY.length} registered, ${options.maxAgents} per cycle`);
  console.error(`  ${C.dim}Loop:${C.reset}      ${options.loop ? `yes, every ${formatDuration(options.cycleIntervalMs)}` : "single run"}`);
  console.error(`  ${C.dim}Self-fix:${C.reset}  ${options.includeSelfImprove ? "on" : "off"}`);
  console.error("");

  if (options.loop) {
    let cycleNumber = 1;
    while (true) {
      await runCycle(options, cycleNumber);
      cycleNumber++;
      const nextAt = new Date(Date.now() + options.cycleIntervalMs).toISOString().replace("T", " ").slice(0, 19);
      console.error("");
      log(`${C.dim}── sleeping ${formatDuration(options.cycleIntervalMs)} ── next cycle at ${nextAt} ──${C.reset}`);
      await sleep(options.cycleIntervalMs);
    }
  } else {
    await runCycle(options, 1);
  }
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

  const notRun = [
    "ecosystem_explorer", "implementation_gaps", "numerics_research",
    "pr_review", "autonomous_researcher", "benchmark_improver",
    "docs_implementer", "ci_implementer", "pr_merger", "issue_planner",
  ].filter((id) => !cycle.agentsRun.includes(id));
  for (const id of notRun.slice(0, 2)) {
    if (!priorities.includes(id)) {
      priorities.push(id);
    }
  }

  return priorities;
}

main().catch((err) => {
  console.error(`${C.red}overnight-adaptive fatal: ${err}${C.reset}`);
  process.exit(1);
});
