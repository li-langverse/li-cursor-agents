import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildMockDeliverable } from "../agent-output-format.js";
import { buildMockTrace } from "../agent-run-trace.js";
import { runsDir } from "../control-plane/paths.js";
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
    const delayMs = Number(process.env.LI_MOCK_RUN_DELAY_MS ?? 0);
    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
    const outputPath = join(runsDir(), `${definition.id}-${Date.now()}.md`);

    if (options.dryRun) {
      const dryText = `[dry-run] mock backend would run ${definition.id}`;
      return {
        agentId: definition.id,
        backend: "mock",
        status: "dry-run",
        durationMs: Date.now() - start,
        outputPath,
        outputText: dryText,
        trace: buildMockTrace({
          definitionId: definition.id,
          assistantText: dryText,
          userMessage,
          cwd: options.cwd,
        }),
      };
    }

    const briefing = extractBriefing(userMessage);
    const deliverable = buildMockDeliverable(definition, briefing, userMessage);

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
