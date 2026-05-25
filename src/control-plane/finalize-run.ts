import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { getAgent } from "../agents/registry.js";
import { buildFormattedOutput, errorDetailFromUnknown } from "../agent-output-format.js";
import { runIdFromOutputPath } from "../db/persist.js";
import type { AgentDefinition } from "../types.js";
import type { AgentRunResult, PreflightBundle } from "../types.js";
import { auditRunCompletion, type AgentRunCompletion } from "./run-completion.js";

function readOutputText(result: AgentRunResult): string {
  if (result.outputText) return result.outputText;
  if (result.outputPath && existsSync(result.outputPath)) {
    return readFileSync(result.outputPath, "utf8");
  }
  return result.trace?.assistant_text ?? "";
}

/** Strip wrapper if re-formatting; keep deliverable body only. */
function deliverableBody(text: string): string {
  const marker = "## Deliverable";
  const idx = text.indexOf(marker);
  if (idx === -1) return text.trim();
  let rest = text.slice(idx + marker.length).replace(/^\s*\n/, "");
  const errIdx = rest.search(/\n## Errors\n/);
  const footIdx = rest.search(/\n---\n_Formatted by li-cursor-agents/);
  const end = [errIdx, footIdx].filter((n) => n >= 0).sort((a, b) => a - b)[0];
  if (end !== undefined) rest = rest.slice(0, end);
  return rest.trim();
}

export function finalizeAgentRun(
  result: AgentRunResult,
  options?: {
    rolloutPrUrls?: string[];
    definition?: AgentDefinition | null;
    preflight?: PreflightBundle;
    extraEvidence?: string[];
  },
): AgentRunResult {
  const definition = options?.definition ?? getAgent(result.agentId);
  const rawText = readOutputText(result);
  const bodyForAudit = process.env.LI_SDK_MATRIX_MODE?.trim()
    ? rawText
    : deliverableBody(rawText) || rawText;

  const completion: AgentRunCompletion = auditRunCompletion({
    agentId: result.agentId,
    definition: definition ?? undefined,
    outputText: String(bodyForAudit),
    backend: result.backend,
    mock: result.backend === "mock",
    rolloutPrUrls: options?.rolloutPrUrls,
    trace: result.trace,
  });
  if (options?.extraEvidence?.length) {
    completion.evidence = [...new Set([...completion.evidence, ...options.extraEvidence])];
  }

  let status = result.status;
  if (status === "finished" && completion.premature) {
    status = "incomplete";
  }

  const errorDetail =
    result.errorDetail ??
    (result.error ? errorDetailFromUnknown(new Error(result.error)) : undefined);

  const runId = runIdFromOutputPath(result.outputPath);
  const formatted = definition
    ? buildFormattedOutput({
        definition,
        runId,
        status,
        backend: result.backend,
        durationMs: result.durationMs,
        body: deliverableBody(rawText) || result.trace?.assistant_text || rawText,
        error: result.error,
        errorDetail,
        briefing: options?.preflight?.briefing,
        preflight: options?.preflight,
        trace: result.trace,
        completion,
        mock: result.backend === "mock",
      })
    : rawText;

  const finalized: AgentRunResult = {
    ...result,
    status,
    completion,
    errorDetail,
    outputText: formatted,
    reason: result.reason,
    briefing_hash: result.briefing_hash,
    fingerprint: result.fingerprint,
    coordinator: result.coordinator,
  };

  if (result.outputPath.endsWith(".md")) {
    writeFileSync(result.outputPath, formatted, "utf8");
  }

  const jsonPath = result.outputPath.replace(/\.md$/, ".json");
  if (existsSync(jsonPath) || result.outputPath.endsWith(".md")) {
    try {
      const prior = existsSync(jsonPath)
        ? (JSON.parse(readFileSync(jsonPath, "utf8")) as Record<string, unknown>)
        : {};
      writeFileSync(
        jsonPath,
        JSON.stringify(
          {
            ...prior,
            ...finalized,
            completion,
            reason: finalized.reason ?? prior.reason,
            briefing_hash: finalized.briefing_hash ?? prior.briefing_hash,
            fingerprint: finalized.fingerprint ?? prior.fingerprint,
            coordinator: finalized.coordinator ?? prior.coordinator,
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );
    } catch {
      writeFileSync(jsonPath, JSON.stringify(finalized, null, 2) + "\n", "utf8");
    }
  }

  return finalized;
}

/** Merge supervisor/metadata fields into the run JSON sidecar (mock + production). */
export function writeRunSidecar(run: AgentRunResult): void {
  if (!run.outputPath?.endsWith(".md")) return;
  const jsonPath = run.outputPath.replace(/\.md$/, ".json");
  try {
    const prior = existsSync(jsonPath)
      ? (JSON.parse(readFileSync(jsonPath, "utf8")) as Record<string, unknown>)
      : {};
    writeFileSync(
      jsonPath,
      JSON.stringify(
        {
          ...prior,
          ...run,
          reason: run.reason ?? prior.reason,
          briefing_hash: run.briefing_hash ?? prior.briefing_hash,
          fingerprint: run.fingerprint ?? prior.fingerprint,
          coordinator: run.coordinator ?? prior.coordinator,
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
  } catch {
    writeFileSync(jsonPath, JSON.stringify(run, null, 2) + "\n", "utf8");
  }
}
