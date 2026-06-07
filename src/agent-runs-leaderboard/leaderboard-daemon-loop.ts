import type { RunResult } from "@cursor/sdk";
import { getAgent } from "../agents/registry.js";
import { buildSkillsPromptAppendix } from "../agents/load-skills.js";
import { resolveCursorSdkMode, sdkModeSystemPrefix } from "../agents/sdk-mode.js";
import { withGlobalSdkSessionLock } from "../backends/sdk-session-lock.js";
import {
  resolveCursorApiKey,
  resolveCursorModelId,
} from "../env.js";
import { buildControlPlaneMcpServers } from "../mcp/mcp-config.js";
import { agentsPackageRoot, loadPrompt } from "../runner.js";
import {
  printSdkDeltaToTerminal,
  printSdkProgressToTerminal,
  printSdkRunBanner,
  printSdkStepToTerminal,
  terminalStreamEnabled,
} from "../sdk/terminal-stream.js";
import { workerConsole } from "../worker/worker-console.js";
import {
  isLeaderboardDaemonAlwaysOn,
  LEADERBOARD_DEFAULT_MESSAGES,
  leaderboardAgentId,
  leaderboardLoopSleepSec,
  leaderboardMessages,
} from "./leaderboard-daemon-config.js";

type SdkAgent = Awaited<ReturnType<typeof import("@cursor/sdk").Agent.create>>;

const AUTH_FAILURE_PATTERNS = [
  "unauthenticated",
  "unauthorized",
  "authentication",
  "invalid token",
  "invalid_grant",
  "api key",
  "401",
  "403 forbidden",
  "cursor_api",
] as const;

/** Per-tick in-process session recreation attempts before moving on. */
const AUTH_RECOVERY_MAX_RETRIES = 1;

let abort: AbortController | null = null;
let loopPromise: Promise<void> | null = null;
let activeAgent: SdkAgent | null = null;

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function textLooksLikeAuthFailure(text: string): boolean {
  const lower = text.toLowerCase();
  return AUTH_FAILURE_PATTERNS.some((p) => lower.includes(p));
}

function isSdkAuthFailure(err: unknown): boolean {
  if (err && typeof err === "object") {
    const name = (err as { constructor?: { name?: string } }).constructor?.name ?? "";
    if (name === "AuthenticationError") return true;
    if ("code" in err && (err as { code?: string }).code === "unauthenticated") return true;
  }
  return textLooksLikeAuthFailure(errorText(err));
}

function isAuthRunResult(result: RunResult): boolean {
  if (result.status !== "error") return false;
  const text = `${(result as { result?: string }).result ?? ""}`;
  return textLooksLikeAuthFailure(text);
}

function sleepUntil(signal: AbortSignal, ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted || ms <= 0) {
      resolve();
      return;
    }
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });
}

function buildSystemPrompt(): string {
  const agentId = leaderboardAgentId();
  const definition = getAgent(agentId);
  if (!definition) {
    throw new Error(`Unknown agent: ${agentId}`);
  }
  const packageRoot = agentsPackageRoot();
  let systemPrompt = loadPrompt(packageRoot, definition.promptFile);
  const skillsAppendix = buildSkillsPromptAppendix(definition.skills, packageRoot);
  if (skillsAppendix) {
    systemPrompt += `\n\n---\n\n# Agent skills (follow before editing)\n\n${skillsAppendix}`;
  }
  const modePrefix = sdkModeSystemPrefix(resolveCursorSdkMode(definition));
  if (modePrefix) {
    systemPrompt = `${modePrefix}\n\n${systemPrompt}`;
  }
  systemPrompt += `\n\n---\n\n## Agent-runs leaderboard heartbeat (chat-only)

This is a perpetual homelab heartbeat for the Cursor agent-runs leaderboard toy.
**Do not** edit files, commit, push, or open PRs. Reply in chat only — brief, cheerful messages.
`;
  return systemPrompt;
}

function resolveWorkCwd(): string {
  return agentsPackageRoot();
}

