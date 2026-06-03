import { writeFileSync } from "node:fs";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getAgent } from "./agents/registry.js";
import { MockBackend } from "./backends/mock-backend.js";
import { isSdkSlotLockError } from "./backends/sdk-session-lock.js";
import { buildMockTrace, buildRunInput } from "./agent-run-trace.js";
import { resolveCursorApiKey } from "./env.js";
import { hashBriefing } from "./control-plane/briefing-hash.js";
import { finalizeAgentRun } from "./control-plane/finalize-run.js";
import { applySwarmPostRunEffects } from "./handoffs/post-run.js";
import { shouldPersistRunToHistory } from "./control-plane/run-history.js";
import { persistAgentRun } from "./db/persist.js";
import { runsDir } from "./control-plane/paths.js";
import {
  buildAgentKitMaintainerInstruction,
  refreshAgentKitAudit,
} from "./preflight/agent-kit-sync.js";
import { buildSwarmPromptBlocks } from "./preflight/swarm-context.js";
import {
  runImplementerPostRunGate,
  runImplementerPreflightGate,
} from "./preflight/implementer-preflight-gate.js";
import { buildSkillsPromptAppendix } from "./agents/load-skills.js";
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
import { resolveBranchFromGoalFile } from "./agents/resolve-goal-metadata.js";
import {
  agentUsesGuaranteedPush,
  beginRepoWorkflowSession,
} from "./repo-workflow/workspace-session.js";
import {
  completeSupervisorRun,
  hasActiveRunningTrack,
  registerSupervisorRun,
} from "./control-plane/runtime.js";
import { publishRunInputLive } from "./control-plane/live-run-trace.js";
import { allocateRunId, runOutputPath } from "./control-plane/run-paths.js";
import type { AgentRunLifecycle } from "./control-plane/types.js";
import type { AgentId, AgentRunOptions, AgentRunResult } from "./types.js";
import type { RepoWorkflowSession } from "./repo-workflow/workspace-session.js";

function runLifecycleFromResult(status: AgentRunResult["status"]): AgentRunLifecycle {
  if (status === "finished") return "finished";
  if (status === "cancelled") return "cancelled";
  return "error";
}

async function scheduleWorkerHeartbeatFromRunner(): Promise<void> {
  try {
    const m = await import("./worker/heartbeat-loop.js");
    await m.flushWorkerHeartbeat();
  } catch {
    /* disk-only */
  }
}

async function withRunAgentTracking(
  agentId: AgentId,
  fn: (runId: string) => Promise<AgentRunResult>,
): Promise<AgentRunResult> {
  if (hasActiveRunningTrack(agentId)) {
    await scheduleWorkerHeartbeatFromRunner();
    // Still register a run so live trace + dashboard stream work for overlapping calls.
    const runId = registerSupervisorRun(agentId, "runAgent:parallel");
    try {
      const result = await fn(runId);
      completeSupervisorRun(runId, runLifecycleFromResult(result.status));
      return result;
    } catch (err) {
      completeSupervisorRun(runId, "error");
      throw err;
    }
  }

  const runId = registerSupervisorRun(agentId, "runAgent");
  await scheduleWorkerHeartbeatFromRunner();
  try {
    const result = await fn(runId);
    completeSupervisorRun(runId, runLifecycleFromResult(result.status));
    return result;
  } catch (err) {
    completeSupervisorRun(runId, "error");
    throw err;
  }
}

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

  return withRunAgentTracking(definition.id, async (runId) =>
    runAgentBody({ ...options, runId }, definition),
  );
}

