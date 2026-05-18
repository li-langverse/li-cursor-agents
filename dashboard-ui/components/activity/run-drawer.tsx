"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { formatTime } from "@/lib/format";
import { runBackendLabel, statusLabel, type RunDetail } from "@/lib/activity";
import { Badge } from "@/components/ui/badge";

function RunTraceBody({ detail }: { detail: RunDetail }) {
  const trace = detail.run_trace;
  const parts: ReactNode[] = [];

  if (detail.run_input) {
    parts.push(
      <section key="input" className="trace-section">
        <h4>Input</h4>
        {detail.run_input.system_prompt ? (
          <details>
            <summary>System prompt</summary>
            <pre className="trace-pre">{detail.run_input.system_prompt}</pre>
          </details>
        ) : null}
        <pre className="trace-pre">{detail.run_input.user_message}</pre>
      </section>,
    );
  }

  if (trace?.thinking_text) {
    parts.push(
      <section key="thinking" className="trace-section">
        <h4>Thinking</h4>
        <pre className="trace-pre">{trace.thinking_text}</pre>
      </section>,
    );
  }

  if (trace?.file_edits?.length) {
    parts.push(
      <section key="edits" className="trace-section">
        <h4>Files touched ({trace.file_edits.length})</h4>
        <ul className="simple-list">
          {trace.file_edits.map((f) => (
            <li key={`${f.path}-${f.tool}`}>
              <code>{f.path}</code> · {f.tool}
              {f.ok === false ? " · failed" : ""}
            </li>
          ))}
        </ul>
      </section>,
    );
  }

  const toolSteps = (trace?.steps ?? []).filter((s) => s.type === "toolCall");
  if (toolSteps.length) {
    parts.push(
      <section key="tools" className="trace-section">
        <h4>Tool steps ({trace?.tool_call_count ?? toolSteps.length})</h4>
        <ul className="simple-list">
          {toolSteps.map((s, i) => {
            const m = s.message ?? {};
            const path = m.args?.path ?? m.args?.command ?? m.type;
            return (
              <li key={i}>
                <code>{m.type}</code> {String(path).slice(0, 120)}
              </li>
            );
          })}
        </ul>
      </section>,
    );
  }

  parts.push(
    <section key="output" className="trace-section">
      <h4>Assistant output</h4>
      <pre className="trace-pre">{trace?.assistant_text ?? detail.output_preview ?? "(empty)"}</pre>
    </section>,
  );

  if (detail.completion) {
    parts.push(
      <section key="completion" className="trace-section">
        <h4>Completion audit</h4>
        <p>
          complete={String(detail.completion.complete)} premature={String(detail.completion.premature)}
        </p>
        {detail.completion.gaps?.length ? <p>Gaps: {detail.completion.gaps.join("; ")}</p> : null}
      </section>,
    );
  }

  if (detail.pr_urls?.length) {
    parts.push(
      <section key="prs" className="trace-section">
        <h4>PRs</h4>
        <ul className="simple-list">
          {detail.pr_urls.map((u) => (
            <li key={u}>
              <a href={u} target="_blank" rel="noopener noreferrer">
                {u}
              </a>
            </li>
          ))}
        </ul>
      </section>,
    );
  }

  return <div className="run-trace-body">{parts}</div>;
}

export function RunDrawer({ runId, onClose }: { runId: string | null; onClose: () => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["run-detail", runId],
    queryFn: () => apiFetch<RunDetail>(`/api/runs/${encodeURIComponent(runId!)}`, { timeoutMs: 20_000 }),
    enabled: Boolean(runId),
  });

  if (!runId) return null;

  const backend = data ? runBackendLabel(data) : "cursor-sdk";
  const status = data?.live ? "running" : (data?.status ?? "—");

  return (
    <>
      <button type="button" className="drawer-backdrop" aria-label="Close run trace" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-labelledby="run-drawer-title">
        <header className="drawer-header">
          <div>
            <h2 id="run-drawer-title">
              {data ? (
                <>
                  <code>{data.agent_id}</code> <Badge tone={backend === "mock" ? "warn" : "accent"}>{backend}</Badge>
                </>
              ) : (
                "Run trace"
              )}
            </h2>
            {data ? (
              <p className="subtitle">
                {statusLabel(status)} · {formatTime(data.started_at)}
              </p>
            ) : null}
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="drawer-body">
          {isLoading ? <p className="loading-block">Loading trace…</p> : null}
          {error ? <p className="error-block">{(error as Error).message}</p> : null}
          {data ? <RunTraceBody detail={data} /> : null}
        </div>
      </aside>
    </>
  );
}
