"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export default function InterventionsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["interventions"],
    queryFn: () =>
      apiFetch<{ interventions: Array<{ severity: string; title: string; detail: string }> }>(
        "/api/interventions",
      ),
    refetchInterval: 8000,
  });

  if (isLoading) return <p className="loading-block">Loading interventions…</p>;

  return (
    <section className="panel">
      <h2>Interventions</h2>
      <ul>
        {(data?.interventions ?? []).map((iv, i) => (
          <li key={i}>
            <strong>[{iv.severity}]</strong> {iv.title} — {iv.detail}
          </li>
        ))}
        {!(data?.interventions?.length ?? 0) ? <li className="empty">No interventions</li> : null}
      </ul>
    </section>
  );
}
