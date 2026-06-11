import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { agentLog } from "../agent-log.js";
import { workerConsole } from "../worker/worker-console.js";
import { isPhaseHandoffEnabled, resolveActivePhase } from "./proof-explorer-phase-handoff.js";
import {
  isProofExplorerExitOnComplete,
  isProofExplorerWorkerAlwaysOn,
  proofExplorerAgentsRoot,
  proofExplorerLicRoot,
  proofExplorerLoopMax,
  proofExplorerLoopSleepSec,
  proofExplorerWorkflowRepo,
  proofExplorerGoalLoopEnv,
  proofExplorerTrackedBranch,
} from "./proof-explorer-worker-config.js";
import { syncProofExplorerLicFromOrigin } from "./proof-explorer-lic-sync.js";
import { sweepModeAllowsHandoff } from "./proof-explorer-sweep-mode.js";

let child: ReturnType<typeof spawn> | null = null;
let abort: AbortController | null = null;
let activePhaseId: string | null = null;
let activeGoalRel: string | null = null;

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

function resolveGoalPath(agentsRoot: string, licRoot: string, goalFile: string): string {
  if (goalFile.startsWith("/") && existsSync(goalFile)) return goalFile;
  for (const base of [licRoot, agentsRoot, join(agentsRoot, "..")]) {
    const candidate = join(base, goalFile);
    if (existsSync(candidate)) return candidate;
  }
  return join(licRoot, goalFile);
}

function runGoalDirectedLoopOnce(goalRel: string): Promise<number> {
  const agentsRoot = proofExplorerAgentsRoot();
  const licRoot = proofExplorerLicRoot();
  const goalPath = resolveGoalPath(agentsRoot, licRoot, goalRel);
  const loopSh = join(agentsRoot, "scripts/goal-directed-loop.sh");

  if (!existsSync(loopSh)) {
    return Promise.reject(new Error(`missing goal-directed-loop.sh at ${loopSh}`));
  }
  if (!existsSync(goalPath)) {
    return Promise.reject(new Error(`missing goal file at ${goalPath}`));
  }

  const args = [
    loopSh,
    "--agent",
    process.env.LI_PROOF_EXPLORER_AGENT?.trim() || "code_implementer",
    "--goal-file",
    goalPath,
    "--cwd",
    licRoot,
    "--workflow-repo",
    proofExplorerWorkflowRepo(),
    "--once",
  ];
  const max = proofExplorerLoopMax();
  if (max > 0) args.push("--max", String(max));

  workerConsole("li-proof-explorer", "info", `spawn: bash ${args.slice(1).join(" ")}`);

  return new Promise((resolve, reject) => {
    const proc = spawn("bash", args, {
      cwd: agentsRoot,
      env: {
        ...process.env,
        LI_GOAL_CWD: licRoot,
        LI_GOAL_FILE: goalPath,
        ...proofExplorerGoalLoopEnv(),
        LIC_ROOT: licRoot,
        LI_CURSOR_AGENTS_ROOT: agentsRoot,
      },
      stdio: "inherit",
    });
    child = proc;
    proc.on("error", reject);
    proc.on("close", (code) => {
      child = null;
      resolve(code ?? 1);
    });
  });
}

async function proofExplorerWorkerLoop(signal: AbortSignal): Promise<void> {
  const sleepSec = proofExplorerLoopSleepSec();
  workerConsole(
    "li-proof-explorer",
    "info",
    `always-on loop started sleep_sec=${sleepSec} lic=${proofExplorerLicRoot()} branch=${proofExplorerTrackedBranch()} handoff=${process.env.LI_PROOF_EXPLORER_PHASE_HANDOFF ?? "1"}`,
  );

  while (!signal.aborted) {
    try {
      const active = await resolveActivePhase();
      if (active.allComplete) {
        workerConsole("li-proof-explorer", "info", "program complete — all phase gates passed");
        if (isProofExplorerExitOnComplete()) {
          process.exit(0);
        }
        break;
      }

      activePhaseId = active.phase?.id ?? null;
      activeGoalRel = active.goalRel;

      const exitCode = await runGoalDirectedLoopOnce(active.goalRel);
      await syncProofExplorerLicFromOrigin();
      const sweepHandoff =
        exitCode !== 0 && (await sweepModeAllowsHandoff(activePhaseId, proofExplorerLicRoot()));
      if (exitCode === 0 || sweepHandoff) {
        workerConsole(
          "li-proof-explorer",
          "info",
          `phase ${activePhaseId ?? "?"} goal gate passed — checking handoff`,
        );
        if (
          exitCode === 0 &&
          !isPhaseHandoffEnabled() &&
          isProofExplorerExitOnComplete()
        ) {
          workerConsole("li-proof-explorer", "info", "program complete — all phase gates passed");
          process.exit(0);
        }
        const next = await resolveActivePhase();
        if (next.allComplete) {
          workerConsole("li-proof-explorer", "info", "program complete — all phase gates passed");
          if (isProofExplorerExitOnComplete()) {
            process.exit(0);
          }
          break;
        }
        if (next.phase?.id !== activePhaseId) {
          workerConsole("li-proof-explorer", "info", `handoff → phase ${next.phase?.id}`);
          continue;
        }
      }
      workerConsole("li-proof-explorer", "info", `iteration exit=${exitCode}; sleeping ${sleepSec}s`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      agentLog("li-proof-explorer", "ERROR", msg);
      workerConsole("li-proof-explorer", "ERROR", msg);
    }
    await sleepUntil(signal, sleepSec * 1000);
  }
}

export function proofExplorerWorkerSnapshot() {
  return {
    running: abort !== null && !abort.signal.aborted,
    child_running: child !== null,
    always_on: isProofExplorerWorkerAlwaysOn(),
    lic_root: proofExplorerLicRoot(),
    active_phase: activePhaseId,
    active_goal_file: activeGoalRel,
    sleep_sec: proofExplorerLoopSleepSec(),
  };
}

export function startProofExplorerWorkerLoop() {
  if (!isProofExplorerWorkerAlwaysOn()) {
    return { started: false, message: "LI_PROOF_EXPLORER_ALWAYS_ON not set" };
  }
  if (abort && !abort.signal.aborted) {
    return { started: false, message: "proof explorer worker already running" };
  }
  abort = new AbortController();
  void proofExplorerWorkerLoop(abort.signal).catch((err) => {
    agentLog(
      "li-proof-explorer",
      "ERROR",
      `loop exited: ${err instanceof Error ? err.message : String(err)}`,
    );
  });
  return { started: true, message: "proof explorer worker loop started" };
}

export function stopProofExplorerWorkerLoop() {
  if (child) {
    child.kill("SIGTERM");
    child = null;
  }
  if (!abort) {
    return { stopped: false, message: "proof explorer worker not running" };
  }
  abort.abort();
  abort = null;
  return { stopped: true, message: "proof explorer worker stopping" };
}

export async function runProofExplorerWorkerOnce(options?: { force?: boolean }): Promise<void> {
  if (options?.force) process.env.LI_PROOF_EXPLORER_ALWAYS_ON = "1";
  const active = await resolveActivePhase();
  if (active.allComplete) {
    console.log(JSON.stringify({ ok: true, all_complete: true }, null, 2));
    return;
  }
  const exitCode = await runGoalDirectedLoopOnce(active.goalRel);
      await syncProofExplorerLicFromOrigin();
  console.log(JSON.stringify({ ok: exitCode === 0, exit_code: exitCode, phase: active.phase?.id }, null, 2));
  if (exitCode !== 0) process.exit(1);
}
