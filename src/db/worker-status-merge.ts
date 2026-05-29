import type { WorkerStatusRow } from "./worker-status.js";

/**
 * When the async-swarm process is alive, never persist `async_swarm_running: false`
 * (stale stop/reconcile must not overwrite a live swarm).
 */
export function applyAsyncSwarmWriterGuard(
  patch: Partial<WorkerStatusRow>,
  writerSwarmAlive: boolean,
): Partial<WorkerStatusRow> {
  if (!writerSwarmAlive) return patch;
  if (patch.async_swarm_running === false) {
    return { ...patch, async_swarm_running: true };
  }
  return patch;
}
