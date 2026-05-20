import { agentLog } from "../agent-log.js";
import { isAsyncSwarmRunning, startAsyncSwarm } from "../async-swarm/async-swarm-runtime.js";
import { dbEnabled } from "../db/client.js";
import { loadWorkerStatusFromDb, saveWorkerStatusToDb } from "../db/worker-status.js";
import { workerConsole } from "../worker/worker-console.js";
import {
  detachedSwarmEnabled,
  externalSwarmRunnerEnabled,
  isDetachedSwarmChildRunning,
  spawnDetachedAsyncSwarm,
} from "./detached-swarm-process.js";

function envAutoStartSwarm(): boolean {
  return (
    process.env.LI_AUTO_START_ASYNC_SWARM === "1" ||
    process.env.LI_AUTO_START_ASYNC_SWARM === "true"
  );
}

function swarmActiveOnThisHost(): boolean {
  return isAsyncSwarmRunning() || isDetachedSwarmChildRunning();
}

/** Clear stale async_swarm_running when detached child died without updating DB. */
export async function markDetachedSwarmStopped(reason: string): Promise<void> {
  if (!dbEnabled()) return;
  try {
    const worker = await loadWorkerStatusFromDb();
    if (!worker?.async_swarm_running) return;
    await saveWorkerStatusToDb({
      ...worker,
      async_swarm_running: false,
      active_runs: [],
    });
    workerConsole("watchdog", "info", `marked swarm stopped in DB: ${reason}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    agentLog("watchdog", "warn", `markDetachedSwarmStopped failed: ${msg}`);
  }
}

/**
 * Periodic + on-demand: respawn detached swarm (or in-process swarm) when auto-start is on
 * but the child process exited (e.g. SDK stall crash).
 */
export async function ensureSwarmRunningIfConfigured(): Promise<{
  action: "none" | "already_running" | "spawned" | "started_in_process";
  message: string;
}> {
  if (!envAutoStartSwarm()) {
    return { action: "none", message: "LI_AUTO_START_ASYNC_SWARM not set" };
  }

  if (swarmActiveOnThisHost()) {
    return { action: "already_running", message: "swarm process alive" };
  }

  if (externalSwarmRunnerEnabled() && !detachedSwarmEnabled()) {
    return { action: "none", message: "external swarm runner owns startup" };
  }

  if (detachedSwarmEnabled()) {
    workerConsole("watchdog", "info", "detached swarm missing — respawning");
    const r = spawnDetachedAsyncSwarm();
    agentLog("watchdog", "info", `respawn detached swarm: ${r.message}`);
    return {
      action: r.started ? "spawned" : "none",
      message: r.message,
    };
  }

  const r = await startAsyncSwarm({ stopSupervisor: true });
  return {
    action: r.started ? "started_in_process" : "none",
    message: r.message,
  };
}
