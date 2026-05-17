import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { getAgent } from "../agents/registry.js";
import type { AgentDefinition } from "../types.js";
import type { AgentRunResult } from "../types.js";
import { auditRunCompletion, type AgentRunCompletion } from "./run-completion.js";

export function finalizeAgentRun(
  result: AgentRunResult,
  options?: { rolloutPrUrls?: string[]; definition?: AgentDefinition | null },
): AgentRunResult {
  const definition = options?.definition ?? getAgent(result.agentId);
  const outputText =
    result.outputText ??
    (result.outputPath && existsSync(result.outputPath) ? readFileSync(result.outputPath, "utf8") : "");

  const completion: AgentRunCompletion = auditRunCompletion({
    agentId: result.agentId,
    definition: definition ?? undefined,
    outputText: String(outputText),
    backend: result.backend,
    mock: result.backend === "mock",
    rolloutPrUrls: options?.rolloutPrUrls,
  });

  let status = result.status;
  if (status === "finished" && completion.premature) {
    status = "incomplete";
  }

  const finalized: AgentRunResult = {
    ...result,
    status,
    completion,
    outputText: result.outputText ?? String(outputText),
  };

  const jsonPath = result.outputPath.replace(/\.md$/, ".json");
  if (existsSync(jsonPath) || result.outputPath.endsWith(".md")) {
    try {
      const prior = existsSync(jsonPath)
        ? (JSON.parse(readFileSync(jsonPath, "utf8")) as Record<string, unknown>)
        : {};
      writeFileSync(
        jsonPath,
        JSON.stringify({ ...prior, ...finalized, completion }, null, 2) + "\n",
        "utf8",
      );
    } catch {
      writeFileSync(jsonPath, JSON.stringify(finalized, null, 2) + "\n", "utf8");
    }
  }

  return finalized;
}
