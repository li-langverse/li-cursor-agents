import { join } from "node:path";
import type { RunResult } from "@cursor/sdk";
import { errorDetailFromUnknown } from "../agent-output-format.js";
import { createTraceCollector, type AgentRunTrace } from "../agent-run-trace.js";
import { createLiveTraceCollector } from "../control-plane/live-run-trace.js";
import { allocateRunId, runOutputPath } from "../control-plane/run-paths.js";
import {
  resolveCursorApiKey,
  resolveCursorModelId,
  resolveCursorSdkFallbackModelId,
} from "../env.js";
import { buildControlPlaneDbMcpServers } from "../mcp/mcp-config.js";
import type { AgentBackend, AgentDefinition, AgentRunOptions, AgentRunResult } from "../types.js";
import { sdkSessionGapMs, withGlobalSdkSessionLock } from "./sdk-session-lock.js";

export interface SdkAttemptMeta {
  attempt: number;
  force: boolean;
  modelId: string;
  durationMs: number;
  toolCalls: number;
  status: string;
  runId?: string;
}

export function sdkMaxAttempts(): number {
  const n = Number(process.env.LI_SDK_MAX_ATTEMPTS ?? 3);
  return Number.isFinite(n) && n >= 1 ? Math.min(5, Math.floor(n)) : 3;
}

export function sdkRetryBackoffMs(attempt: number): number {
  const base = Number(process.env.LI_SDK_RETRY_BACKOFF_MS ?? 4_000);
  const b = Number.isFinite(base) && base >= 0 ? base : 4_000;
  return b * attempt;
}

export function shouldRetrySdkRun(
  result: RunResult,
  trace: AgentRunTrace,
  durationMs: number,
): boolean {
  if (result.status === "finished") return false;
  const instant = durationMs < 12_000 && (trace.tool_call_count ?? 0) === 0;
  return instant && (result.status === "error" || result.status === "cancelled");
}

export function formatSdkRunError(
  result: RunResult,
  meta: SdkAttemptMeta,
  conversationSnippet?: string,
): string {
  const parts = [
    `SDK run status: ${result.status}`,
    meta.runId ? `run_id=${meta.runId}` : "",
    `model=${meta.modelId}`,
    `attempt=${meta.attempt}`,
    meta.force ? "force=true" : "",
    `tools=${meta.toolCalls}`,
    `duration_ms=${meta.durationMs}`,
  ].filter(Boolean);
  const tail = conversationSnippet?.trim();
  if (tail) parts.push(`conversation_tail=${tail.slice(0, 400)}`);
  if (result.result?.trim()) parts.push(`result=${result.result.trim().slice(0, 200)}`);
  return parts.join("; ");
}

export class CursorSdkBackend implements AgentBackend {
  readonly name = "cursor-sdk" as const;

