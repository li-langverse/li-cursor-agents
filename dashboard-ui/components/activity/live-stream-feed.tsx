"use client";

import type { RunDetail } from "@/lib/activity";
import { deriveLiveStreamPreview } from "@/lib/live-stream-preview";
import {
  buildDeltaRows,
  hasLiveTraceContent,
  toolStepsFromTrace,
} from "@/lib/live-stream-display";
import { RichContent } from "@/components/content/rich-content";

export function LiveStreamFeed({ detail }: { detail: RunDetail }) {
  const trace = detail.run_trace;
  const deltas = trace?.deltas ?? [];
  const events = detail.trace_events ?? [];
  const streamEvents = events.filter((e) => e.event_type.startsWith("stream_"));
  const rows = buildDeltaRows(deltas, streamEvents);
  const preview = deriveLiveStreamPreview({
    run_trace: trace,
    run_input: detail.run_input,
    reason: detail.reason,
  });
  const thinking = trace?.thinking_text?.trim() ?? "";
  const assistant = trace?.assistant_text?.trim() ?? "";
  const toolSteps = toolStepsFromTrace(trace);
  const hasContent = rows.length > 0 || hasLiveTraceContent(trace);

  if (!detail.live && !hasContent && !streamEvents.length) return null;

  if (detail.live && !hasContent) {
    return (
      <section className="trace-section live-stream-feed" data-testid="live-stream-feed">
        <h4>Live stream</h4>
        <p className="hint live-stream-status" data-testid="live-stream-status">
          {preview.headline}
          {preview.detail ? ` · ${preview.detail}` : ""}
        </p>
        <p className="hint" data-testid="live-stream-waiting">
          Waiting for agent activity…
        </p>
      </section>
    );
  }

  return (
    <section className="trace-section live-stream-feed" data-testid="live-stream-feed">
      <h4>
        {detail.live ? "Live stream" : "Stream trace"}
        {detail.live ? (
          <span className="hint" data-testid="live-stream-status">
            {" "}
            · {preview.headline}
          </span>
        ) : null}
        {rows.length > 0 ? <span className="hint"> ({rows.length} events)</span> : null}
      </h4>

      {detail.live && preview.detail && preview.headline !== "Starting" ? (
        <p className="hint live-stream-detail">{preview.detail}</p>
      ) : null}

      {thinking ? (
        <div className="live-stream-panel" data-testid="live-stream-thinking">
          <h5>Thinking</h5>
          <RichContent text={thinking} maxHeight={detail.live ? 280 : 320} className="trace-block rich-thinking" />
        </div>
      ) : null}

      {toolSteps.length > 0 ? (
        <div className="live-stream-panel" data-testid="live-stream-tools">
          <h5>Tools ({trace?.tool_call_count ?? toolSteps.length})</h5>
          <ul className="simple-list">
            {toolSteps.slice(-12).map((s, i) => {
              const m = s.message ?? {};
              const path = m.args?.path ?? m.args?.command ?? m.type;
              return (
                <li key={i}>
                  <code>{m.type}</code> {String(path).slice(0, 140)}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {assistant ? (
        <div className="live-stream-panel" data-testid="live-stream-assistant">
          <h5>{detail.live ? "Output (streaming)" : "Assistant output"}</h5>
          <RichContent text={assistant} maxHeight={detail.live ? 360 : 480} className="trace-block" />
        </div>
      ) : null}

      {rows.length > 0 ? (
        <details className="live-stream-raw" open={detail.live && rows.length <= 8}>
          <summary>SDK events ({rows.length})</summary>
          <ol className="live-delta-list">
            {rows.slice(-80).map((row) => (
              <li key={row.key} className="live-delta-item" data-testid="live-delta-item">
                <div className="live-delta-head">
                  <code>{row.label}</code>
                  {row.at ? <time className="hint mono">{row.at}</time> : null}
                </div>
                {row.body ? <pre className="live-delta-body">{row.body.slice(0, 2000)}</pre> : null}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </section>
  );
}
