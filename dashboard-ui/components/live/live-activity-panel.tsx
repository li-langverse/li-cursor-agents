"use client";

import { useQueries } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { LiveAgentRow } from "@/lib/live-agents";
import { deltaTypeLabel } from "@/lib/live-stream-display";

interface RunEventsResponse {
  run_id: string;
  events: Array<{
    seq: number;
    event_type: string;
    payload?: { ts?: string; message?: string; tool_name?: string; path?: string };
  }>;
}

function lastEventLine(
  events: RunEventsResponse["events"] | undefined,
): string | null {
  if (!events?.length) return null;
  const e = events[events.length - 1]!;
  const msg = e.payload?.message?.trim();
  if (!msg) return deltaTypeLabel(e.event_type);
  return msg.length > 120 ? `${msg.slice(0, 120)}…` : msg;
}

export function LiveActivityPanel({
  rows,
  onOpenRun,
}: {
  rows: LiveAgentRow[];
  onOpenRun?: (runId: string) => void;
}) {
  const withRun = rows.filter((r) => r.runId);
  const queries = useQueries({
    queries: withRun.map((r) => ({
      queryKey: ["run-events", r.runId],
      queryFn: () =>
        apiFetch<RunEventsResponse>(`/api/runs/${encodeURIComponent(r.runId!)}/events?limit=24`, {
          timeoutMs: 12_000,
        }),
      refetchInterval: 2500,
      enabled: Boolean(r.runId),
    })),
  });

  if (!withRun.length) {
    return (
      <p className="hint" data-testid="live-activity-empty">
        No SDK runs in progress — start the swarm to see tool and step activity here.
      </p>
    );
  }

  return (
    <ul className="activity-feed live-activity-feed" data-testid="live-activity-feed">
      {withRun.map((row, i) => {
        const q = queries[i];
        const events = q.data?.events;
        const line = lastEventLine(events) ?? row.detail;
        return (
          <li key={row.runId} data-testid="live-activity-item">
            <strong className="mono">{row.agentId}</strong>
            {line ? <> — {line}</> : null}
            {row.runId && onOpenRun ? (
              <>
                {" "}
                <button type="button" className="linkish" onClick={() => onOpenRun(row.runId!)}>
                  trace
                </button>
              </>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
