/** Pure helpers for live run drawer stream UI (testable without React). */

export interface LiveStreamDeltaRow {
  key: string;
  label: string;
  at: string;
  body: string;
}

export interface LiveTraceSlice {
  assistant_text?: string;
  thinking_text?: string;
  tool_call_count?: number;
  steps?: Array<{ type: string; message?: Record<string, unknown> }>;
  deltas?: Array<{ seq: number; at: string; type: string; payload?: unknown }>;
}

export function formatDeltaPayload(payload: unknown): string {
  if (payload == null) return "";
  if (typeof payload === "string") return payload;
  if (typeof payload === "object" && payload !== null && "text" in payload) {
    return String((payload as { text: unknown }).text);
  }
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

export function deltaTypeLabel(type: string): string {
  switch (type) {
    case "thinking-delta":
      return "Thinking";
    case "text-delta":
      return "Assistant";
    case "tool-call-started":
      return "Tool started";
    case "tool-call-completed":
      return "Tool finished";
    default:
      return type;
  }
}

export function buildDeltaRows(
  deltas: LiveTraceSlice["deltas"],
  streamEvents: Array<{ seq: number; event_type: string; payload?: unknown }>,
): LiveStreamDeltaRow[] {
  if (deltas && deltas.length > 0) {
    return deltas.map((d) => ({
      key: `d-${d.seq}`,
      label: deltaTypeLabel(d.type),
      at: d.at,
      body: formatDeltaPayload(d.payload),
    }));
  }
  return streamEvents.map((e) => {
    const p = e.payload as { type?: string; at?: string; payload?: unknown } | null;
    const type = p?.type ?? e.event_type.replace(/^stream_/, "");
    return {
      key: `e-${e.seq}`,
      label: deltaTypeLabel(type),
      at: p?.at ?? "",
      body: formatDeltaPayload(p?.payload ?? e.payload),
    };
  });
}

export function hasLiveTraceContent(trace?: LiveTraceSlice): boolean {
  if (!trace) return false;
  if (trace.thinking_text?.trim()) return true;
  if (trace.assistant_text?.trim()) return true;
  if ((trace.tool_call_count ?? 0) > 0) return true;
  if ((trace.steps ?? []).some((s) => s.type === "toolCall")) return true;
  if ((trace.deltas ?? []).length > 0) return true;
  return false;
}

export function toolStepsFromTrace(trace?: LiveTraceSlice) {
  return (trace?.steps ?? []).filter((s) => s.type === "toolCall");
}
