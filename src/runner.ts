import { writeFileSync } from "node:fs";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getAgent } from "./agents/registry.js";
import { MockBackend } from "./backends/mock-backend.js";
import { buildMockTrace, buildRunInput } from "./agent-run-trace.js";
import { resolveCursorApiKey } from "./env.js";
import { hashBriefing } from "./control-plane/briefing-hash.js";
import { finalizeAgentRun } from "./control-plane/finalize-run.js";
import { applySwarmPostRunEffects } from "./handoffs/post-run.js";
import { persistAgentRun } from "./db/persist.js";
import { runsDir } from "./control-plane/paths.js";
import {
  buildAgentKitMaintainerInstruction,
  refreshAgentKitAudit,
} from "./preflight/agent-kit-sync.js";
import { buildSwarmPromptBlocks } from "./preflight/swarm-context.js";
import { buildUserMessage, runPreflight, resolveBenchmarksRoot } from "./preflight.js";
import { resolveCursorSdkMode, sdkModeSystemPrefix } from "./agents/sdk-mode.js";
import {
  formatRolloutDigest,
  rolloutAgentKitPrs,
  rolloutNeedsLlmFollowUp,
} from "./repo-workflow/agent-kit-rollout.js";
import {
  applyPostHookToRunResult,
  commitPushOpenPrAfterAgentRun,
} from "./repo-workflow/post-hook.js";
import {
  formatWorkspaceSweepReport,
  runWorkspaceDirtySweep,
} from "./repo-workflow/workspace-sweep.js";
import {
  agentUsesGuaranteedPush,
  beginRepoWorkflowSession,
} from "./repo-workflow/workspace-session.js";
import type { AgentRunOptions, AgentRunResult } from "./types.js";
import type { RepoWorkflowSession } from "./repo-workflow/workspace-session.js";

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
  let workCwd = options.cwd || packageRoot;
  const mock = shouldUseMock(options.mock);
  let workflowSession: RepoWorkflowSession | undefined;

  if (agentUsesGuaranteedPush(definition)) {
    workflowSession = beginRepoWorkflowSession({
      agentId: definition.id,
      repo: options.workflowRepo,
      dryRun: options.dryRun,
      skipPush: mock || options.dryRun || process.env.LI_REPO_WORKFLOW_SKIP_PUSH === "1",
    });
    if (workflowSession.ok) {
      workCwd = workflowSession.cloneDir;
    }
  }

  let extra = options.extraInstruction;

  if (definition.workspaceSweep) {
    const start = Date.now();
    const sweep = await runWorkspaceDirtySweep({
      benchmarksRoot,
      dryRun: mock || options.dryRun,
      skipPush: mock || options.dryRun || process.env.LI_REPO_WORKFLOW_SKIP_PUSH === "1",
      runTests: process.env.LI_WORKSPACE_SWEEP_RUN_TESTS === "1",
      restart: process.env.LI_WORKSPACE_SWEEP_RESTART !== "0",
      agentId: definition.id,
    });
    const text = formatWorkspaceSweepReport(sweep);
    const outputPath = join(runsDir(), `${definition.id}-${Date.now()}.md`);
    writeFileSync(outputPath, text, "utf8");
    const prUrls = sweep.sweeps.map((s) => s.push.pr_url).filter((u): u is string => Boolean(u));
    const forceLlm = process.env.LI_WORKSPACE_SWEEP_FORCE_LLM === "1";
    const needsFollowUp = sweep.sweeps.some((s) => !s.push.ok && !s.push.skipped) || sweep.dirty_found > sweep.sweeps.length;
    if (!forceLlm && !needsFollowUp) {
      const base = {
        agentId: definition.id,
        backend: (mock ? "mock" : "cursor-sdk") as "mock" | "cursor-sdk",
        status: "finished" as const,
        durationMs: Date.now() - start,
        outputText: text,
        outputPath,
      };
      const sweepInput = buildRunInput({
        agentId: definition.id,
        backend: mock ? "mock" : "cursor-sdk",
        systemPrompt,
        userMessage: text,
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
          runInput: sweepInput,
          trace: buildMockTrace({
            definitionId: definition.id,
            assistantText: text,
            userMessage: sweepInput.user_message,
            cwd: workCwd,
          }),
        },
        { definition, rolloutPrUrls: prUrls, preflight, extraEvidence: ["workspace_sweep"] },
      );
      await persistAgentRun({ run: finalized });
      return finalized;
    }
    extra = [text, extra].filter(Boolean).join("\n\n");
  }

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
        { definition, rolloutPrUrls: prUrls, preflight },
      );
      await persistAgentRun({ run: finalized, rolloutRows: rollout });
      return finalized;
    }
  }

  const swarmBlocks = await buildSwarmPromptBlocks(
    definition.id,
    preflight.briefing ?? preflight,
  );
  const userMessage = buildUserMessage(definition.id, preflight, extra, swarmBlocks);
  const backend = mock
    ? new MockBackend()
    : new (await import("./backends/cursor-sdk-backend.js")).CursorSdkBackend();
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

  let result: AgentRunResult;
  try {
    result = await backend.run(definition, systemPrompt, userMessage, { ...options, cwd: workCwd });
  } catch (err) {
    const outputPath = join(runsDir(), `${definition.id}-${Date.now()}.md`);
    result = {
      agentId: definition.id,
      backend: mock ? "mock" : "cursor-sdk",
      status: "error",
      durationMs: 0,
      outputPath,
      outputText: "",
      error: err instanceof Error ? err.message : String(err),
      errorDetail:
        err instanceof Error
          ? { name: err.name, message: err.message, stack: err.stack }
          : { message: String(err) },
      runInput,
    };
  }
  let rolloutPrUrls: string[] | undefined;
  const extraEvidence: string[] = [];
  if (
    workflowSession?.ok &&
    agentUsesGuaranteedPush(definition) &&
    result.status !== "cancelled"
  ) {
    const push = commitPushOpenPrAfterAgentRun(workflowSession, definition, {
      ...result,
      runInput: result.runInput ?? runInput,
    });
    result = applyPostHookToRunResult(
      { ...result, runInput: result.runInput ?? runInput },
      push,
    );
    if (push.pr_url) rolloutPrUrls = [push.pr_url];
    if (push.committed) extraEvidence.push("post_hook_committed");
    if (push.pushed) extraEvidence.push("post_hook_pushed");
  }

  const finalized = finalizeAgentRun(
    { ...result, runInput: result.runInput ?? runInput },
    { definition, rolloutPrUrls, preflight, extraEvidence },
  );

  await applySwarmPostRunEffects(finalized, briefingHash);
  await persistAgentRun({ run: finalized });
  return finalized;
}
