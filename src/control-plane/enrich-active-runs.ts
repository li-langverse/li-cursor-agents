import { getRunEventsForApi, runEventsPersistEnabled, type RunEventRecord } from "../db/run-events.js";
import { deriveLiveStreamPreviewFromActive } from "./live-stream-preview.js";
import type { ActiveAgentRun } from "./types.js";
import type { RunEventPayload } from "../db/run-events.js";

/** Attach last N structured events per running row for dashboard live activity (avoids N+1 when embedded). */
function enrichRunRow(r: ActiveAgentRun, recent: RunEventRecord[] | undefined): ActiveAgentRun {
  if (recent?.length) {
    const last = recent[recent.length - 1]!;
    return { ...r, recent_events: recent, last_event: last.payload };
  }
  if (r.status !== "running" || (!r.run_trace && !r.run_input)) return r;
  const preview = deriveLiveStreamPreviewFromActive(r);
  if (!preview.detail && preview.actionSummary === "starting") return r;
  const fallback: RunEventPayload = {
    ts: r.started_at,
    kind: "live",
    message: preview.detail || preview.headline,
  };
  return { ...r, last_event: fallback };
}

export async function enrichActiveRunsWithRecentEvents(
  runs: ActiveAgentRun[],
  perRunLimit = 5,
): Promise<ActiveAgentRun[]> {
  const running = runs.filter((r) => r.status === "running" && r.run_id);
  const byRun = new Map<string, RunEventRecord[]>();
  if (runEventsPersistEnabled() && running.length) {
    await Promise.all(
      running.map(async (r) => {
        try {
          byRun.set(r.run_id, await getRunEventsForApi(r.run_id, perRunLimit));
        } catch {
          byRun.set(r.run_id, []);
        }
      }),
    );
  }
  return runs.map((r) => enrichRunRow(r, byRun.get(r.run_id)));
}
