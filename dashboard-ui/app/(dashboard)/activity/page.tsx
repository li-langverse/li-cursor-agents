"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { formatTime } from "@/lib/format";

export default function ActivityPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["activity"],
    queryFn: () =>
      apiFetch<{ items: Array<{ run_id: string; agent_id: string; status: string; started_at: string; action_summary?: string }> }>(
        "/api/activity/recent?limit=25",
      ),
    refetchInterval: 5000,
  });

  if (isLoading) return <p className="loading-block">Loading activity…</p>;

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
