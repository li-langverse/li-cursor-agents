import { agentsPackageRoot, runAgent } from "../runner.js";
import { persistAgentRun } from "../db/persist.js";
import { hashBriefing } from "../control-plane/briefing-hash.js";
import { assembleReport, loadRecentRunSummariesAsync, writeReport } from "../control-plane/build-report.js";
import {
  agentNeedsWeb,
  defaultCoordPath,
  scanInterventions,
} from "../control-plane/interventions.js";
import { ensureControlPlaneDirs } from "../control-plane/paths.js";
import { loadState, pruneRecentTasks, saveState } from "../control-plane/state.js";
import { buildHeapPlan, parseOrgRoadmapFromBriefing } from "../heap/plan.js";
import { AGENT_REGISTRY } from "../agents/registry.js";
import { buildHeapTaskQueue, taskFingerprint } from "../heap/task-queue.js";
import type { AgentId } from "../types.js";
import { pushSupervisorActivity } from "../control-plane/supervisor-activity.js";
import { recordTaskRun, shouldSkipDispatch } from "../control-plane/task-queue.js";
import { completeSupervisorRun, registerSupervisorRun } from "../control-plane/runtime.js";
import {
  buildAgentKitMaintainerInstruction,
  refreshAgentKitAudit,
} from "../preflight/agent-kit-sync.js";
import { rolloutAgentKitPrs } from "../repo-workflow/agent-kit-rollout.js";
import { buildPrMergerInstruction, mergePlanFromBriefing } from "../preflight/merge-queue.js";
import { runLocalCiSweepForMergeAgents } from "../local-ci/sweep.js";
import { runPreflight, resolveBenchmarksRoot } from "../preflight.js";
import type { AgentRunResult, PreflightBundle } from "../types.js";
import type { ControlPlaneState, HumanIntervention, QueuedAgentTask } from "../control-plane/types.js";

export interface SupervisorOptions {
  benchmarksRoot?: string;
  mock: boolean;
  once: boolean;
  force: boolean;
  /** First loop iteration uses force=true so agents run immediately after Start loop. */
  forceFirstTick?: boolean;
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
  let briefing = preflight.briefing;
  let briefingHash = hashBriefing(briefing);
  state.last_preflight_at = preflight.generated_at;
  state.last_briefing_hash = briefingHash;

  let {
    tasks,
    skippedCooldown,
    heapPlan,
    activeCoordinator,
  } = buildHeapTaskQueue(briefing, state, {
    briefingHash,
    cooldownMs: options.cooldownMs,
    maxTasks: options.maxTasksPerTick,
  });

  // Do not re-queue recommended agents when heap skipped them on cooldown.
  if (tasks.length === 0 && skippedCooldown === 0) {
    const recommended = extractRecommended(briefing);
    const stopped = new Set(state.stopped_agents ?? []);
    for (const r of recommended) {
      const agentId = r.agent as AgentId;
      if (stopped.has(agentId)) continue;
      tasks.push({
        fingerprint: taskFingerprint(agentId, r.reason),
        agentId,
        reason: r.reason,
        source: "recommended",
      });
      if (tasks.length >= options.maxTasksPerTick) break;
    }
  }

  if (tasks.length === 0 && options.force) {
    const stopped = new Set(state.stopped_agents ?? []);
    for (const def of AGENT_REGISTRY) {
      if (def.id === "orchestrator") continue;
      if (stopped.has(def.id)) continue;
      tasks.push({
        fingerprint: taskFingerprint(def.id, "supervisor force dispatch"),
        agentId: def.id,
        reason: "supervisor force dispatch",
        source: "recommended",
      });
      if (tasks.length >= options.maxTasksPerTick) break;
    }
  }

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