async function runAgentBody(
  options: AgentRunOptions,
  definition: NonNullable<ReturnType<typeof getAgent>>,
): Promise<AgentRunResult> {
  const packageRoot = agentsPackageRoot();
  const benchmarksRoot = resolveBenchmarksRoot(options.benchmarksRoot);
  const mock = shouldUseMock(options.mock);
  const preflight = runPreflight(benchmarksRoot, true);

  if (!mock && !options.dryRun) {
    const gatePreflight = runImplementerPreflightGate(definition.id, options.extraInstruction);
    if (!gatePreflight.ok && !gatePreflight.skipped) {
      const outputPath = runOutputPath(
        definition.id,
        options.runId ?? allocateRunId(definition.id),
        mock,
      );
      const errText = `Implementer preflight gate failed: ${gatePreflight.detail}`;
      return finalizeAgentRun(
        {
          agentId: definition.id,
          backend: agentBackendLabel(mock),
          status: "error",
          durationMs: 0,
          outputPath,
          outputText: errText,
          error: errText,
          runInput: buildRunInput({
            agentId: definition.id,
            backend: mock ? "mock" : "cursor-sdk",
            systemPrompt: "",
            userMessage: errText,
            cwd: options.cwd || packageRoot,
            benchmarksRoot,
            dryRun: options.dryRun,
            mock,
          }),
        },
        { definition, preflight },
      );
    }
  }

  let systemPrompt = loadPrompt(packageRoot, definition.promptFile);
  const skillsAppendix = buildSkillsPromptAppendix(definition.skills, packageRoot);
  if (skillsAppendix) {
    systemPrompt += `\n\n---\n\n# Agent skills (follow before editing)\n\n${skillsAppendix}`;
  }
  if (definition.repoWorkflow) {
    systemPrompt += `\n\n---\n\n${loadPrompt(packageRoot, "repo-workflow-tools.md")}`;
  }
  let workCwd = options.cwd || packageRoot;
  let workflowSession: RepoWorkflowSession | undefined;

  const workflowRunId = options.runId ?? allocateRunId(definition.id);

  if (agentUsesGuaranteedPush(definition)) {
    const goalFile = process.env.LI_GOAL_FILE?.trim();
    if (goalFile && !process.env.LI_REPO_WORKFLOW_BRANCH?.trim()) {
      try {
        const branch = resolveBranchFromGoalFile(goalFile);
        if (branch) {
          process.env.LI_REPO_WORKFLOW_BRANCH = branch;
          if (!process.env.LI_REPO_WORKFLOW_TRACK_REMOTE?.trim()) {
            process.env.LI_REPO_WORKFLOW_TRACK_REMOTE = "1";
          }
        }
      } catch {
        /* goal file unreadable — fall back to per-run branch */
      }
    }
    workflowSession = beginRepoWorkflowSession({
      agentId: definition.id,
      repo: options.workflowRepo,
      branchName: process.env.LI_REPO_WORKFLOW_BRANCH?.trim(),
      runId: workflowRunId,
      dryRun: options.dryRun,
      skipPush: mock || options.dryRun || process.env.LI_REPO_WORKFLOW_SKIP_PUSH === "1",
      useFixture: mock,
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
    const outputPath = runOutputPath(definition.id, options.runId ?? allocateRunId(definition.id), mock);
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
      if (shouldPersistRunToHistory(finalized)) {
        await persistAgentRun({ run: finalized });
      }
      return finalized;
    }
    extra = [text, extra].filter(Boolean).join("\n\n");
  }

  if (
    definition.id === "agent_kit_maintainer" &&
    benchmarksRoot &&
    preflight.briefing &&
    !process.env.LI_SDK_MATRIX_MODE?.trim()
  ) {
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
      const outputPath = runOutputPath(
        definition.id,
        options.runId ?? allocateRunId(definition.id),
        mock,
      );
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
      if (shouldPersistRunToHistory(finalized)) {
        await persistAgentRun({ run: finalized, rolloutRows: rollout });
      }
      return finalized;
    }
  }

  const swarmBlocks =
    process.env.LI_AGENT_MINIMAL_PROMPT === "1"
      ? ""
      : await buildSwarmPromptBlocks(definition.id, preflight.briefing ?? preflight);
  const userMessage = buildUserMessage(definition.id, preflight, extra, swarmBlocks);
  const backend = mock
    ? new MockBackend()
    : new (await import("./backends/cursor-sdk-backend.js")).CursorSdkBackend();
  const briefingHash =
    preflight.briefing && typeof preflight.briefing === "object"
      ? hashBriefing(preflight.briefing)
      : undefined;

  const researchCtx = options.researchContext;
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
    researchGoalId: researchCtx?.goal_id,
    researchVertical: researchCtx?.vertical,
    publishSubdir: researchCtx?.publish_subdir,
    dryRun: options.dryRun,
    mock,
  });

  if (options.runId) {
    publishRunInputLive(
      options.runId,
      runInput,
      runOutputPath(definition.id, options.runId, mock),
    );
  }

  let result: AgentRunResult;
  try {
    result = await backend.run(definition, systemPrompt, userMessage, {
      ...options,
      cwd: workCwd,
      runId: options.runId ?? workflowRunId,
      runInput,
    });
  } catch (err) {
    if (isSdkSlotLockError(err)) {
      throw err;
    }
    const outputPath = runOutputPath(
      definition.id,
      options.runId ?? allocateRunId(definition.id),
      mock,
    );
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

  if (!mock && !options.dryRun && result.status === "finished") {
    const postGate = runImplementerPostRunGate(definition.id, extra);
    if (!postGate.ok && !postGate.skipped) {
      const gateErr = `Implementer post-run gates failed: ${postGate.detail}`;
      result = {
        ...result,
        status: "error",
        error: gateErr,
        outputText: [result.outputText, "", gateErr].filter(Boolean).join("\n"),
      };
      extraEvidence.push("implementer_gate_failed");
    } else if (!postGate.skipped) {
      extraEvidence.push("implementer_gate_passed");
    }
  }

  const finalized = finalizeAgentRun(
    { ...result, runInput: result.runInput ?? runInput },
    { definition, rolloutPrUrls, preflight, extraEvidence },
  );

  if (shouldPersistRunToHistory(finalized)) {
    await persistAgentRun({ run: finalized });
  }
  await applySwarmPostRunEffects(finalized, preflight.briefing ?? preflight, briefingHash);
  return finalized;
}
