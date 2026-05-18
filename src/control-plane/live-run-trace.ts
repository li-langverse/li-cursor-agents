import { writeFileSync } from "node:fs";
import type { ConversationStep } from "@cursor/sdk";
import type { InteractionUpdate } from "@cursor/sdk";
import {
  createTraceCollector,
  type AgentRunInputRecord,
  type AgentRunTrace,
} from "../agent-run-trace.js";
import { slimTraceForList } from "./activity-summary.js";
import { patchActiveRun } from "./runtime.js";

function liveTraceFlushMs(): number {
  const n = Number(process.env.LI_LIVE_TRACE_FLUSH_MS ?? 1_500);
  return Number.isFinite(n) && n >= 200 ? Math.min(10_000, n) : 1_500;
}

function scheduleWorkerHeartbeat(): void {
  void import("../worker/heartbeat-loop.js")
    .then((m) => m.flushWorkerHeartbeat())
    .catch(() => {});
}

/** Attach prompt + output path to in-process active run and push to worker_status on next heartbeat. */
export function publishRunInputLive(
  runId: string,
  runInput: AgentRunInputRecord,
  outputPath: string,
): void {
  patchActiveRun(runId, { run_input: runInput, output_path: outputPath });
  writePartialSidecar(outputPath, { runInput, trace: undefined });
  scheduleWorkerHeartbeat();
}

export function publishLiveTraceSnapshot(
  runId: string,
  outputPath: string,
  trace: AgentRunTrace,
  runInput?: AgentRunInputRecord,
): void {
  const slim = slimTraceForList(trace) ?? trace;
  patchActiveRun(runId, {
    run_trace: slim,
    output_path: outputPath,
    ...(runInput ? { run_input: runInput } : {}),
  });
  writePartialSidecar(outputPath, { runInput, trace: slim });
  scheduleWorkerHeartbeat();
}

function writePartialSidecar(
  outputPath: string,
  payload: { runInput?: AgentRunInputRecord; trace?: AgentRunTrace },
): void {
  if (!outputPath.endsWith(".md")) return;
  const jsonPath = outputPath.replace(/\.md$/, ".json");
  try {
    const body: Record<string, unknown> = {
      agentId: payload.runInput?.agent_id,
      backend: payload.runInput?.backend,
      status: "running",
      outputPath,
      runInput: payload.runInput,
      trace: payload.trace,
    };
    writeFileSync(jsonPath, `${JSON.stringify(body, null, 2)}\n`, "utf8");
  } catch {
    /* optional */
  }
}

/** SDK/mock collector that flushes partial trace to active_runs + disk for live dashboard reads. */
export function createLiveTraceCollector(
  runId: string,
  outputPath: string,
  runInput?: AgentRunInputRecord,
): {
  onStep: (args: { step: ConversationStep }) => void;
  onDelta: (args: { update: InteractionUpdate }) => void;
  finalize: (assistantText: string) => AgentRunTrace;
} {
  const inner = createTraceCollector();
  const assistantChunks: string[] = [];
  let lastFlush = 0;

  const flush = () => {
    const trace = inner.peek(assistantChunks.join(""));
    publishLiveTraceSnapshot(runId, outputPath, trace, runInput);
    // #region agent log
    fetch("http://127.0.0.1:7746/ingest/994bad2f-5ad5-4c20-9cd2-19e851fc1d5c", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "898ce1" },
      body: JSON.stringify({
        sessionId: "898ce1",
        hypothesisId: "D",
        location: "live-run-trace.ts:flush",
        message: "live trace flush",
        data: {
          runId,
          tool_calls: trace.tool_call_count,
          thinking_len: trace.thinking_text.length,
          assistant_len: trace.assistant_text.length,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  };

  const maybeFlush = () => {
    const now = Date.now();
    if (now - lastFlush >= liveTraceFlushMs()) {
      lastFlush = now;
      flush();
    }
  };

  return {
    onStep: ({ step }) => {
      inner.onStep({ step });
      maybeFlush();
    },
    onDelta: ({ update }) => {
      inner.onDelta({ update });
      if (update.type === "text-delta" && "text" in update) {
        assistantChunks.push(String((update as { text: string }).text));
      }
      maybeFlush();
    },
    finalize: (assistantText: string) => {
      flush();
      return inner.finalize(assistantText);
    },
  };
}
