import type { ActiveAgentRun } from "./types.js";

export function countRunningActiveRuns(runs: ActiveAgentRun[]): number {
  return runs.filter((r) => r.status === "running").length;
}

/** Live SDK / in-process runs for dashboard "In SDK" (not stale finished rows). */
export function computeInSdkCount(
  activeRuns: ActiveAgentRun[],
  sdkSessionsActive: number | null | undefined,
): number {
  const running = countRunningActiveRuns(activeRuns);
  const sdk = sdkSessionsActive ?? 0;
  return Math.max(running, sdk);
}
