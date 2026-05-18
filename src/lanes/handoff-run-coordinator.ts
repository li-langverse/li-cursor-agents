import { isAsyncSwarmRunning } from "../async-swarm/async-swarm-state.js";
import { startAgentWorkerPool, stopAgentWorkerPool } from "../async-swarm/agent-worker-pool.js";
import { pushSupervisorActivity } from "../control-plane/supervisor-activity.js";
import { formatHandoffPhasesSummary, runHandoffPhasedSwarm, type HandoffPhaseResult } from "./run-handoff-phases.js";

let handoffRunInProgress = false;
let lastHandoffResult: HandoffPhaseResult | null = null;
let lastHandoffError: string | null = null;
let lastHandoffFinishedAt: string | null = null;

export function isHandoffRunInProgress(): boolean {
  return handoffRunInProgress;
}

export function handoffRunStatus(): {
  in_progress: boolean;
  last_finished_at: string | null;
  last_error: string | null;
  last_summary: string | null;
} {
  return {
    in_progress: handoffRunInProgress,
    last_finished_at: lastHandoffFinishedAt,
    last_error: lastHandoffError,
    last_summary: lastHandoffResult ? formatHandoffPhasesSummary(lastHandoffResult) : null,
  };
}

/** Non-blocking handoff run-all for dashboard (research → placement → implement). */
export function startHandoffRunInBackground(options?: { mock?: boolean }): {
  accepted: boolean;
  already_running?: boolean;
  message: string;
} {
  if (handoffRunInProgress) {
    return {
      accepted: false,
      already_running: true,
      message: "Handoff run-all already in progress — watch Supervisor log",
    };
  }

  handoffRunInProgress = true;
  lastHandoffError = null;
  const resumeWorkers = isAsyncSwarmRunning();
  if (resumeWorkers) {
    stopAgentWorkerPool();
    pushSupervisorActivity("info", "Paused agent worker pool for handoff run-all", {
      mode: "handoff_phases",
    });
  }
  pushSupervisorActivity("info", "Handoff run-all queued (background)", { mode: "handoff_phases" });

  void (async () => {
    try {
      const result = await runHandoffPhasedSwarm(options);
      lastHandoffResult = result;
      lastHandoffFinishedAt = new Date().toISOString();
      pushSupervisorActivity("info", formatHandoffPhasesSummary(result), { mode: "handoff_phases" });
    } catch (err) {
      lastHandoffError = err instanceof Error ? err.message : String(err);
      lastHandoffFinishedAt = new Date().toISOString();
      pushSupervisorActivity("error", `Handoff run-all failed: ${lastHandoffError}`, {
        mode: "handoff_phases",
      });
    } finally {
      handoffRunInProgress = false;
      if (resumeWorkers) {
        startAgentWorkerPool({ mock: options?.mock });
        pushSupervisorActivity("info", "Resumed agent worker pool after handoff run-all", {
          mode: "handoff_phases",
        });
      }
    }
  })();

  return {
    accepted: true,
    message: "Handoff run-all started — agents will show as running in Activity",
  };
}
