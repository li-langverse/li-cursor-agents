#!/usr/bin/env node
/**
 * Interactive CLI dashboard for managing li-cursor-agents.
 * Provides a menu-driven interface to run agents, view history, and start the overnight loop.
 */
import { loadDotEnv } from "../env.js";
loadDotEnv();

import * as readline from "node:readline";
import { readFileSync } from "node:fs";
import { AGENT_REGISTRY } from "../agents/registry.js";
import { runAgent, shouldUseMock, agentsPackageRoot } from "../runner.js";
import { loadHistory, saveHistory, createCycle, recordRun, pruneHistory } from "../history.js";
import { generateDigest, writeDigest } from "../digest.js";
import { decideAgents } from "../adaptive-scheduler.js";
import type { AgentId } from "../types.js";

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

const root = agentsPackageRoot();

function clearScreen(): void {
  process.stdout.write("\x1b[2J\x1b[H");
}

function printHeader(): void {
  console.log("");
  console.log(`${C.bold}${C.bgBlue}${C.white} LI-CURSOR-AGENTS  Dashboard ${C.reset}`);
  console.log("");
}

function printAgentTable(): void {
  console.log(`${C.bold}  #   Agent ID                  Name                       Web${C.reset}`);
  console.log(`${C.dim}  ${"─".repeat(72)}${C.reset}`);
  AGENT_REGISTRY.forEach((a, i) => {
    const num = String(i + 1).padStart(2);
    const id = a.id.padEnd(24);
    const name = a.name.padEnd(27);
    const web = a.needsWeb ? `${C.yellow}yes${C.reset}` : `${C.dim}no${C.reset}`;
    console.log(`  ${C.cyan}${num}${C.reset}  ${id}${name}${web}`);
  });
  console.log("");
}

function printMenu(): void {
  console.log(`${C.bold}  Commands:${C.reset}`);
  console.log(`    ${C.cyan}run <id|#>${C.reset}     Run a single agent (mock mode)`);
  console.log(`    ${C.cyan}run all${C.reset}        Run all agents sequentially`);
  console.log(`    ${C.cyan}cycle${C.reset}          Run one adaptive cycle`);
  console.log(`    ${C.cyan}history${C.reset}        Show run history`);
  console.log(`    ${C.cyan}digest${C.reset}         Show latest digest`);
  console.log(`    ${C.cyan}status${C.reset}         Show agent status overview`);
  console.log(`    ${C.cyan}schedule${C.reset}       Preview next cycle's agent selection`);
  console.log(`    ${C.cyan}help${C.reset}           Show this menu`);
  console.log(`    ${C.cyan}quit${C.reset}           Exit`);
  console.log("");
}

function resolveAgentId(input: string): AgentId | undefined {
  const trimmed = input.trim();
  const num = parseInt(trimmed, 10);
  if (!isNaN(num) && num >= 1 && num <= AGENT_REGISTRY.length) {
    return AGENT_REGISTRY[num - 1].id;
  }
  const match = AGENT_REGISTRY.find((a) => a.id === trimmed);
  return match?.id;
}

