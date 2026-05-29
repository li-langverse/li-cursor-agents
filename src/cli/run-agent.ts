#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { loadRuntimeEnv, resolveCursorApiKey } from "../env.js";
loadRuntimeEnv();
import { AGENT_REGISTRY } from "../agents/registry.js";
import {
  resolveWorkflowRepoFromGoalFile,
  resolveWorkflowRepoFromText,
} from "../agents/resolve-workflow-repo.js";
import { loadLaneState } from "../lanes/lane-state.js";
import { pickNextGoalForAgent, loadResearchGoals } from "../research-goals/load-goals.js";
import { resolveResearchFactoryContext } from "../research-goals/research-goal-context.js";
import { agentBackendLabel, runAgent, shouldUseMock } from "../runner.js";
import type { AgentId } from "../types.js";

const FACTORY_RUN_INPUT_AGENTS = new Set<AgentId>(["numerics_researcher", "goal_researcher"]);

function resolveGoalInstruction(
  inline?: string,
  goalFile?: string,
): string | undefined {
  if (goalFile) {
    return readFileSync(goalFile, "utf8").trim();
  }
  if (inline?.trim()) return inline.trim();
  const env =
    process.env.LI_AGENT_GOAL?.trim() ||
    process.env.LI_AGENT_EXTRA_INSTRUCTION?.trim();
  return env || undefined;
}

function parseArgs(argv: string[]) {
  let agent: AgentId | undefined;
  let mock = false;
  let dryRun = false;
  let list = false;
  let cwd = process.cwd(); // SDK working tree (often benchmarks); prompts use package root
  let benchmarksRoot: string | undefined;
  let workflowRepo: string | undefined;
  let instruction: string | undefined;
  let goalFile: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--list") list = true;
    else if (a === "--mock") mock = true;
    else if (a === "--dry-run") dryRun = true;
    else if (a === "--agent" || a === "-a") agent = argv[++i] as AgentId;
    else if (a === "--cwd") cwd = argv[++i];
    else if (a === "--benchmarks") benchmarksRoot = argv[++i];
    else if (a === "--workflow-repo") workflowRepo = argv[++i];
    else if (a === "--instruction" || a === "--goal") instruction = argv[++i];
    else if (a === "--goal-file") goalFile = argv[++i];
    else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    }
  }
  const extraInstruction = resolveGoalInstruction(instruction, goalFile);
  let resolvedWorkflowRepo = workflowRepo;
  if (!resolvedWorkflowRepo?.trim()) {
    if (goalFile) {
      resolvedWorkflowRepo = resolveWorkflowRepoFromGoalFile(goalFile);
    } else if (extraInstruction) {
      resolvedWorkflowRepo = resolveWorkflowRepoFromText(extraInstruction);
    }
  }
  return {
    agent,
    mock,
    dryRun,
    list,
    cwd,
    benchmarksRoot,
    workflowRepo: resolvedWorkflowRepo,
    extraInstruction,
  };
}

function printHelp() {
  console.log(`li-agent â€” Cursor SDK local runner (real SDK by default)

Usage:
  li-agent --list
  li-agent --agent <id> [--dry-run]
  li-agent --agent orchestrator --benchmarks ../benchmarks
  li-agent --agent code_implementer --workflow-repo lic --goal-file ./goal.md

Agents: ${AGENT_REGISTRY.map((a) => a.id).join(", ")}

Goal-directed (reusable â€” no per-plan agent id):
  --goal / --instruction <text>   Injected as "## Additional instruction"
  --goal-file <path>              Same, from file
  LI_AGENT_GOAL / LI_AGENT_EXTRA_INSTRUCTION   Env fallback when flags omitted

Env:
  CURSOR_API_KEY     Required for real runs (.env or shell)
  BENCHMARKS_ROOT    Path to benchmarks repo for preflight
  LI_REPO_WORKFLOW_REPO   Target repo for repoWorkflow agents (e.g. lic)
                          Auto from --goal-file frontmatter workflow_repo: or path signals
  --mock             Dry-run mock backend (CI/tests set CURSOR_MOCK=1)
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.list) {
    for (const a of AGENT_REGISTRY) {
      console.log(
        `${a.id}\t${a.category}\tweb=${a.needsWeb}\t${a.name}\tâ€” ${a.description}`,
      );
    }
    return;
  }
  if (!args.agent) {
    printHelp();
    process.exit(1);
  }

  console.error(`backend: ${agentBackendLabel(args.mock)} agent: ${args.agent}`);
  if (!args.mock && !args.dryRun) {
    const { terminalStreamEnabled } = await import("../sdk/terminal-stream.js");
    if (terminalStreamEnabled()) {
      console.error(
        "SDK tool activity streams to stderr ([sdk] â–¶/âœ“ lines). Set LI_SDK_TERMINAL_STREAM=0 to disable.",
      );
    }
  }

  let researchContext;
  if (FACTORY_RUN_INPUT_AGENTS.has(args.agent)) {
    const goal = pickNextGoalForAgent(
      args.agent,
      loadResearchGoals(),
      loadLaneState().goal_last_run_at,
    );
    if (goal) researchContext = resolveResearchFactoryContext(goal);
  }

  const result = await runAgent({
    agentId: args.agent,
    cwd: args.cwd,
    benchmarksRoot: args.benchmarksRoot,
    mock: args.mock,
    dryRun: args.dryRun,
    workflowRepo: args.workflowRepo,
    extraInstruction: args.extraInstruction,
    researchContext,
  });

  console.log(JSON.stringify(result, null, 2));
  if (result.status === "error") process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
