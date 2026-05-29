import type { WorkerStatusRow } from "./worker-status.js";

export function workerStatusUpdatedAtMs(row: WorkerStatusRow | null | undefined): number {
  if (!row?.updated_at) return 0;
  const t = Date.parse(row.updated_at);
  return Number.isFinite(t) ? t : 0;
}

/** Prefer the row with the latest `updated_at` (disk vs DB split-brain recovery). */
export function pickFreshestWorkerStatus(
  ...rows: Array<WorkerStatusRow | null | undefined>
): WorkerStatusRow | null {
  const valid = rows.filter((r): r is WorkerStatusRow => Boolean(r));
  if (!valid.length) return null;
  return valid.sort((a, b) => workerStatusUpdatedAtMs(b) - workerStatusUpdatedAtMs(a))[0]!;
}

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
