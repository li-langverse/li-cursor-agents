import { writeFileSync } from "node:fs";
import { agentsPackageRoot, runAgent } from "../runner.js";
import { hashBriefing } from "../control-plane/briefing-hash.js";
import { assembleReport, loadRecentRunSummaries, writeReport } from "../control-plane/build-report.js";
import {
  agentNeedsWeb,
  defaultCoordPath,
  scanInterventions,
} from "../control-plane/interventions.js";
import { ensureControlPlaneDirs } from "../control-plane/paths.js";
import { loadState, pruneRecentTasks, saveState } from "../control-plane/state.js";
import { buildHeapPlan, parseOrgRoadmapFromBriefing } from "../heap/plan.js";
import { buildHeapTaskQueue } from "../heap/task-queue.js";
import { recordTaskRun, shouldSkipDispatch } from "../control-plane/task-queue.js";
import { buildPrMergerInstruction, mergePlanFromBriefing } from "../preflight/merge-queue.js";
import { runPreflight, resolveBenchmarksRoot } from "../preflight.js";
import type { AgentRunResult, PreflightBundle } from "../types.js";
import type { ControlPlaneState, HumanIntervention, QueuedAgentTask } from "../control-plane/types.js";

export interface SupervisorOptions {
  benchmarksRoot?: string;
  mock: boolean;
  once: boolean;
  force: boolean;
  intervalMs: number;
  cooldownMs: number;
  maxTasksPerTick: number;
  coordPath?: string;
  skipSlowPreflight?: boolean;
}

export interface TickResult {
  briefingHash: string;
  tasksExecuted: number;
  tasksSkippedCooldown: number;
  skippedUnchangedBriefing: boolean;
  interventions: number;
}

function extractRecommended(briefing: unknown): Array<{ agent: string; reason: string }> {
  if (!briefing || typeof briefing !== "object") return [];
  const rec = (briefing as Record<string, unknown>).recommended_agents;
  return Array.isArray(rec) ? (rec as Array<{ agent: string; reason: string }>) : [];
}

export async function supervisorTick(options: SupervisorOptions): Promise<TickResult> {
  ensureControlPlaneDirs();
  const state = loadState();
  state.last_tick_at = new Date().toISOString();
  state.supervisor_status = "waiting";
  state.last_error = undefined;

  const benchmarksRoot = resolveBenchmarksRoot(options.benchmarksRoot);
  const preflight: PreflightBundle = runPreflight(benchmarksRoot, options.skipSlowPreflight !== false);
  const briefing = preflight.briefing;
  const briefingHash = hashBriefing(briefing);
  state.last_preflight_at = preflight.generated_at;
  state.last_briefing_hash = briefingHash;

  const {
    tasks,
    skippedCooldown,
    heapPlan,
    activeCoordinator,
  } = buildHeapTaskQueue(briefing, state, {
    briefingHash,
    cooldownMs: options.cooldownMs,
    maxTasks: options.maxTasksPerTick,
  });

  const orgRoadmap = parseOrgRoadmapFromBriefing(briefing) ?? undefined;
  const pendingWeb = tasks.filter((t) => agentNeedsWeb(t.agentId)).map((t) => t.agentId);
  const interventions = scanInterventions(briefing, {
    coordPath: options.coordPath ?? defaultCoordPath(),
    pendingWebAgents: options.mock ? [] : pendingWeb,
  });

  if (heapPlan.validation_errors.length > 0) {
    interventions.push({
      id: "heap_invalid:plan",
      kind: "heap_invalid",
      severity: "high",
      title: "Heap plan validation failed",
      detail: heapPlan.validation_errors.join("; "),
      action: "Fix agent-briefing.py grouping or reduce recommended agents per coordinator (max 10).",
      links: ["https://docs.agentron.rocks/concepts/heap/"],
      created_at: new Date().toISOString(),
    });
  }

  const skippedUnchanged =
    shouldSkipDispatch(state, briefingHash, tasks.length, options.force) && interventions.length === 0;

  const executed: AgentRunResult[] = [];
  let tasksExecuted = 0;

  if (!skippedUnchanged) {
    const packageRoot = agentsPackageRoot();
    const workCwd = benchmarksRoot ?? packageRoot;

    for (const task of tasks) {
      state.supervisor_status = "running_agent";
      saveState(state);
      try {
        const extraInstruction =
          task.agentId === "pr_merger"
            ? buildPrMergerInstruction(mergePlanFromBriefing(briefing))
            : undefined;
        const result = await runAgent({
          agentId: task.agentId,
          cwd: workCwd,
          benchmarksRoot,
          mock: options.mock,
          dryRun: false,
          extraInstruction,
        });
        executed.push(result);
        persistRunMeta(task, result, briefingHash);
        recordTaskRun(state, task, briefingHash, result.status);
        tasksExecuted += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        state.last_error = msg;
        recordTaskRun(state, task, briefingHash, "error");
        interventions.push({
          id: `agent_error:${task.agentId}`,
          kind: "agent_error",
          severity: "high",
          title: `Agent run failed: ${task.agentId}`,
          detail: msg,
          action: "Check logs in data/runs/ and API key; retry after fix.",
          links: [],
          created_at: new Date().toISOString(),
        });
      }
    }
  }

  const pruneAgeMs = Math.max(options.cooldownMs * 2, 86_400_000);
  pruneRecentTasks(state, 80, pruneAgeMs);
  state.supervisor_status = "idle";
  saveState(state);

  const recentRuns =
    executed.length > 0
      ? executed.map((r) => ({ ...r, briefing_hash: briefingHash }))
      : loadRecentRunSummaries(8);
  const report = assembleReport({
    briefingHash,
    preflight,
    recommended: extractRecommended(briefing),
    orgRoadmap,
    heapPlan,
    activeCoordinator,
    interventions,
    state,
    tasksExecuted,
    tasksSkippedCooldown: skippedCooldown,
    recentRuns,
  });
  writeReport(report, interventions);

  return {
    briefingHash,
    tasksExecuted,
    tasksSkippedCooldown: skippedCooldown,
    skippedUnchangedBriefing: skippedUnchanged,
    interventions: interventions.length,
  };
}

function persistRunMeta(task: QueuedAgentTask, result: AgentRunResult, briefingHash: string): void {
  const jsonPath = result.outputPath.replace(/\.md$/, ".json");
  const meta = {
    ...result,
    fingerprint: task.fingerprint,
    reason: task.reason,
    briefing_hash: briefingHash,
  };
  writeFileSync(jsonPath, JSON.stringify(meta, null, 2) + "\n", "utf8");
}

export async function runSupervisorLoop(options: SupervisorOptions): Promise<void> {
  for (;;) {
    const tick = await supervisorTick(options);
    const msg = [
      `tick briefing=${tick.briefingHash}`,
      `executed=${tick.tasksExecuted}`,
      `skipped_cooldown=${tick.tasksSkippedCooldown}`,
      `interventions=${tick.interventions}`,
      tick.skippedUnchangedBriefing ? "unchanged_briefing=skip_agents" : "",
    ]
      .filter(Boolean)
      .join(" ");
    console.error(`[supervisor] ${msg}`);

    if (options.once) break;
    const sleepMs =
      tick.tasksExecuted > 0 ? Math.min(options.intervalMs, 120_000) : options.intervalMs;
    await new Promise((r) => setTimeout(r, sleepMs));
  }
}
