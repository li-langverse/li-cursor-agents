import { agentLog } from "../agent-log.js";
import { startAsyncSwarm, isAsyncSwarmRunning } from "../async-swarm/async-swarm-runtime.js";
import { loadState } from "../control-plane/state.js";
import { loadWorkerStatusFromDb } from "../db/worker-status.js";
import { dbEnabled } from "../db/client.js";
import { persistWorkerHeartbeat } from "./heartbeat.js";

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

  if (isAsyncSwarmRunning()) {
    await persistWorkerHeartbeat(state);
    return;
  }

  let shouldStart = envAutoStartSwarm();
  if (!shouldStart && dbEnabled()) {
    const worker = await loadWorkerStatusFromDb();
    if (worker?.async_swarm_running) {
      shouldStart = true;
      agentLog(
        "dashboard",
        "info",
        "worker_status.async_swarm_running=true — resuming async swarm after restart",
      );
    }
  }

  const deferMs = Number(process.env.LI_SWARM_RECONCILE_DEFER_MS ?? 0);

  if (shouldStart) {
    const launch = async (): Promise<void> => {
      const r = await startAsyncSwarm({ stopSupervisor: true });
      agentLog("dashboard", "info", `async swarm startup: ${r.message}`);
      await persistWorkerHeartbeat(loadState());
    };
    if (deferMs > 0) {
      setTimeout(() => {
        void launch().catch((err) => {
          agentLog(
            "dashboard",
            "ERROR",
            `deferred swarm start: ${err instanceof Error ? err.message : err}`,
          );
        });
      }, deferMs).unref();
      return;
    }
    await launch();
    return;
  }

  await persistWorkerHeartbeat(loadState());
}