async function runSingleAgent(agentId: AgentId): Promise<void> {
  const agentDef = AGENT_REGISTRY.find((a) => a.id === agentId);
  if (!agentDef) {
    console.log(`  ${C.red}Unknown agent: ${agentId}${C.reset}`);
    return;
  }

  const webTag = agentDef.needsWeb ? ` ${C.yellow}[web]${C.reset}` : "";
  console.log(`\n  ${C.bold}Running: ${agentDef.name}${C.reset}${webTag}  (${agentDef.id})`);
  console.log(`  ${C.dim}Prompt: prompts/${agentDef.promptFile}${C.reset}`);
  console.log("");

  const start = Date.now();
  try {
    const result = await runAgent({
      agentId,
      cwd: root,
      mock: true,
      dryRun: false,
    });
    const dur = formatDuration(Date.now() - start);
    console.log(`  ${statusIcon(result.status)} ${C.bold}${result.status}${C.reset} in ${dur}`);
    console.log(`  ${C.dim}Output: ${result.outputPath}${C.reset}`);

    if (result.outputText) {
      console.log("");
      console.log(`  ${C.dim}── Output preview ──${C.reset}`);
      const lines = result.outputText.split("\n").slice(0, 15);
      for (const line of lines) {
        console.log(`  ${C.dim}│${C.reset} ${line}`);
      }
      if (result.outputText.split("\n").length > 15) {
        console.log(`  ${C.dim}│ ... (${result.outputText.split("\n").length - 15} more lines)${C.reset}`);
      }
      console.log(`  ${C.dim}────────────────────${C.reset}`);
    }
  } catch (err) {
    const dur = formatDuration(Date.now() - start);
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ${statusIcon("error")} ${C.red}ERROR${C.reset} in ${dur}`);
    console.log(`  ${C.red}${msg}${C.reset}`);
  }
  console.log("");
}

async function runAllAgents(): Promise<void> {
  console.log(`\n  ${C.bold}Running all ${AGENT_REGISTRY.length} agents...${C.reset}\n`);
  const results: Array<{ id: string; status: string; dur: string; findings: number; error?: string }> = [];

  for (const agentDef of AGENT_REGISTRY) {
    const webTag = agentDef.needsWeb ? ` ${C.yellow}[web]${C.reset}` : "";
    process.stdout.write(`  ${C.dim}→${C.reset} ${agentDef.name}${webTag}  `);

    const start = Date.now();
    try {
      const result = await runAgent({
        agentId: agentDef.id,
        cwd: root,
        mock: true,
        dryRun: false,
      });
      const dur = formatDuration(Date.now() - start);
      const findings = result.outputText
        ? result.outputText.split("\n").filter((l) => l.trim().startsWith("- **") && l.includes("**:")).length
        : 0;
      console.log(`${statusIcon(result.status)} ${dur}  ${findings > 0 ? `${C.green}${findings} findings${C.reset}` : ""}`);
      results.push({ id: agentDef.id, status: result.status, dur, findings });
    } catch (err) {
      const dur = formatDuration(Date.now() - start);
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`${statusIcon("error")} ${dur}  ${C.red}${msg.slice(0, 60)}${C.reset}`);
      results.push({ id: agentDef.id, status: "error", dur, findings: 0, error: msg });
    }
  }

  const ok = results.filter((r) => r.status === "finished").length;
  const fail = results.filter((r) => r.status === "error").length;
  console.log(`\n  ${C.bold}Done:${C.reset} ${C.green}${ok} ok${C.reset}${fail > 0 ? ` ${C.red}${fail} errors${C.reset}` : ""}\n`);
}

async function runAdaptiveCycle(): Promise<void> {
  console.log(`\n  ${C.bold}Running adaptive cycle...${C.reset}\n`);

  const history = loadHistory(root);
  const cycle = createCycle(history);
  const schedule = decideAgents(history, { maxAgents: 7 });

  console.log(`  ${C.magenta}Scheduler:${C.reset} ${schedule.reasoning[schedule.reasoning.length - 1]}`);
  console.log(`  ${C.bold}Queue:${C.reset} ${schedule.agents.join(", ")}`);
  console.log("");

  for (const agentId of schedule.agents) {
    const agentDef = AGENT_REGISTRY.find((a) => a.id === agentId);
    const label = agentDef?.name ?? agentId;
    process.stdout.write(`  ${C.dim}→${C.reset} ${label}  `);

    const start = Date.now();
    try {
      const result = await runAgent({ agentId, cwd: root, mock: true, dryRun: false });
      recordRun(cycle, result);
      console.log(`${statusIcon(result.status)} ${formatDuration(Date.now() - start)}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`${statusIcon("error")} ${formatDuration(Date.now() - start)}  ${C.red}${msg.slice(0, 50)}${C.reset}`);
      recordRun(cycle, {
        agentId, backend: "mock", status: "error",
        durationMs: Date.now() - start, outputPath: "", error: msg,
      });
    }
  }

  // Self-improve
  process.stdout.write(`  ${C.dim}→${C.reset} ${C.magenta}Self-improve${C.reset}  `);
  try {
    const result = await runAgent({ agentId: "self_improve", cwd: root, mock: true, dryRun: false });
    recordRun(cycle, result);
    console.log(`${statusIcon(result.status)}`);
  } catch {
    console.log(`${statusIcon("error")}`);
  }

  cycle.completedAt = new Date().toISOString();
  cycle.nextPriorities = schedule.agents.slice(0, 3).map(String);

  const digest = generateDigest({ root, cycle });
  const digestPath = writeDigest(root, cycle, digest);
  cycle.digest = digestPath;
  pruneHistory(history);
  saveHistory(root, history);

  const ok = cycle.results.filter((r) => r.status === "finished").length;
  const fail = cycle.results.filter((r) => r.status === "error").length;
  console.log(`\n  ${C.bold}Cycle done:${C.reset} ${C.green}${ok} ok${C.reset}${fail > 0 ? ` ${C.red}${fail} errors${C.reset}` : ""}  ${C.dim}Digest: ${digestPath}${C.reset}\n`);
}

function showHistory(): void {
  const history = loadHistory(root);
  if (history.cycles.length === 0) {
    console.log(`\n  ${C.dim}No run history yet.${C.reset}\n`);
    return;
  }
  console.log(`\n  ${C.bold}Run History${C.reset} (${history.cycles.length} cycles)\n`);
  console.log(`  ${C.bold}  Cycle                   Started               Agents  OK  Err  Findings${C.reset}`);
  console.log(`  ${C.dim}${"─".repeat(76)}${C.reset}`);

  for (const c of history.cycles.slice(-10)) {
    const ok = c.results.filter((r) => r.status === "finished").length;
    const fail = c.results.filter((r) => r.status === "error").length;
    const findings = c.results.reduce((s, r) => s + (r.findings?.length ?? 0), 0);
    const started = c.startedAt.replace("T", " ").slice(0, 19);
    const id = c.cycleId.slice(0, 22).padEnd(22);
    console.log(
      `  ${C.dim}${id}${C.reset}  ${started}  ${String(c.agentsRun.length).padStart(6)}  ` +
      `${C.green}${String(ok).padStart(2)}${C.reset}  ${fail > 0 ? `${C.red}${String(fail).padStart(3)}${C.reset}` : `${C.dim}  0${C.reset}`}  ${String(findings).padStart(8)}`,
    );
  }
  console.log("");
}

