import { agentLog } from "../agent-log.js";
import { startAsyncSwarm, isAsyncSwarmRunning } from "../async-swarm/async-swarm-runtime.js";
import { loadState } from "../control-plane/state.js";
import { loadWorkerStatusFromDb } from "../db/worker-status.js";
import { dbEnabled } from "../db/client.js";
import {
  detachedSwarmEnabled,
  externalSwarmRunnerEnabled,
  isDetachedSwarmChildRunning,
  spawnDetachedAsyncSwarm,
} from "../swarm/detached-swarm-process.js";
import { workerConsole } from "./worker-console.js";
import { flushWorkerHeartbeat } from "./heartbeat-loop.js";

function swarmActiveOnThisHost(): boolean {
  return isAsyncSwarmRunning() || isDetachedSwarmChildRunning();
}

function envAutoStartSwarm(): boolean {
  return (
    process.env.LI_AUTO_START_ASYNC_SWARM === "1" ||
    process.env.LI_AUTO_START_ASYNC_SWARM === "true"
  );
}

/**
 * After worker restart, in-memory swarm is off but Supabase worker_status may still say on.
 * Resume workers when DB says swarm was running, or when LI_AUTO_START_ASYNC_SWARM=1.
 * Otherwise write heartbeat so the dashboard does not show a stale "swarm on".
 */
export async function reconcileSwarmAfterStartup(): Promise<void> {
  const state = loadState();
  workerConsole(
    "reconcile",
    "info",
    "swarm reconcile begin",
    `running=${swarmActiveOnThisHost()} detached=${detachedSwarmEnabled()}`,
  );

  if (swarmActiveOnThisHost()) {
    await flushWorkerHeartbeat();
    workerConsole("reconcile", "info", "swarm already running — refreshed worker_status");
    return;
  }

  let shouldStart = envAutoStartSwarm();
  if (!shouldStart && dbEnabled()) {
    const worker = await loadWorkerStatusFromDb();
    if (worker?.async_swarm_running) {
      shouldStart = true;
      workerConsole(
        "reconcile",
        "info",
        "worker_status.async_swarm_running=true — resuming async swarm after restart",
      );
      agentLog(
        "dashboard",
        "info",
        "worker_status.async_swarm_running=true — resuming async swarm after restart",
      );
    }
  }

  const deferMs = Number(process.env.LI_SWARM_RECONCILE_DEFER_MS ?? 0);
  workerConsole(
    "reconcile",
    "info",
    `shouldStart=${shouldStart} deferMs=${deferMs} envAutoStart=${envAutoStartSwarm()}`,
  );

  if (shouldStart && externalSwarmRunnerEnabled() && !detachedSwarmEnabled()) {
    workerConsole(
      "reconcile",
      "info",
      "LI_SWARM_EXTERNAL=1 — swarm-dev.sh / agents:async-swarm owns startup",
    );
    await flushWorkerHeartbeat();
    return;
  }

  if (shouldStart) {
    const launch = async (): Promise<void> => {
      if (detachedSwarmEnabled()) {
        workerConsole("reconcile", "info", "spawning detached async swarm process…");
        const r = spawnDetachedAsyncSwarm();
        workerConsole("reconcile", "info", `detached async swarm: ${r.message}`);
        agentLog("dashboard", "info", `detached async swarm: ${r.message}`);
        await flushWorkerHeartbeat();
        return;
      }
      workerConsole("reconcile", "info", "starting async swarm (lanes + worker pool)…");
      const r = await startAsyncSwarm({ stopSupervisor: true });
      workerConsole("reconcile", "info", `async swarm: ${r.message}`);
      agentLog("dashboard", "info", `async swarm startup: ${r.message}`);
      await flushWorkerHeartbeat();
    };
    if (deferMs > 0) {
      workerConsole("reconcile", "info", `deferring swarm start ${deferMs}ms for API readiness`);
      setTimeout(() => {
        void launch().catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          workerConsole("reconcile", "ERROR", `deferred swarm start failed: ${msg}`);
          agentLog("dashboard", "ERROR", `deferred swarm start: ${msg}`);
        });
      }, deferMs).unref();
      return;
    }
    await launch();
    return;
  }

  workerConsole(
    "reconcile",
    "info",
    "swarm not auto-started — use dashboard Start agents or LI_AUTO_START_ASYNC_SWARM=1",
  );
  await flushWorkerHeartbeat();
}
