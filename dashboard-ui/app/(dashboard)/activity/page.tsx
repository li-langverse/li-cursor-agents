"use client";

import { useRecentActivity } from "@/hooks/use-dashboard-data";
import { formatTime } from "@/lib/format";

export default function ActivityPage() {
  const { data, isLoading, isError, error } = useRecentActivity(25);

  if (isLoading) return <p className="loading-block">Loading activity…</p>;
  if (isError) return <p className="error-block">{(error as Error).message}</p>;

  return (
    <section className="panel">
      <h2>Recent runs</h2>
      <ul>
        {(data?.items ?? []).map((item) => (
          <li key={item.run_id}>
            <span className="mono">{item.agent_id}</span> — {item.status} — {formatTime(item.started_at)}
            {item.action_summary ? ` — ${item.action_summary}` : ""}
          </li>
        ))}
        {!(data?.items?.length ?? 0) ? <li className="empty">No runs yet</li> : null}
      </ul>
    </section>
  );
}
