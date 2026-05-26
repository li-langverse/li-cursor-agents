import type { ActiveAgentRun } from "./types.js";

export function countRunningActiveRuns(runs: ActiveAgentRun[]): number {
  return runs.filter((r) => r.status === "running").length;
}

/**
 * Live Cursor SDK sessions for dashboard "In SDK".
 * Uses cross-process slot locks + in-process depth — not merged DB orphan rows or
 * registered worker tracks still waiting for a slot.
 */
export function computeInSdkCount(
  sdkSlotsInUse: number,
  sdkSessionsActive: number | null | undefined,
  sdkMaxConcurrent: number,
): number {
  const raw = Math.max(0, sdkSlotsInUse, sdkSessionsActive ?? 0);
  const cap = sdkMaxConcurrent > 0 ? sdkMaxConcurrent : 16;
  return Math.min(raw, cap);
}

/** Heartbeat / in-process tracks with status=running (may exceed SDK cap while waiting). */
export function countRegisteredRunningRuns(heartbeatRuns: ActiveAgentRun[]): number {
  return countRunningActiveRuns(heartbeatRuns);
}
