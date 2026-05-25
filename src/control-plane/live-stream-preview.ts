import type { AgentRunInputRecord, AgentRunTrace } from "../agent-run-trace.js";
import type { ActiveAgentRun } from "./types.js";

export interface LiveStreamPreview {
  headline: string;
  detail: string;
  snippet: string;
  actionSummary: string;
}

function collapseWs(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function lastToolLabel(trace: AgentRunTrace): { headline: string; detail: string } | null {
  const steps = trace.steps ?? [];
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (step.type !== "toolCall") continue;
    const m = (step.message ?? {}) as Record<string, unknown>;
    const toolType = String(m.type ?? "tool");
    const args = m.args as Record<string, unknown> | undefined;
    const target = args?.path ?? args?.command ?? args?.url ?? toolType;
    return {
      headline: `Tool: ${toolType}`,
      detail: collapseWs(String(target)).slice(0, 160),
    };
  }
  return null;
}

/** Human-readable live status from partial SDK trace (worker_status + activity). */
export function deriveLiveStreamPreview(run: {
  run_trace?: AgentRunTrace;
  run_input?: AgentRunInputRecord;
  reason?: string;
}): LiveStreamPreview {
  const trace = run.run_trace;
  const tools = trace?.tool_call_count ?? 0;

  if (trace) {
    const tool = lastToolLabel(trace);
    if (tool && tools > 0) {
      const snippet =
        trace.assistant_text?.slice(-280) ||
        trace.thinking_text?.slice(-200) ||
        tool.detail;
      return {
        headline: tool.headline,
        detail: tool.detail,
        snippet: collapseWs(snippet).slice(0, 320),
        actionSummary: `${tools} tool${tools === 1 ? "" : "s"} · in progress`,
      };
    }
    if (trace.thinking_text?.trim()) {
      const t = collapseWs(trace.thinking_text);
      return {
        headline: "Thinking",
        detail: t.slice(0, 160),
        snippet: t.slice(0, 320),
        actionSummary: "thinking · live",
      };
    }
    if (trace.assistant_text?.trim()) {
      const a = collapseWs(trace.assistant_text);
      return {
        headline: "Writing",
        detail: a.slice(0, 160),
        snippet: a.slice(-320),
        actionSummary: "streaming output",
      };
    }
  }

  if (run.run_input?.user_message?.trim()) {
    const p = collapseWs(run.run_input.user_message);
    return {
      headline: "Prompt sent",
      detail: p.slice(0, 160),
      snippet: p.slice(0, 280),
      actionSummary: "awaiting SDK",
    };
  }

  const reason = run.reason?.trim();
  return {
    headline: "Starting",
    detail: reason || "Waiting for first SDK event",
    snippet: "",
    actionSummary: "starting",
  };
}

export function deriveLiveStreamPreviewFromActive(run: ActiveAgentRun): LiveStreamPreview {
  return deriveLiveStreamPreview({
    run_trace: run.run_trace,
    run_input: run.run_input,
    reason: run.reason,
  });
}
