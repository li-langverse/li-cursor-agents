/** Mirrors src/control-plane/live-stream-preview.ts for client-side live rows. */

export interface LiveRunTraceSlice {
  assistant_text?: string;
  thinking_text?: string;
  tool_call_count?: number;
  steps?: Array<{ type: string; message?: Record<string, unknown> }>;
}

export interface LiveStreamPreview {
  headline: string;
  detail: string;
  snippet: string;
}

function collapseWs(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function lastToolLabel(trace: LiveRunTraceSlice): { headline: string; detail: string } | null {
  const steps = trace.steps ?? [];
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (step.type !== "toolCall") continue;
    const m = step.message ?? {};
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

export function deriveLiveStreamPreview(run: {
  run_trace?: LiveRunTraceSlice;
  run_input?: { user_message?: string };
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
      };
    }
    if (trace.thinking_text?.trim()) {
      const t = collapseWs(trace.thinking_text);
      return { headline: "Thinking", detail: t.slice(0, 160), snippet: t.slice(0, 320) };
    }
    if (trace.assistant_text?.trim()) {
      const a = collapseWs(trace.assistant_text);
      return { headline: "Writing", detail: a.slice(0, 160), snippet: a.slice(-320) };
    }
  }

  if (run.run_input?.user_message?.trim()) {
    const p = collapseWs(run.run_input.user_message);
    return { headline: "Prompt sent", detail: p.slice(0, 160), snippet: p.slice(0, 280) };
  }

  return {
    headline: "Starting",
    detail: run.reason?.trim() || "Waiting for first SDK event",
    snippet: "",
  };
}
