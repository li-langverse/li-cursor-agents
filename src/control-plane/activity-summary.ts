import type { AgentRunInputRecord, AgentRunTrace } from "../agent-run-trace.js";
import type { RunCatalogEntry } from "./runs-catalog.js";

export interface ActivityListItem extends RunCatalogEntry {
  action_summary: string;
  edit_count: number;
  tool_count: number;
  has_trace: boolean;
  has_input: boolean;
  prompt_preview: string;
  thinking_preview: string;
  output_snippet: string;
}

export function slimTraceForList(trace?: AgentRunTrace): AgentRunTrace | undefined {
  if (!trace) return undefined;
  return {
    version: trace.version,
    assistant_text: trace.assistant_text,
    thinking_text: trace.thinking_text,
    file_edits: trace.file_edits ?? [],
    tool_call_count: trace.tool_call_count,
    steps: (trace.steps ?? []).filter((s) => s.type === "toolCall").slice(0, 12),
    deltas: [],
  };
}

export function slimInputForList(input?: AgentRunInputRecord): AgentRunInputRecord | undefined {
  if (!input) return undefined;
  return {
    ...input,
    system_prompt: input.system_prompt.length > 4000 ? `${input.system_prompt.slice(0, 4000)}…` : input.system_prompt,
    user_message: input.user_message.length > 8000 ? `${input.user_message.slice(0, 8000)}…` : input.user_message,
  };
}

export function toActivityListItem(entry: RunCatalogEntry): ActivityListItem {
  const trace = entry.run_trace;
  const input = entry.run_input;
  const edits = trace?.file_edits?.length ?? 0;
  const tools = trace?.tool_call_count ?? 0;
  const parts: string[] = [];
  if (tools > 0) parts.push(`${tools} tool${tools === 1 ? "" : "s"}`);
  if (edits > 0) parts.push(`${edits} file edit${edits === 1 ? "" : "s"}`);
  if (trace?.thinking_text) parts.push("thinking");
  const action_summary = parts.length ? parts.join(" · ") : input || trace ? "run logged" : "—";

  const output_snippet =
    trace?.assistant_text?.slice(0, 320) ??
    entry.output_preview?.slice(0, 320) ??
    entry.summary?.slice(0, 320) ??
    "";

  return {
    ...entry,
    run_input: slimInputForList(input),
    run_trace: slimTraceForList(trace),
    action_summary,
    edit_count: edits,
    tool_count: tools,
    has_trace: Boolean(trace || input),
    has_input: Boolean(input),
    prompt_preview: input?.user_message?.replace(/\s+/g, " ").trim().slice(0, 280) ?? "",
    thinking_preview: trace?.thinking_text?.replace(/\s+/g, " ").trim().slice(0, 200) ?? "",
    output_snippet,
  };
}

export function listToActivityItems(entries: RunCatalogEntry[]): ActivityListItem[] {
  return entries.map(toActivityListItem);
}
