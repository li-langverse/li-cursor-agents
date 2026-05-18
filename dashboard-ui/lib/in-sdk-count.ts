import type { RuntimePayload } from "./types";

/** Overview "In SDK" — worker heartbeat, live runs, or per-agent UI running count. */
export function overviewInSdkCount(
  runtime: RuntimePayload | undefined,
  runningFromStatusMap = 0,
): number {
  const fromRuntime = Math.max(
    runtime?.active_run_count ?? 0,
    runtime?.sdk_sessions_active ?? 0,
  );
  return Math.max(fromRuntime, runningFromStatusMap);
}
