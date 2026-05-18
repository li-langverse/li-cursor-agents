"use client";

import { Badge } from "@/components/ui/badge";
import { formatTime } from "@/lib/format";
import { runBackendLabel, statusLabel, type ActivityListItem } from "@/lib/activity";

function ActionDrilldowns({ item, compact }: { item: ActivityListItem; compact?: boolean }) {
  const trace = item.run_trace;
  const input = item.run_input;
  const edits = trace?.file_edits ?? [];
  const toolSteps = (trace?.steps ?? []).filter((s) => s.type === "toolCall");
  const outputText = trace?.assistant_text ?? item.output_snippet ?? "";
  const thinking = trace?.thinking_text ?? item.thinking_preview ?? "";

  return (
    <div className="action-drilldowns">
      <details open={Boolean(input && !compact)}>
        <summary>Input prompt</summary>
        {input ? (
          <>
            <p className="trace-meta">
              {input.backend} · <code>{input.cwd}</code>
            </p>
            {!compact && input.system_prompt ? (
              <details>
                <summary>System prompt</summary>
                <pre className="trace-pre">{input.system_prompt}</pre>
              </details>
            ) : null}
            <pre className="trace-pre">{input.user_message}</pre>
          </>
        ) : (
          <p className="empty">No input recorded for this run.</p>
        )}
      </details>
      {thinking && !compact ? (
        <details>
          <summary>Thinking</summary>
          <pre className="trace-pre">{thinking}</pre>
        </details>
      ) : null}
      <details>
        <summary>Output</summary>
        {outputText ? (
          <pre className="trace-pre">{outputText}</pre>
        ) : (
          <p className="empty">No assistant output recorded.</p>
        )}
      </details>
      <details>
        <summary>Actions taken</summary>
        {edits.length > 0 ? (
          <>
            <h5>File edits ({edits.length})</h5>
            <ul className="simple-list">
              {edits.map((f, i) => (
                <li key={`${i}-${f.path}-${f.tool}`}>
                  <code>{f.path}</code> · {f.tool}
                  {f.ok === false ? " · failed" : ""}
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {toolSteps.length > 0 ? (
          <>
            <h5>Tool calls ({toolSteps.length})</h5>
            <ul className="simple-list">
              {toolSteps.map((s, i) => {
                const m = s.message ?? {};
                const target = m.args?.path ?? m.args?.command ?? m.type ?? "tool";
                return (
                  <li key={i}>
                    <code>{m.type ?? "tool"}</code> {String(target).slice(0, 140)}
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}
        {!edits.length && !toolSteps.length ? (
          <p className="empty">No file edits or tool calls recorded.</p>
        ) : null}
      </details>
    </div>
  );
}

export function ActivityCard({
  item,
  compact,
  onOpenTrace,
}: {
  item: ActivityListItem;
  compact?: boolean;
  onOpenTrace: (runId: string) => void;
}) {
  const status = item.live ? "running" : item.status;
  const preview = item.prompt_preview || item.output_snippet || item.action_summary || "—";
  const backend = runBackendLabel(item);

  return (
    <article className={`action-card ${compact ? "compact" : ""}`} data-run-id={item.run_id}>
      <header className="action-card-head">
        <div className="action-card-title">
          <code>{item.agent_id}</code>
          <span className={`status-pill sm status-${status}`}>{statusLabel(status)}</span>
          <span className="time">{formatTime(item.started_at)}</span>
        </div>
        <span className="action-chips">
          <Badge tone={backend === "mock" ? "warn" : "accent"}>{backend}</Badge>{" "}
          {item.action_summary ?? "—"}
        </span>
      </header>
      {compact ? <p className="action-preview">{preview}</p> : null}
      <ActionDrilldowns item={item} compact={compact} />
      <footer className="action-card-foot">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onOpenTrace(item.run_id)}>
          Full trace →
        </button>
      </footer>
    </article>
  );
}
