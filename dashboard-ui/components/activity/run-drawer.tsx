"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { RichContent } from "@/components/content/rich-content";
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
            <RichContent text={detail.run_input.system_prompt} maxHeight={360} className="trace-block" />
          </details>
        ) : null}
        <RichContent text={detail.run_input.user_message} maxHeight={420} className="trace-block" />
      </section>,
    );
  }

  if (trace?.thinking_text) {
    parts.push(
      <section key="thinking" className="trace-section">
        <h4>Thinking</h4>
        <RichContent text={trace.thinking_text} maxHeight={320} className="trace-block rich-thinking" />
      </section>,
    );
  }

  if (trace?.file_edits?.length) {
    parts.push(
      <section key="edits" className="trace-section">
        <h4>Files touched ({trace.file_edits.length})</h4>
        <ul className="simple-list">
          {trace.file_edits.map((f, i) => (
            <li key={`${i}-${f.path}-${f.tool}`}>
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
            const argsRaw =
              m.args && typeof m.args === "object" ? JSON.stringify(m.args, null, 2) : undefined;
            return (
              <li key={i} className="tool-step-item">
                <div>
                  <code>{m.type}</code> {String(path).slice(0, 120)}
                </div>
                {argsRaw ? (
                  <RichContent text={argsRaw} maxHeight={180} className="trace-block compact" />
                ) : null}
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
      <RichContent
        text={trace?.assistant_text ?? detail.output_preview}
        maxHeight={480}
        className="trace-block"
      />
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
    refetchInterval: (query) => (query.state.data?.live ? 1_000 : false),
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
          {data?.live && !data.run_trace && !data.run_input ? (
            <p className="loading-block">Run started — waiting for prompt and SDK stream…</p>
          ) : null}
          {data ? <RunTraceBody detail={data} /> : null}
        </div>
      </aside>
    </>
  );
}
