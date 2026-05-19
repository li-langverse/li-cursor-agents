import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildMockDeliverable } from "../agent-output-format.js";
import { buildMockTrace } from "../agent-run-trace.js";
import {
  createLiveTraceCollector,
  publishLiveTraceSnapshot,
} from "../control-plane/live-run-trace.js";
import { allocateRunId, runOutputPath } from "../control-plane/run-paths.js";
import type { AgentBackend, AgentDefinition, AgentRunOptions, AgentRunResult } from "../types.js";

/**
 * CI-safe mock: no CURSOR_API_KEY, no LLM calls.
 * Writes structured markdown + JSON from preflight briefing.
 */
export class MockBackend implements AgentBackend {
  readonly name = "mock" as const;

  async run(
    definition: AgentDefinition,
    _systemPrompt: string,
    userMessage: string,
    options: AgentRunOptions,
  ): Promise<AgentRunResult> {
    const start = Date.now();
    const outputPath = runOutputPath(
      definition.id,
      options.runId ?? allocateRunId(definition.id),
      true,
    );
    const delayMs = Number(process.env.LI_MOCK_RUN_DELAY_MS ?? 0);
    const liveStream =
      Boolean(options.runId) &&
      (process.env.LI_MOCK_LIVE_STREAM === "1" || process.env.LI_MOCK_LIVE_STREAM === "true");
    const streamCollector = liveStream
      ? createLiveTraceCollector(options.runId!, outputPath)
      : null;

    if (streamCollector) {
      const marker = `mock-stream-${definition.id}`;
      streamCollector.onDelta({
        update: { type: "text-delta", text: `start-${marker}-` } as {
          type: "text-delta";
          text: string;
        },
      });
      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, Math.min(delayMs, 500)));
      }
      streamCollector.onDelta({
        update: { type: "text-delta", text: "mid-" } as { type: "text-delta"; text: string },
      });
    } else if (delayMs > 0 && options.runId) {
      const staged = buildMockTrace({
        definitionId: definition.id,
        assistantText: "[mock] starting…",
        userMessage,
        cwd: options.cwd ?? "",
      });
      publishLiveTraceSnapshot(options.runId, outputPath, staged);
      await new Promise((r) => setTimeout(r, Math.min(delayMs, 200)));
    } else if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }

    if (options.dryRun) {
      const dryText = `[dry-run] mock backend would run ${definition.id}`;
      const trace = streamCollector
        ? streamCollector.finalize(dryText)
        : buildMockTrace({
            definitionId: definition.id,
            assistantText: dryText,
            userMessage,
            cwd: options.cwd,
          });
      return {
        agentId: definition.id,
        backend: "mock",
        status: "dry-run",
        durationMs: Date.now() - start,
        outputPath,
        outputText: dryText,
        trace,
      };
    }

    const briefing = extractBriefing(userMessage);
    const deliverable = buildMockDeliverable(definition, briefing, userMessage);

    if (streamCollector) {
      streamCollector.onDelta({
        update: { type: "text-delta", text: "done" } as { type: "text-delta"; text: string },
      });
      const trace = streamCollector.finalize(deliverable);
      return {
        agentId: definition.id,
        backend: "mock",
        status: "finished",
        durationMs: Date.now() - start,
        outputText: deliverable,
        outputPath,
        trace,
      };
    }

    if (definition.guaranteedPush && options.cwd) {
      const docsDir = join(options.cwd, "docs");
      mkdirSync(docsDir, { recursive: true });
      writeFileSync(
        join(docsDir, `.mock-${definition.id}-touch.md`),
        `# mock ${definition.id}\n`,
        "utf8",
      );
    }

    return {
      agentId: definition.id,
      backend: "mock",
      status: "finished",
      durationMs: Date.now() - start,
      outputText: deliverable,
      outputPath,
      trace: buildMockTrace({
        definitionId: definition.id,
        assistantText: deliverable,
        userMessage,
        cwd: options.cwd,
      }),
    };
  }
}

function extractBriefing(userMessage: string): Record<string, unknown> | null {
  const m = userMessage.match(/```json\n([\s\S]*?)\n```/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}