  async run(
    definition: AgentDefinition,
    systemPrompt: string,
    userMessage: string,
    options: AgentRunOptions,
  ): Promise<AgentRunResult> {
    const start = Date.now();
    const outputPath = runOutputPath(
      definition.id,
      options.runId ?? allocateRunId(definition.id),
      false,
    );

    if (options.dryRun) {
      const trace = createTraceCollector().finalize(
        `[dry-run] would call @cursor/sdk for ${definition.id}`,
      );
      return {
        agentId: definition.id,
        backend: "cursor-sdk",
        status: "dry-run",
        durationMs: Date.now() - start,
        outputPath,
        outputText: trace.assistant_text,
        trace,
      };
    }

    const apiKey = options.apiKey ?? resolveCursorApiKey();
    if (!apiKey) {
      const err = new Error(
        "Cursor API key required (set CURSOR_API_KEY, CURSOR_SDK_KEY, or CURSOR_SDK; use --mock for CI)",
      );
      return failResult(definition.id, outputPath, start, err);
    }

    const primaryModelId = options.modelId ?? resolveCursorModelId();
    const fallbackModelId = resolveCursorSdkFallbackModelId();
    const fullPrompt = `${systemPrompt}\n\n---\n\n${userMessage}`;
    const maxAttempts = sdkMaxAttempts();
    const attempts: SdkAttemptMeta[] = [];
    let lastTrace = createTraceCollector().finalize("(no attempts)");
    let lastResult: RunResult | undefined;
    let lastErrorMessage = "SDK run failed";

    return withGlobalSdkSessionLock(async () => {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (attempt > 1) {
          const backoff = sdkRetryBackoffMs(attempt - 1);
          if (backoff > 0) await sleep(backoff);
        }

        const force = attempt > 1;
        const modelId = modelForAttempt(attempt, primaryModelId, fallbackModelId, attempts);
        let agent: Awaited<ReturnType<typeof import("@cursor/sdk").Agent.create>> | null = null;
        const attemptStart = Date.now();
        try {
          const { Agent } = await import("@cursor/sdk");
          const mcpServers = buildControlPlaneDbMcpServers();
          agent = await Agent.create({
            apiKey,
            model: { id: modelId },
            local: { cwd: options.cwd },
            ...(mcpServers ? { mcpServers } : {}),
          });

          const chunks: string[] = [];
          const collector = options.runId
            ? createLiveTraceCollector(options.runId, outputPath)
            : createTraceCollector();
          const run = await agent.send(fullPrompt, {
            local: force ? { force: true } : undefined,
            onStep: async ({ step }) => collector.onStep({ step }),
            onDelta: async ({ update }) => {
              collector.onDelta({ update });
              if (update.type === "text-delta") chunks.push(update.text);
            },
          });

          const result = await run.wait();
          lastResult = result;
          const text =
            result.result ?? (chunks.join("") || `(no text; status=${result.status})`);
          const trace = collector.finalize(text);
          lastTrace = trace;
          const durationMs = Date.now() - attemptStart;
          const meta: SdkAttemptMeta = {
            attempt,
            force,
            modelId,
            durationMs,
            toolCalls: trace.tool_call_count ?? 0,
            status: result.status,
            runId: result.id,
          };
          attempts.push(meta);

          if (result.status === "finished") {
            return {
              agentId: definition.id,
              backend: "cursor-sdk",
              status: "finished",
              durationMs: Date.now() - start,
              outputText: text,
              outputPath,
              trace: attachSdkMeta(trace, attempts),
            };
          }

          let conversationSnippet: string | undefined;
          if (shouldRetrySdkRun(result, trace, durationMs) && attempt < maxAttempts) {
            conversationSnippet = await safeConversationTail(run);
            lastErrorMessage = formatSdkRunError(result, meta, conversationSnippet);
            continue;
          }

          conversationSnippet = await safeConversationTail(run);
          lastErrorMessage = formatSdkRunError(result, meta, conversationSnippet);
          return errorRunResult(
            definition.id,
            outputPath,
            start,
            text,
            lastErrorMessage,
            attachSdkMeta(trace, attempts),
            result,
          );
        } catch (err) {
          const durationMs = Date.now() - attemptStart;
          attempts.push({
            attempt,
            force,
            modelId,
            durationMs,
            toolCalls: lastTrace.tool_call_count ?? 0,
            status: "exception",
          });
          const detail = errorDetailFromUnknown(err);
          lastErrorMessage = detail.message;
          if (attempt < maxAttempts && durationMs < 12_000) continue;
          return failResult(
            definition.id,
            outputPath,
            start,
            err,
            attachSdkMeta(lastTrace, attempts),
          );
        } finally {
          try {
            agent?.close();
          } catch {
            /* ignore close errors */
          }
        }
      }

      const text =
        lastResult?.result ??
        lastTrace.assistant_text ??
        `(no text; status=${lastResult?.status ?? "error"})`;
      return errorRunResult(
        definition.id,
        outputPath,
        start,
        text,
        lastErrorMessage,
        attachSdkMeta(lastTrace, attempts),
        lastResult,
      );
    });
  }
}

function attachSdkMeta(trace: AgentRunTrace, attempts: SdkAttemptMeta[]): AgentRunTrace {
  return {
    ...trace,
    sdk_attempts: attempts,
    sdk_session_gap_ms: sdkSessionGapMs(),
  };
}

async function safeConversationTail(
  run: { conversation(): Promise<Array<{ type?: string; message?: { text?: string } }>> },
): Promise<string | undefined> {
  try {
    const turns = await run.conversation();
    const texts = turns
      .filter((t) => t.type === "assistantMessage" || t.type === "assistant")
      .map((t) => {
        const m = t.message as { text?: string } | undefined;
        return m?.text ?? "";
      })
      .filter(Boolean);
    return texts.slice(-2).join("\n").slice(0, 500) || undefined;
  } catch {
    return undefined;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** After instant fail on primary model, switch to fallback (`default` / Auto). */
function modelForAttempt(
  attempt: number,
  primary: string,
  fallback: string,
  prior: SdkAttemptMeta[],
): string {
  if (attempt === 1) return primary;
  const last = prior[prior.length - 1];
  const instantFail =
    last &&
    last.toolCalls === 0 &&
    last.durationMs < 12_000 &&
    (last.status === "error" || last.status === "exception");
  if (instantFail && primary !== fallback) return fallback;
  return prior.some((p) => p.modelId === fallback) ? fallback : primary;
}

function errorRunResult(
  agentId: string,
  outputPath: string,
  start: number,
  outputText: string,
  message: string,
  trace: AgentRunTrace,
  result?: RunResult,
): AgentRunResult {
  const detail = errorDetailFromUnknown(new Error(message));
  if (result) {
    detail.message = `${message} (run_id=${result.id})`;
  }
  return {
    agentId,
    backend: "cursor-sdk",
    status: "error",
    durationMs: Date.now() - start,
    outputText,
    outputPath,
    error: detail.message,
    errorDetail: detail,
    trace,
  };
}

function failResult(
  agentId: string,
  outputPath: string,
  start: number,
  err: unknown,
  trace?: AgentRunTrace,
): AgentRunResult {
  const detail = errorDetailFromUnknown(err);
  return {
    agentId,
    backend: "cursor-sdk",
    status: "error",
    durationMs: Date.now() - start,
    outputPath,
    outputText: "",
    error: detail.message,
    errorDetail: detail,
    trace,
  };
}
