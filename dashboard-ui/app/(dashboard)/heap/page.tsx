"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export default function HeapPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["heap"],
    queryFn: () =>
      apiFetch<{ heap_plan?: { flat_tasks?: Array<{ id: string; agent_id: string; reason: string }> } }>(
        "/api/briefing",
      ),
    refetchInterval: 10000,
  });

  const tasks = data?.heap_plan?.flat_tasks ?? [];

  if (isLoading) return <p className="loading-block">Loading heap plan…</p>;

  return (
    <section className="panel">
      <h2>Heap plan ({tasks.length} tasks)</h2>
      <ul>
        {tasks.slice(0, 40).map((t) => (
          <li key={t.id}>
            <span className="mono">{t.agent_id}</span> — {t.reason}
          </li>
        ))}
        {!tasks.length ? <li className="empty">No heap tasks in briefing</li> : null}
      </ul>
    </section>
  );
}
