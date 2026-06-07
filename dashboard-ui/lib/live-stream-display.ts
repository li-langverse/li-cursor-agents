/** Pure helpers for live run drawer stream UI (testable without React). */

export interface LiveStreamDeltaRow {
  key: string;
  label: string;
  at: string;
  body: string;
}

/** Tool-call args emitted by the Cursor SDK in run_trace.steps[].message */
export interface ToolStepMessageArgs {
  path?: string;
  command?: string;
  url?: string;
}

export interface ToolStepMessage {
  type?: string;
  args?: ToolStepMessageArgs;
}

export interface ToolTraceStep {
  type: string;
  message?: ToolStepMessage;
}

export interface LiveTraceSlice {
  assistant_text?: string;
  thinking_text?: string;
  tool_call_count?: number;
  steps?: ToolTraceStep[];
  deltas?: Array<{ seq: number; at: string; type: string; payload?: unknown }>;
}

/** Primary label for a tool step (path, shell command, or tool type). */
export function toolStepTargetLabel(message?: ToolStepMessage): string {
  const args = message?.args;
  return args?.path ?? args?.command ?? args?.url ?? message?.type ?? "tool";
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
    case "tool_call_started":
      return "Tool started";
    case "tool-call-completed":
    case "tool_call_completed":
      return "Tool finished";
    case "step_thinking":
      return "Thinking";
    case "step_assistant":
      return "Assistant";
    case "file_edit":
      return "File edit";
    case "shell_output":
      return "Shell";
    case "tool_step":
      return "Tool";
    case "run_started":
      return "Run started";
    default:
      return type.replace(/_/g, " ");
  }
}

function formatRunEventPayload(payload: unknown): string {
  if (payload && typeof payload === "object" && "message" in payload) {
    return String((payload as { message: unknown }).message);
  }
  return formatDeltaPayload(payload);
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
    const p = e.payload as { type?: string; at?: string; ts?: string; payload?: unknown } | null;
    const type = p?.type ?? e.event_type.replace(/^stream_/, "");
    const at = p?.ts ?? p?.at ?? "";
    return {
      key: `e-${e.seq}`,
      label: deltaTypeLabel(type),
      at,
      body: formatRunEventPayload(e.payload),
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
