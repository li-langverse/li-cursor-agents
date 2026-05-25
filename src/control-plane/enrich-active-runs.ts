import { getRunEventsForApi, runEventsPersistEnabled, type RunEventRecord } from "../db/run-events.js";
import type { ActiveAgentRun } from "./types.js";

/** Attach last N structured events per running row for dashboard live activity (avoids N+1 when embedded). */
export async function enrichActiveRunsWithRecentEvents(
  runs: ActiveAgentRun[],
  perRunLimit = 5,
): Promise<ActiveAgentRun[]> {
  if (!runEventsPersistEnabled()) return runs;
  const running = runs.filter((r) => r.status === "running" && r.run_id);
  if (!running.length) return runs;

  const byRun = new Map<string, RunEventRecord[]>();
  await Promise.all(
    running.map(async (r) => {
      try {
        byRun.set(r.run_id, await getRunEventsForApi(r.run_id, perRunLimit));
      } catch {
        byRun.set(r.run_id, []);
      }
    }),
  );
  return runs.map((r) => {
    const recent = byRun.get(r.run_id);
    if (!recent?.length) return r;
    const last = recent[recent.length - 1]!;
    return { ...r, recent_events: recent, last_event: last.payload };
  });
}
