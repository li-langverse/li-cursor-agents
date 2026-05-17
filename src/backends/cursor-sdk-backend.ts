import { join } from "node:path";
import { errorDetailFromUnknown } from "../agent-output-format.js";
import { createTraceCollector } from "../agent-run-trace.js";
import { runsDir } from "../control-plane/paths.js";
import { resolveCursorApiKey, resolveCursorModelId } from "../env.js";
import type { AgentBackend, AgentDefinition, AgentRunOptions, AgentRunResult } from "../types.js";

export class CursorSdkBackend implements AgentBackend {
  readonly name = "cursor-sdk" as const;

  async run(
    definition: AgentDefinition,
    systemPrompt: string,
    userMessage: string,
    options: AgentRunOptions,
  ): Promise<AgentRunResult> {
    const start = Date.now();
    const outputPath = join(runsDir(), `${definition.id}-${Date.now()}.md`);

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

    const modelId = options.modelId ?? resolveCursorModelId();
    const fullPrompt = `${systemPrompt}\n\n---\n\n${userMessage}`;

    let agent: Awaited<ReturnType<typeof import("@cursor/sdk").Agent.create>> | null = null;
    try {
      const { Agent } = await import("@cursor/sdk");
      agent = await Agent.create({
        apiKey,
        model: { id: modelId },
        local: { cwd: options.cwd },
      });

      const chunks: string[] = [];
      const collector = createTraceCollector();
      const run = await agent.send(fullPrompt, {
        onStep: async ({ step }) => collector.onStep({ step }),
        onDelta: async ({ update }) => {
          collector.onDelta({ update });
          if (update.type === "text-delta") chunks.push(update.text);
        },
      });

      const result = await run.wait();
      const text =
        result.result ?? (chunks.join("") || `(no text; status=${result.status})`);
      const trace = collector.finalize(text);
      const ok = result.status === "finished";

      return {
        agentId: definition.id,
        backend: "cursor-sdk",
        status: ok ? "finished" : "error",
        durationMs: Date.now() - start,
        outputText: text,
        outputPath,
        error: ok ? undefined : `SDK run status: ${result.status}`,
        errorDetail: ok ? undefined : errorDetailFromUnknown(new Error(`SDK run status: ${result.status}`)),
        trace,
      };
    } catch (err) {
      return failResult(definition.id, outputPath, start, err);
    } finally {
      agent?.close();
    }
  }
}

function failResult(
  agentId: string,
  outputPath: string,
  start: number,
  err: unknown,
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
  };
}
