#!/usr/bin/env node
import { loadRuntimeEnv, resolveCursorApiKey } from "../env.js";
loadRuntimeEnv();
import { AGENT_REGISTRY } from "../agents/registry.js";
import { agentBackendLabel, runAgent, shouldUseMock } from "../runner.js";
import type { AgentId } from "../types.js";

function parseArgs(argv: string[]) {
  let agent: AgentId | undefined;
  let mock = false;
  let dryRun = false;
  let list = false;
  let cwd = process.cwd(); // SDK working tree (often benchmarks); prompts use package root
  let benchmarksRoot: string | undefined;
  let workflowRepo: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--list") list = true;
    else if (a === "--mock") mock = true;
    else if (a === "--dry-run") dryRun = true;
    else if (a === "--agent" || a === "-a") agent = argv[++i] as AgentId;
    else if (a === "--cwd") cwd = argv[++i];
    else if (a === "--benchmarks") benchmarksRoot = argv[++i];
    else if (a === "--workflow-repo") workflowRepo = argv[++i];
    else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    }
  }
  return { agent, mock, dryRun, list, cwd, benchmarksRoot, workflowRepo };
}

function printHelp() {
  console.log(`li-agent — Cursor SDK local runner (real SDK by default)

Usage:
  li-agent --list
  li-agent --agent <id> [--dry-run]
  li-agent --agent orchestrator --benchmarks ../benchmarks

Agents: ${AGENT_REGISTRY.map((a) => a.id).join(", ")}

Env:
  CURSOR_API_KEY     Required for real runs (.env or shell)
  BENCHMARKS_ROOT    Path to benchmarks repo for preflight
  --mock             Dry-run mock backend (CI/tests set CURSOR_MOCK=1)
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.list) {
    for (const a of AGENT_REGISTRY) {
      console.log(
        `${a.id}\t${a.category}\tweb=${a.needsWeb}\t${a.name}\t— ${a.description}`,
      );
    }
    return;
  }
  if (!args.agent) {
    printHelp();
    process.exit(1);
  }

  console.error(`backend: ${agentBackendLabel(args.mock)} agent: ${args.agent}`);

  const result = await runAgent({
    agentId: args.agent,
    cwd: args.cwd,
    benchmarksRoot: args.benchmarksRoot,
    mock: args.mock,
    dryRun: args.dryRun,
    workflowRepo: args.workflowRepo,
  });

  console.log(JSON.stringify(result, null, 2));
  if (result.status === "error") process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