async function createSdkAgent(cwd: string): Promise<SdkAgent> {
  const apiKey = resolveCursorApiKey();
  if (!apiKey) {
    throw new Error("CURSOR_API_KEY required for agent-runs-leaderboard daemon");
  }
  const { Agent } = await import("@cursor/sdk");
  const mcpServers = buildControlPlaneMcpServers();
  return Agent.create({
    apiKey,
    model: { id: resolveCursorModelId() },
    local: {
      cwd,
      settingSources: [],
    },
    ...(mcpServers ? { mcpServers } : {}),
  });
}

async function closeSdkAgent(agent: SdkAgent | null): Promise<void> {
  if (!agent) return;
  try {
    agent.close();
  } catch {
    /* ignore close errors */
  }
}

async function recreateSdkAgent(cwd: string): Promise<SdkAgent> {
  workerConsole("agent-runs-leaderboard", "warn", "auth recovery: recreating SDK session");
  await closeSdkAgent(activeAgent);
  activeAgent = null;
  const agent = await createSdkAgent(cwd);
  workerConsole(
    "agent-runs-leaderboard",
    "info",
    "auth recovery: SDK Agent.create() — new session ready",
  );
  activeAgent = agent;
  return agent;
}

async function sendHeartbeat(
  agent: SdkAgent,
  prompt: string,
  opts: { first: boolean; systemPrompt: string; cwd: string; runIndex: number },
): Promise<RunResult> {
  const message = opts.first ? `${opts.systemPrompt}\n\n---\n\n${prompt}` : prompt;
  const attemptStart = Date.now();
  printSdkRunBanner(leaderboardAgentId(), opts.cwd);
  workerConsole(
    "agent-runs-leaderboard",
    "info",
    `tick #${opts.runIndex} — sending prompt (${opts.first ? "initial" : "follow-up"})`,
  );

  const progressIv =
    terminalStreamEnabled()
      ? setInterval(() => {
          printSdkProgressToTerminal(Date.now() - attemptStart);
        }, 15_000)
      : undefined;

  try {
    const run = await agent.send(message, {
      onStep: async ({ step }) => {
        printSdkStepToTerminal(step);
      },
      onDelta: async ({ update }) => {
        printSdkDeltaToTerminal(update);
      },
    });
    return await run.wait();
  } finally {
    if (progressIv) clearInterval(progressIv);
  }
}

