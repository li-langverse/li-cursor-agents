import type { ConversationStep } from "@cursor/sdk";
import type { AgentRunInputRecord, AgentRunTrace, AgentRunTraceEvent } from "../agent-run-trace.js";
import type { RunEventPayload, RunEventRecord } from "../db/run-events.js";
import type { ActiveAgentRun } from "./types.js";

const INPUT_TEXT_LIMIT = 1_200;
const TRACE_TEXT_LIMIT = 2_000;
const TRACE_STEPS_LIMIT = 8;
const TRACE_DELTAS_LIMIT = 20;
const FILE_EDITS_LIMIT = 50;
const RECENT_EVENTS_LIMIT = 5;

function limitText(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}... [truncated ${text.length - max} chars]`;
}

function limitTail(text: string, max: number): string {
  if (text.length <= max) return text;
  return `[truncated ${text.length - max} chars] ...${text.slice(-max)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compactValue(value: unknown, max = 240): unknown {
  if (typeof value === "string") return limitText(value, max);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (!isRecord(value)) return undefined;
  const out: Record<string, unknown> = {};
  for (const key of ["path", "command", "url", "tool", "callId", "status", "text", "message"]) {
    if (key in value) out[key] = compactValue(value[key], max);
  }
  return Object.keys(out).length ? out : undefined;
}

function compactStep(step: ConversationStep): ConversationStep {
  const row = step as unknown as Record<string, unknown>;
  const message = row.message;
  const out: Record<string, unknown> = { type: row.type };
  if (isRecord(message)) {
    const msg: Record<string, unknown> = {};
    for (const key of ["type", "text"]) {
      if (key in message) msg[key] = compactValue(message[key], key === "text" ? 500 : 120);
    }
    if ("args" in message) {
      const args = compactValue(message.args, 240);
      if (args !== undefined) msg.args = args;
    }
    if ("result" in message && isRecord(message.result)) {
      msg.result = compactValue(message.result, 120);
    }
    out.message = msg;
  }
  return out as unknown as ConversationStep;
}

function compactDelta(delta: AgentRunTraceEvent): AgentRunTraceEvent {
  return {
    ...delta,
    payload: compactValue(delta.payload, 500) ?? delta.payload,
  };
}

function compactRunEventPayload(payload: RunEventPayload): RunEventPayload {
  return {
    ...payload,
    message: limitText(payload.message, 500),
    tool_name: payload.tool_name ? limitText(payload.tool_name, 120) : payload.tool_name,
    path: payload.path ? limitText(payload.path, 240) : payload.path,
  };
}

export function compactRunInputForStatus(input: AgentRunInputRecord): AgentRunInputRecord {
  return {
    ...input,
    system_prompt: limitText(input.system_prompt, INPUT_TEXT_LIMIT),
    user_message: limitText(input.user_message, INPUT_TEXT_LIMIT),
    extra_instruction: input.extra_instruction
      ? limitText(input.extra_instruction, INPUT_TEXT_LIMIT)
      : input.extra_instruction,
  };
}

export function compactRunTraceForStatus(trace: AgentRunTrace): AgentRunTrace {
  return {
    ...trace,
    assistant_text: limitTail(trace.assistant_text ?? "", TRACE_TEXT_LIMIT),
    thinking_text: limitTail(trace.thinking_text ?? "", TRACE_TEXT_LIMIT),
    steps: (trace.steps ?? []).slice(-TRACE_STEPS_LIMIT).map(compactStep),
    deltas: (trace.deltas ?? []).slice(-TRACE_DELTAS_LIMIT).map(compactDelta),
    file_edits: (trace.file_edits ?? []).slice(-FILE_EDITS_LIMIT),
  };
}

export function compactActiveRunForStatus(run: ActiveAgentRun): ActiveAgentRun {
  return {
    ...run,
    run_input: run.run_input ? compactRunInputForStatus(run.run_input) : undefined,
    run_trace: run.run_trace ? compactRunTraceForStatus(run.run_trace) : undefined,
    recent_events: run.recent_events?.slice(-RECENT_EVENTS_LIMIT).map((event: RunEventRecord) => ({
      ...event,
      payload: compactRunEventPayload(event.payload),
    })),
  };
}

export function compactActiveRunsForStatus(runs: ActiveAgentRun[]): ActiveAgentRun[] {
  return runs.map(compactActiveRunForStatus);
}