  if (
    benchmarksRoot &&
    tasks.some((t) =>
      ["pr_merger", "pr_reviewer", "pr_alignment", "bug_fixer"].includes(t.agentId),
    )
  ) {
    const sweep = runLocalCiSweepForMergeAgents(
      benchmarksRoot,
      tasks.map((t) => t.agentId),
    );
    if (!sweep.skipped) {
      pushSupervisorActivity(
        sweep.ok ? "info" : "warn",
        sweep.ok
          ? `local-ci sweep: ${sweep.message.split("\n").slice(-2).join(" ") || "done"}`
          : `local-ci sweep failed: ${sweep.message.split("\n").slice(-2).join(" ") || "see logs"}`,
      );
      const refreshed = runPreflight(benchmarksRoot, true);
      preflight.briefing = refreshed.briefing;
      preflight.generated_at = refreshed.generated_at;
      briefing = refreshed.briefing;
      briefingHash = hashBriefing(briefing);
      state.last_briefing_hash = briefingHash;
      state.last_preflight_at = refreshed.generated_at;
    }
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
      state.current_supervisor_agent = task.agentId;
      saveState(state);
      const supervisorRunId = registerSupervisorRun(task.agentId, task.reason);
      try {
        let extraInstruction: string | undefined;
        if (task.agentId === "pr_merger") {
          extraInstruction = buildPrMergerInstruction(mergePlanFromBriefing(briefing));
        } else if (task.agentId === "agent_kit_maintainer" && benchmarksRoot) {
          const rollout = rolloutAgentKitPrs(benchmarksRoot, briefing, {
            dryRun: options.mock,
          });
          refreshAgentKitAudit(benchmarksRoot);
          extraInstruction = buildAgentKitMaintainerInstruction([], briefing, rollout);
        }
        const result = await runAgent({
          agentId: task.agentId,
          cwd: workCwd,
          benchmarksRoot,
          mock: options.mock,
          dryRun: false,
          extraInstruction,
        });
        executed.push(result);
        await persistRunMeta(task, result, briefingHash);
        recordTaskRun(state, task, briefingHash, result.status);
        tasksExecuted += 1;
        completeSupervisorRun(
          supervisorRunId,
          result.status === "error"
            ? "error"
            : result.status === "cancelled"
              ? "cancelled"
              : "finished",
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        state.last_error = msg;
        recordTaskRun(state, task, briefingHash, "error");
        completeSupervisorRun(supervisorRunId, "error");
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
      } finally {
        if (state.current_supervisor_agent === task.agentId) {
          state.current_supervisor_agent = undefined;
        }
      }
    }
  }

  const pruneAgeMs = Math.max(options.cooldownMs * 2, 86_400_000);
  pruneRecentTasks(state, 80, pruneAgeMs);
  state.supervisor_status = "idle";
  state.current_supervisor_agent = undefined;
  state.last_tick_at = new Date().toISOString();
  saveState(state);

  const recentRuns =
    executed.length > 0
      ? executed.map((r) => ({ ...r, briefing_hash: briefingHash }))
      : await loadRecentRunSummariesAsync(8);
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

async function persistRunMeta(
  task: QueuedAgentTask,
  result: AgentRunResult,
  briefingHash: string,
): Promise<void> {
  const enriched = {
    ...result,
    fingerprint: task.fingerprint,
    reason: task.reason,
    briefing_hash: briefingHash,
    coordinator: task.coordinator,
  };
  await persistAgentRun({ run: enriched });
}

function sleepMs(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Supervisor stopped", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Supervisor stopped", "AbortError"));
      },
      { once: true },
    );
  });
}

export async function runSupervisorLoop(
  options: SupervisorOptions,
  signal?: AbortSignal,
): Promise<void> {
  pushSupervisorActivity(
    "info",
    `Loop running (mock=${options.mock}, interval=${Math.round(options.intervalMs / 1000)}s)`,
    { once: options.once, force: options.force },
  );
  const forceFirst =
    options.forceFirstTick !== false || process.env.LI_SUPERVISOR_FORCE_FIRST_TICK === "1";
  let tickIndex = 0;
  for (;;) {
    if (signal?.aborted) break;
    const tickOptions =
      tickIndex === 0 && forceFirst ? { ...options, force: true } : options;
    const tick = await supervisorTick(tickOptions);
    tickIndex += 1;
    const msg = [
      `tick briefing=${tick.briefingHash}`,
      `executed=${tick.tasksExecuted}`,
      `skipped_cooldown=${tick.tasksSkippedCooldown}`,
      `interventions=${tick.interventions}`,
      tick.skippedUnchangedBriefing ? "unchanged_briefing=skip_agents" : "",
    ]
      .filter(Boolean)
      .join(" ");
    pushSupervisorActivity("tick", msg, {
      tasks_executed: tick.tasksExecuted,
      skipped_cooldown: tick.tasksSkippedCooldown,
      interventions: tick.interventions,
      skipped_unchanged_briefing: tick.skippedUnchangedBriefing,
    });

    if (options.once) break;
    if (signal?.aborted) break;
    const wait =
      tick.tasksExecuted > 0 ? Math.min(options.intervalMs, 120_000) : options.intervalMs;
    try {
      await sleepMs(wait, signal);
    } catch {
      break;
    }
  }
}
