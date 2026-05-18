"use client";

import { useHeapPlan } from "@/hooks/use-dashboard-data";
import { normalizeHeapTasks } from "@/lib/heap-tasks";

export default function HeapPage() {
  const { data, isLoading, isError, error } = useHeapPlan();
  const tasks = normalizeHeapTasks(data?.heap_plan);

  if (isLoading) return <p className="loading-block">Loading heap plan…</p>;
  if (isError) return <p className="error-block">{(error as Error).message}</p>;

  return (
    <section className="panel">
      <h2>Heap plan ({tasks.length} tasks)</h2>
      <ul>
        {tasks.slice(0, 40).map((t) => (
          <li key={t.key}>
            <span className="mono">{t.coordinator}</span> → <span className="mono">{t.agent}</span> — {t.reason}
          </li>
        ))}
        {!tasks.length ? <li className="empty">No heap tasks in briefing</li> : null}
      </ul>
    </section>
  );
}
