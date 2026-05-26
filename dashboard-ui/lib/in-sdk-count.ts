import type { RuntimePayload } from "./types";

/** Overview "In SDK" — worker heartbeat, live runs, or per-agent UI running count. */
export function overviewInSdkCount(
  runtime: RuntimePayload | undefined,
  runningFromStatusMap = 0,
): number {
  const fromRuntime =
    runtime?.active_run_count ??
    Math.min(
      Math.max(runtime?.sdk_slots_in_use ?? 0, runtime?.sdk_sessions_active ?? 0),
      runtime?.sdk_max_concurrent ?? 16,
    );
  return Math.max(fromRuntime, runningFromStatusMap);
}
