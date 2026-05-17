import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Agent } from "@cursor/sdk";
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
      throw new Error(
        "Cursor API key required (set CURSOR_API_KEY, CURSOR_SDK_KEY, or CURSOR_SDK; use --mock for CI)",
      );
    }

    const modelId = options.modelId ?? resolveCursorModelId();
    const fullPrompt = `${systemPrompt}\n\n---\n\n${userMessage}`;

    const agent = await Agent.create({
      apiKey,
      model: { id: modelId },
      local: { cwd: options.cwd },
    });

    try {
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

      writeFileSync(outputPath, text, "utf8");

      return {
        agentId: definition.id,
        backend: "cursor-sdk",
        status: result.status === "finished" ? "finished" : "error",
        durationMs: Date.now() - start,
        outputText: text,
        outputPath,
        error: result.status !== "finished" ? `run status: ${result.status}` : undefined,
        trace,
      };
    } finally {
      agent.close();
    }
  }
}
