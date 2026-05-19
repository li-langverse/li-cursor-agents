"use client";

import type { RunDetail } from "@/lib/activity";

function formatDeltaPayload(payload: unknown): string {
  if (payload == null) return "";
  if (typeof payload === "string") return payload;
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

export function LiveStreamFeed({ detail }: { detail: RunDetail }) {
  const deltas = detail.run_trace?.deltas ?? [];
  const events = detail.trace_events ?? [];
  const streamEvents = events.filter((e) => e.event_type.startsWith("stream_"));

  if (!detail.live && !deltas.length && !streamEvents.length) return null;

  const rows =
    deltas.length > 0
      ? deltas.map((d) => ({
          key: `d-${d.seq}`,
          label: d.type,
          at: d.at,
          body: formatDeltaPayload(d.payload),
        }))
      : streamEvents.map((e) => {
          const p = e.payload as { type?: string; at?: string; payload?: unknown } | null;
          return {
            key: `e-${e.seq}`,
            label: p?.type ?? e.event_type.replace(/^stream_/, ""),
            at: p?.at ?? "",
            body: formatDeltaPayload(p?.payload ?? e.payload),
          };
        });

  if (!rows.length) {
    return (
      <section className="trace-section live-stream-feed">
        <h4>Live stream</h4>
        <p className="hint">Waiting for SDK deltas…</p>
      </section>
    );
  }

  return (
    <section className="trace-section live-stream-feed">
      <h4>
        Live stream <span className="hint">({rows.length} events)</span>
      </h4>
      <ol className="live-delta-list">
        {rows.slice(-80).map((row) => (
          <li key={row.key} className="live-delta-item">
            <div className="live-delta-head">
              <code>{row.label}</code>
              {row.at ? <time className="hint mono">{row.at}</time> : null}
            </div>
            {row.body ? <pre className="live-delta-body">{row.body.slice(0, 2000)}</pre> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