async function runLeaderboardDaemonBody(signal: AbortSignal): Promise<void> {
  const messages = leaderboardMessages();
  const sleepSec = leaderboardLoopSleepSec();
  const cwd = resolveWorkCwd();
  const systemPrompt = buildSystemPrompt();
  let runIndex = 0;

  workerConsole(
    "agent-runs-leaderboard",
    "info",
    `starting long-lived SDK session agent=${leaderboardAgentId()} cwd=${cwd} sleep=${sleepSec}s messages=${messages.length}`,
  );

  await withGlobalSdkSessionLock(async () => {
    activeAgent = await createSdkAgent(cwd);
    workerConsole("agent-runs-leaderboard", "info", "SDK Agent.create() — session kept alive across ticks");

    try {
      while (!signal.aborted) {
        runIndex++;
        const idx = (runIndex - 1) % messages.length;
        const prompt = messages[idx]!;
        let authRecoveryAttempts = 0;
        let tickComplete = false;

        while (!tickComplete && !signal.aborted) {
          const includeSystemPrompt = runIndex === 1 || authRecoveryAttempts > 0;
          try {
            const result = await sendHeartbeat(activeAgent!, prompt, {
              first: includeSystemPrompt,
              systemPrompt,
              cwd,
              runIndex,
            });

            if (isAuthRunResult(result)) {
              if (authRecoveryAttempts < AUTH_RECOVERY_MAX_RETRIES) {
                authRecoveryAttempts++;
                workerConsole(
                  "agent-runs-leaderboard",
                  "warn",
                  `tick #${runIndex} auth failure (status=error) — recovery attempt ${authRecoveryAttempts}/${AUTH_RECOVERY_MAX_RETRIES}`,
                );
                await recreateSdkAgent(cwd);
                continue;
              }
              workerConsole(
                "agent-runs-leaderboard",
                "warn",
                `tick #${runIndex} auth failure persisted after ${authRecoveryAttempts} recovery attempt(s)`,
              );
            } else {
              workerConsole(
                "agent-runs-leaderboard",
                "info",
                `tick #${runIndex} finished status=${result.status} run_id=${result.id}`,
              );
            }
            tickComplete = true;
          } catch (err) {
            if (isSdkAuthFailure(err) && authRecoveryAttempts < AUTH_RECOVERY_MAX_RETRIES) {
              authRecoveryAttempts++;
              workerConsole(
                "agent-runs-leaderboard",
                "warn",
                `tick #${runIndex} auth error: ${errorText(err)} — recovery attempt ${authRecoveryAttempts}/${AUTH_RECOVERY_MAX_RETRIES}`,
              );
              await recreateSdkAgent(cwd);
              continue;
            }
            workerConsole(
              "agent-runs-leaderboard",
              "warn",
              `tick #${runIndex} error: ${errorText(err)}`,
            );
            tickComplete = true;
          }
        }

        if (signal.aborted) break;
        workerConsole("agent-runs-leaderboard", "info", `sleep ${sleepSec}s until next tick`);
        await sleepUntil(signal, sleepSec * 1000);
      }
    } finally {
      await closeSdkAgent(activeAgent);
      workerConsole("agent-runs-leaderboard", "info", "SDK agent.close() on shutdown");
      activeAgent = null;
    }
  });
}

export function startLeaderboardDaemonLoop(): { started: boolean; message: string } {
  if (!isLeaderboardDaemonAlwaysOn()) {
    return { started: false, message: "LI_AGENT_RUNS_LEADERBOARD_ALWAYS_ON not set" };
  }
  if (loopPromise) {
    return { started: false, message: "agent-runs-leaderboard daemon already running" };
  }

  abort = new AbortController();
  const signal = abort.signal;
  loopPromise = runLeaderboardDaemonBody(signal)
    .catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      workerConsole("agent-runs-leaderboard", "ERROR", `daemon loop exited: ${msg}`);
    })
    .finally(() => {
      loopPromise = null;
      abort = null;
    });

  return { started: true, message: "agent-runs-leaderboard daemon started (long-lived SDK session)" };
}

export function stopLeaderboardDaemonLoop(): { stopped: boolean; message: string } {
  if (!abort && !loopPromise) {
    return { stopped: false, message: "agent-runs-leaderboard daemon not running" };
  }
  abort?.abort();
  return { stopped: true, message: "agent-runs-leaderboard daemon stopping (SIGTERM/SIGINT)" };
}

export async function runLeaderboardDaemonOnce(): Promise<void> {
  const prev = process.env.LI_AGENT_RUNS_LEADERBOARD_ALWAYS_ON;
  process.env.LI_AGENT_RUNS_LEADERBOARD_ALWAYS_ON = "1";
  process.env.LI_AGENT_RUNS_LEADERBOARD_LOOP_SLEEP_SEC = "0";
  const messages = leaderboardMessages();
  process.env.LI_AGENT_RUNS_LEADERBOARD_MESSAGES = JSON.stringify([messages[0] ?? LEADERBOARD_DEFAULT_MESSAGES[0]]);

  const { started } = startLeaderboardDaemonLoop();
  if (!started) {
    throw new Error("failed to start leaderboard daemon for once");
  }

  await new Promise<void>((resolve) => {
    const poll = setInterval(() => {
      if (!loopPromise) {
        clearInterval(poll);
        resolve();
      }
    }, 100);
  });

  if (prev === undefined) delete process.env.LI_AGENT_RUNS_LEADERBOARD_ALWAYS_ON;
  else process.env.LI_AGENT_RUNS_LEADERBOARD_ALWAYS_ON = prev;
}
