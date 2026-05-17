import { writeFileSync } from "node:fs";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getAgent } from "./agents/registry.js";
import { CursorSdkBackend } from "./backends/cursor-sdk-backend.js";
import { MockBackend } from "./backends/mock-backend.js";
import { buildMockTrace, buildRunInput } from "./agent-run-trace.js";
import { resolveCursorApiKey } from "./env.js";
import { hashBriefing } from "./control-plane/briefing-hash.js";
import { finalizeAgentRun } from "./control-plane/finalize-run.js";
import { persistAgentRun } from "./db/persist.js";
import { runsDir } from "./control-plane/paths.js";
import {
  buildAgentKitMaintainerInstruction,
  refreshAgentKitAudit,
} from "./preflight/agent-kit-sync.js";
import { buildUserMessage, runPreflight, resolveBenchmarksRoot } from "./preflight.js";
import {
  formatRolloutDigest,
  rolloutAgentKitPrs,
  rolloutNeedsLlmFollowUp,
} from "./repo-workflow/agent-kit-rollout.js";
import type { AgentRunOptions, AgentRunResult } from "./types.js";

/** li-cursor-agents package root (where prompts/ lives). */
export function agentsPackageRoot(): string {
  const env = process.env.LI_CURSOR_AGENTS_ROOT;
  if (env && existsSync(join(env, "package.json"))) return env;
  const here = dirname(fileURLToPath(import.meta.url));
  const root = join(here, "..");
  if (existsSync(join(root, "prompts"))) return root;
  return process.cwd();
}

export function loadPrompt(repoRoot: string, promptFile: string): string {
  const p = join(repoRoot, "prompts", promptFile);
  if (!existsSync(p)) {
    throw new Error(`Missing prompt: ${p} (sync from benchmarks/.cursor/automations/)`);
  }
  return readFileSync(p, "utf8");
}

/** True only for `--mock`, `CURSOR_MOCK=1` (tests/CI), or CI without an API key. */
export function shouldUseMock(explicitMock: boolean): boolean {
  if (explicitMock) return true;
  if (process.env.CURSOR_MOCK === "1" || process.env.CURSOR_MOCK === "true") return true;
  if (process.env.CI === "true" && !resolveCursorApiKey()) return true;
  return false;
}

export function agentBackendLabel(mock?: boolean): "mock" | "cursor-sdk" {
  return shouldUseMock(mock ?? false) ? "mock" : "cursor-sdk";
}

export function assertRealBackendReady(explicitMock?: boolean): void {
  if (shouldUseMock(explicitMock ?? false)) return;
  if (resolveCursorApiKey()) return;
  throw new Error(
    "CURSOR_API_KEY is required for real agent runs. Add it to li-cursor-agents/.env (see .env.example). Tests use CURSOR_MOCK=1; local dry-run: --mock.",
  );
}

export async function runAgent(options: AgentRunOptions): Promise<AgentRunResult> {
  assertRealBackendReady(options.mock);
  const definition = getAgent(String(options.agentId));
  if (!definition) {
    throw new Error(`Unknown agent: ${options.agentId} (see npm run agents:list)`);
  }

  const packageRoot = agentsPackageRoot();
  const benchmarksRoot = resolveBenchmarksRoot(options.benchmarksRoot);
  const preflight = runPreflight(benchmarksRoot, true);
  let systemPrompt = loadPrompt(packageRoot, definition.promptFile);
  if (definition.repoWorkflow) {
    systemPrompt += `\n\n---\n\n${loadPrompt(packageRoot, "repo-workflow-tools.md")}`;
  }
  const workCwd = options.cwd || packageRoot;

  const mock = shouldUseMock(options.mock);
  let extra = options.extraInstruction;

  if (definition.id === "agent_kit_maintainer" && benchmarksRoot && preflight.briefing) {
    const rollout = rolloutAgentKitPrs(benchmarksRoot, preflight.briefing, {
      dryRun: mock || options.dryRun,
    });
    refreshAgentKitAudit(benchmarksRoot);
    extra = [buildAgentKitMaintainerInstruction([], preflight.briefing, rollout), extra]
      .filter(Boolean)
      .join("\n\n");

    const forceLlm = process.env.LI_AGENT_KIT_FORCE_LLM === "1";
    if (!forceLlm && !rolloutNeedsLlmFollowUp(rollout)) {
      const start = Date.now();
      const outputPath = join(runsDir(), `${definition.id}-${Date.now()}.md`);
      const text = formatRolloutDigest(rollout);
      writeFileSync(outputPath, text, "utf8");
      const prUrls = rollout.map((r) => r.pr_url).filter((u): u is string => Boolean(u));
      const base = {
        agentId: definition.id,
        backend: (mock ? "mock" : "cursor-sdk") as "mock" | "cursor-sdk",
        status: "finished" as const,
        durationMs: Date.now() - start,
        outputText: text,
        outputPath,
      };
      writeFileSync(outputPath.replace(/\.md$/, ".json"), JSON.stringify(base, null, 2) + "\n", "utf8");
      const kitInput = buildRunInput({
        agentId: definition.id,
        backend: mock ? "mock" : "cursor-sdk",
        systemPrompt,
        userMessage: extra ?? "(agent-kit rollout only — no LLM)",
        cwd: workCwd,
        benchmarksRoot,
        briefingPath: preflight.briefing_path,
        briefingHash:
          preflight.briefing && typeof preflight.briefing === "object"
            ? hashBriefing(preflight.briefing)
            : undefined,
        preflightGeneratedAt: preflight.generated_at,
        dryRun: options.dryRun,
        mock,
      });
      const finalized = finalizeAgentRun(
        {
          ...base,
          runInput: kitInput,
          trace: buildMockTrace({
            definitionId: definition.id,
            assistantText: text,
            userMessage: kitInput.user_message,
            cwd: workCwd,
          }),
        },
        { definition, rolloutPrUrls: prUrls },
      );
      await persistAgentRun({ run: finalized, rolloutRows: rollout });
      return finalized;
    }
  }

  const userMessage = buildUserMessage(definition.id, preflight, extra);
  const backend = mock ? new MockBackend() : new CursorSdkBackend();
  const briefingHash =
    preflight.briefing && typeof preflight.briefing === "object"
      ? hashBriefing(preflight.briefing)
      : undefined;

  const runInput = buildRunInput({
    agentId: definition.id,
    backend: mock ? "mock" : "cursor-sdk",
    systemPrompt,
    userMessage,
    cwd: workCwd,
    benchmarksRoot,
    briefingPath: preflight.briefing_path,
    briefingHash,
    preflightGeneratedAt: preflight.generated_at,
    modelId: options.modelId,
    extraInstruction: extra,
    dryRun: options.dryRun,
    mock,
  });

  const result = await backend.run(definition, systemPrompt, userMessage, { ...options, cwd: workCwd });
  const finalized = finalizeAgentRun(
    { ...result, runInput: result.runInput ?? runInput },
    { definition },
  );
  await persistAgentRun({ run: finalized });
  return finalized;
}
