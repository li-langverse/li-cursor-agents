"use client";

import { RichContent } from "@/components/content/rich-content";
import { useInterventions } from "@/hooks/use-dashboard-data";

export default function InterventionsPage() {
  const { data, isLoading, isError, error } = useInterventions();

  if (isLoading) return <p className="loading-block">Loading interventions…</p>;
  if (isError) return <p className="error-block">{(error as Error).message}</p>;

  return (
    <section className="panel">
      <h2>Interventions</h2>
      {data?.stale_warning ? <p className="hint">{data.stale_warning}</p> : null}
      <ul>
        {(data?.interventions ?? []).map((iv) => (
          <li key={iv.id ?? `${iv.title}-${iv.detail}`} className="intervention-item">
            <p>
              <strong>[{iv.severity}]</strong> {iv.title}
            </p>
            <RichContent text={iv.detail} maxHeight={240} className="trace-block compact" />
            {iv.action ? (
              <p className="hint">
                <strong>Action:</strong> {iv.action}
              </p>
            ) : null}
          </li>
        ))}
        {!(data?.interventions?.length ?? 0) ? <li className="empty">No interventions</li> : null}
      </ul>
    </section>
  );
}
