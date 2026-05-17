import type { ConversationStep } from "@cursor/sdk";
import type { InteractionUpdate } from "@cursor/sdk";

export const TRACE_VERSION = 1 as const;
const MAX_DELTAS = 500;

export interface AgentRunInputRecord {
  version: typeof TRACE_VERSION;
  agent_id: string;
  backend: "mock" | "cursor-sdk";
  model_id?: string;
  cwd: string;
  benchmarks_root?: string;
  briefing_path?: string;
  briefing_hash?: string;
  preflight_generated_at?: string;
  dry_run: boolean;
  mock: boolean;
  system_prompt: string;
  user_message: string;
  extra_instruction?: string;
}

export interface AgentRunTraceFileEdit {
  path: string;
  tool: "edit" | "write" | "delete" | "read" | "shell" | string;
  ok?: boolean;
  lines_added?: number;
  lines_removed?: number;
}

export interface AgentRunTraceEvent {
  seq: number;
  at: string;
  kind: "step" | "delta";
  type: string;
  payload: unknown;
}

export interface SdkAttemptTraceMeta {
  attempt: number;
  force: boolean;
  durationMs: number;
  toolCalls: number;
  status: string;
  runId?: string;
}

export interface AgentRunTrace {
  version: typeof TRACE_VERSION;
  assistant_text: string;
  thinking_text: string;
  steps: ConversationStep[];
  deltas: AgentRunTraceEvent[];
  file_edits: AgentRunTraceFileEdit[];
  tool_call_count: number;
  /** Cursor SDK retry diagnostics (live runs only). */
  sdk_attempts?: SdkAttemptTraceMeta[];
  sdk_session_gap_ms?: number;
}

export function buildRunInput(params: {
  agentId: string;
  backend: "mock" | "cursor-sdk";
  systemPrompt: string;
  userMessage: string;
  cwd: string;
  benchmarksRoot?: string;
  briefingPath?: string;
  briefingHash?: string;
  preflightGeneratedAt?: string;
  modelId?: string;
  extraInstruction?: string;
  dryRun: boolean;
  mock: boolean;
}): AgentRunInputRecord {
  return {
    version: TRACE_VERSION,
    agent_id: params.agentId,
    backend: params.backend,
    model_id: params.modelId,
    cwd: params.cwd,
    benchmarks_root: params.benchmarksRoot,
    briefing_path: params.briefingPath,
    briefing_hash: params.briefingHash,
    preflight_generated_at: params.preflightGeneratedAt,
    dry_run: params.dryRun,
    mock: params.mock,
    system_prompt: params.systemPrompt,
    user_message: params.userMessage,
    extra_instruction: params.extraInstruction,
  };
}

export function createTraceCollector(): {
  onStep: (args: { step: ConversationStep }) => void;
  onDelta: (args: { update: InteractionUpdate }) => void;
  finalize: (assistantText: string) => AgentRunTrace;
} {
  const steps: ConversationStep[] = [];
  const deltas: AgentRunTraceEvent[] = [];
  let seq = 0;
  const thinkingParts: string[] = [];

  return {
    onStep: ({ step }) => {
      steps.push(structuredClone(step) as ConversationStep);
      if (step.type === "thinkingMessage" && step.message?.text) {
        thinkingParts.push(step.message.text);
      }
    },
    onDelta: ({ update }) => {
      const type = update.type;
      if (type === "thinking-delta" && "text" in update) {
        thinkingParts.push(String((update as { text: string }).text));
      }
      const row: AgentRunTraceEvent = {
        seq: seq++,
        at: new Date().toISOString(),
        kind: "delta",
        type,
        payload: compactDeltaPayload(update),
      };
      deltas.push(row);
      if (deltas.length > MAX_DELTAS) deltas.shift();
    },
    finalize: (assistantText: string) => {
      const file_edits = extractFileEdits(steps);
      const tool_call_count = steps.filter((s) => s.type === "toolCall").length;
      return {
        version: TRACE_VERSION,
        assistant_text: assistantText,
        thinking_text: thinkingParts.join(""),
        steps,
        deltas,
        file_edits,
        tool_call_count,
      };
    },
  };
}

function compactDeltaPayload(update: InteractionUpdate): unknown {
  const u = update as Record<string, unknown>;
  switch (update.type) {
    case "text-delta":
      return { text: u.text };
    case "thinking-delta":
      return { text: u.text };
    case "tool-call-started":
    case "tool-call-completed":
      return { tool: u.tool, callId: u.callId, args: u.args, result: u.result };
    default:
      return u;
  }
}

export function extractFileEdits(steps: ConversationStep[]): AgentRunTraceFileEdit[] {
  const out: AgentRunTraceFileEdit[] = [];
  for (const step of steps) {
    if (step.type !== "toolCall") continue;
    const msg = step.message as {
      type: string;
      args?: { path?: string; command?: string };
      result?: { status: string; value?: { linesAdded?: number; linesRemoved?: number } };
    };
    const tool = msg.type;
    const path = msg.args?.path ?? (tool === "shell" ? msg.args?.command : undefined);
    if (!path && tool !== "shell") continue;
    const ok = msg.result?.status === "success";
    const value = msg.result?.status === "success" ? msg.result.value : undefined;
    out.push({
      path: path ?? "(shell)",
      tool,
      ok,
      lines_added: value?.linesAdded,
      lines_removed: value?.linesRemoved,
    });
  }
  return out;
}

export function buildMockTrace(params: {
  definitionId: string;
  assistantText: string;
  userMessage: string;
  cwd: string;
}): AgentRunTrace {
  const steps: ConversationStep[] = [
    {
      type: "thinkingMessage",
      message: { text: `[mock] Planning ${params.definitionId} pass against briefing…` },
    } as ConversationStep,
    {
      type: "toolCall",
      message: {
        type: "read",
        args: { path: `${params.cwd}/data/latest/agent-briefing.json` },
        result: { status: "success", value: { content: "(mock read)" } },
      },
    } as ConversationStep,
    {
      type: "toolCall",
      message: {
        type: "edit",
        args: { path: `docs/agents/${params.definitionId}-digest.md` },
        result: {
          status: "success",
          value: { linesAdded: 12, linesRemoved: 0, diffString: "+ mock digest" },
        },
      },
    } as ConversationStep,
    {
      type: "assistantMessage",
      message: { text: params.assistantText },
    } as ConversationStep,
  ];

  return {
    version: TRACE_VERSION,
    assistant_text: params.assistantText,
    thinking_text: `[mock] Planning ${params.definitionId} pass against briefing…`,
    steps,
    deltas: [
      {
        seq: 0,
        at: new Date().toISOString(),
        kind: "delta",
        type: "thinking-delta",
        payload: { text: "[mock thinking]" },
      },
      {
        seq: 1,
        at: new Date().toISOString(),
        kind: "delta",
        type: "text-delta",
        payload: { text: params.assistantText.slice(0, 200) },
      },
    ],
    file_edits: extractFileEdits(steps),
    tool_call_count: 2,
  };
}