function showDigest(): void {
  const history = loadHistory(root);
  const last = history.cycles[history.cycles.length - 1];
  if (!last?.digest) {
    console.log(`\n  ${C.dim}No digest available yet. Run a cycle first.${C.reset}\n`);
    return;
  }
  try {
    const content = readFileSync(last.digest, "utf8");
    console.log("");
    for (const line of content.split("\n")) {
      console.log(`  ${line}`);
    }
    console.log("");
  } catch {
    console.log(`\n  ${C.red}Could not read digest: ${last.digest}${C.reset}\n`);
  }
}

function showStatus(): void {
  const history = loadHistory(root);
  console.log(`\n  ${C.bold}Agent Status Overview${C.reset}\n`);
  console.log(`  ${C.bold}  Agent                     Last Run              Status    Findings${C.reset}`);
  console.log(`  ${C.dim}${"─".repeat(72)}${C.reset}`);

  for (const agentDef of AGENT_REGISTRY) {
    const lastRun = history.cycles
      .flatMap((c) => c.results)
      .filter((r) => r.agentId === agentDef.id)
      .pop();

    const id = agentDef.id.padEnd(25);
    if (lastRun) {
      const when = lastRun.timestamp.replace("T", " ").slice(0, 19);
      const status = lastRun.status === "finished"
        ? `${C.green}✓ ok${C.reset}     `
        : `${C.red}✗ error${C.reset}  `;
      const findings = String(lastRun.findings?.length ?? 0).padStart(8);
      console.log(`  ${id}  ${when}  ${status}${findings}`);
    } else {
      console.log(`  ${id}  ${C.dim}never run${C.reset}`);
    }
  }
  console.log("");
}

function showSchedule(): void {
  const history = loadHistory(root);
  const schedule = decideAgents(history, { maxAgents: 7 });
  console.log(`\n  ${C.bold}Next Cycle Preview${C.reset}\n`);
  for (const reason of schedule.reasoning) {
    console.log(`  ${C.dim}${reason}${C.reset}`);
  }
  console.log(`\n  ${C.bold}Would run:${C.reset} ${schedule.agents.map((a) => `${C.cyan}${a}${C.reset}`).join("  ")}\n`);
}

async function main(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  clearScreen();
  printHeader();
  printAgentTable();
  printMenu();

  const prompt = (): void => {
    rl.question(`${C.cyan}> ${C.reset}`, async (input) => {
      const parts = input.trim().split(/\s+/);
      const cmd = parts[0]?.toLowerCase();
      const arg = parts.slice(1).join(" ");

      try {
        switch (cmd) {
          case "run": {
            if (arg === "all") {
              await runAllAgents();
            } else if (arg) {
              const agentId = resolveAgentId(arg);
              if (agentId) {
                await runSingleAgent(agentId);
              } else {
                console.log(`  ${C.red}Unknown agent: ${arg}${C.reset}  (use ID or number 1-${AGENT_REGISTRY.length})\n`);
              }
            } else {
              console.log(`  ${C.dim}Usage: run <id|#> or run all${C.reset}\n`);
            }
            break;
          }
          case "cycle":
            await runAdaptiveCycle();
            break;
          case "history":
            showHistory();
            break;
          case "digest":
            showDigest();
            break;
          case "status":
            showStatus();
            break;
          case "schedule":
            showSchedule();
            break;
          case "list":
          case "agents":
            printAgentTable();
            break;
          case "help":
          case "?":
            printMenu();
            break;
          case "clear":
          case "cls":
            clearScreen();
            printHeader();
            break;
          case "quit":
          case "exit":
          case "q":
            console.log(`\n  ${C.dim}Bye.${C.reset}\n`);
            rl.close();
            process.exit(0);
          // eslint-disable-next-line no-fallthrough
          default:
            if (cmd) console.log(`  ${C.dim}Unknown command: ${cmd}. Type 'help' for commands.${C.reset}\n`);
            break;
        }
      } catch (err) {
        console.log(`  ${C.red}Error: ${err instanceof Error ? err.message : String(err)}${C.reset}\n`);
      }

      prompt();
    });
  };

  prompt();
}

main().catch((err) => {
  console.error(`${C.red}Dashboard error: ${err}${C.reset}`);
  process.exit(1);
});
