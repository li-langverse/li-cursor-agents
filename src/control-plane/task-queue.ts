import type { ControlPlaneState, QueuedAgentTask, RecentTaskRecord } from "./types.js";

export { taskFingerprint } from "../heap/task-queue.js";
export { buildHeapTaskQueue as buildTaskQueue } from "../heap/task-queue.js";

function wasRecentlyRun(
  recent: RecentTaskRecord[],
  fingerprint: string,
  briefingHash: string,
  cooldownMs: number,
): boolean {
  const cutoff = Date.now() - cooldownMs;
  return recent.some(
    (t) =>
      t.fingerprint === fingerprint &&
      t.briefing_hash === briefingHash &&
      new Date(t.finished_at).getTime() >= cutoff &&
      t.status === "finished",
  );
}

export function recordTaskRun(
  state: ControlPlaneState,
  task: QueuedAgentTask,
  briefingHash: string,
  status: string,
): void {
  state.recent_tasks.push({
    fingerprint: task.fingerprint,
    agentId: task.agentId,
    reason: task.reason,
    finished_at: new Date().toISOString(),
    status,
    briefing_hash: briefingHash,
  });
  state.runs_total += 1;
}

/** Skip agent dispatch when briefing unchanged and no new work (anti-cycle). */
export function shouldSkipDispatch(
  state: ControlPlaneState,
  briefingHash: string,
  taskCount: number,
  force: boolean,
): boolean {
  if (force) return false;
  if (taskCount > 0) return false;
  return state.last_briefing_hash === briefingHash && briefingHash.length > 0;
}
