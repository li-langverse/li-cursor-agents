import { agentLog } from "../agent-log.js";
import { startAsyncSwarm, isAsyncSwarmRunning } from "../async-swarm/async-swarm-runtime.js";
import { loadState } from "../control-plane/state.js";
import { loadWorkerStatusFromDb } from "../db/worker-status.js";
import { dbEnabled } from "../db/client.js";
import {
  detachedSwarmEnabled,
  externalSwarmRunnerEnabled,
  isDetachedSwarmChildRunning,
  spawnDetachedAsyncSwarm,
} from "../swarm/detached-swarm-process.js";
import { workerConsole } from "./worker-console.js";
import { reconcileStaleRunningAgentRuns, reconcileUnregisteredRunningAgentRuns } from "../db/reconcile-stale-runs.js";
import { writeSwarmHealthSnapshot } from "../swarm/swarm-watchdog.js";
import { systemctlUserIsActive } from "../swarm/systemd-probe.js";
import { flushWorkerHeartbeat } from "./heartbeat-loop.js";

function swarmActiveOnThisHost(): boolean {
  return isAsyncSwarmRunning() || isDetachedSwarmChildRunning();
}

function envAutoStartSwarm(): boolean {
  return (
    process.env.LI_AUTO_START_ASYNC_SWARM === "1" ||
    process.env.LI_AUTO_START_ASYNC_SWARM === "true"
  );
}

/** Pure decision: resume async swarm worker loops after process restart. */
export function shouldResumeAsyncSwarmAfterRestart(input: {
  swarmActiveOnHost: boolean;
  envAutoStart: boolean;
  workerAsyncSwarmRunning: boolean;
}): boolean {
  if (input.swarmActiveOnHost) return false;
  return input.envAutoStart || input.workerAsyncSwarmRunning;
}

const ASYNC_SWARM_UNIT = "li-agents-async-swarm.service";

async function systemdAsyncSwarmActive(): Promise<boolean> {
  try {
    const state = await systemctlUserIsActive(ASYNC_SWARM_UNIT);
    return state === "active" || state === "activating";
  } catch {
    return false;
  }
}

async function reconcileRunningAgentRunsOnBoot(): Promise<void> {
  if (!dbEnabled()) return;
  try {
    const n = await reconcileStaleRunningAgentRuns();
    if (n > 0) {
      workerConsole("reconcile", "info", `marked ${n} stale agent_runs as error`);
    }
    const worker = await loadWorkerStatusFromDb();
    const registeredIds = (worker?.active_runs ?? [])
      .filter((r) => r.status === "running")
      .map((r) => r.run_id);
    const forceUnregistered =
      (await systemdAsyncSwarmActive()) || swarmActiveOnThisHost();
    const u = await reconcileUnregisteredRunningAgentRuns(registeredIds, {
      worker,
      force: forceUnregistered,
    });
    if (u > 0) {
      workerConsole("reconcile", "info", `marked ${u} unregistered agent_runs as error`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    workerConsole("reconcile", "warn", `stale run reconcile skipped: ${msg}`);
  }
}

/**
 * After worker restart, in-memory swarm is off but Supabase worker_status may still say on.
 * Resume workers when DB says swarm was running, or when LI_AUTO_START_ASYNC_SWARM=1.
 * Otherwise write heartbeat so the dashboard does not show a stale "swarm on".
 */
export async function reconcileSwarmAfterStartup(): Promise<void> {
  const state = loadState();
  await reconcileRunningAgentRunsOnBoot();
  void writeSwarmHealthSnapshot().catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    workerConsole("reconcile", "warn", `swarm-health snapshot skipped: ${msg}`);
  });
  workerConsole(
    "reconcile",
    "info",
    "swarm reconcile begin",
    `running=${swarmActiveOnThisHost()} detached=${detachedSwarmEnabled()}`,
  );

  if (swarmActiveOnThisHost()) {
    await flushWorkerHeartbeat();
    workerConsole("reconcile", "info", "swarm already running — refreshed worker_status");
    return;
  }

  if (!envAutoStartSwarm() && detachedSwarmEnabled()) {
    workerConsole(
      "reconcile",
      "info",
      "LI_AUTO_START_ASYNC_SWARM=0 — systemd/async unit owns swarm; dashboard will not spawn detached child",
    );
    return;
  }

  if (envAutoStartSwarm() && detachedSwarmEnabled()) {
    const { markDetachedSwarmStopped } = await import("../swarm/swarm-watchdog.js");
    await markDetachedSwarmStopped("reconcile: detached pid not running");
  }

  let workerAsyncSwarmRunning = false;
  if (dbEnabled()) {
    const worker = await loadWorkerStatusFromDb();
    workerAsyncSwarmRunning = Boolean(worker?.async_swarm_running);
    if (workerAsyncSwarmRunning && !envAutoStartSwarm()) {
      workerConsole(
        "reconcile",
        "info",
        "worker_status.async_swarm_running=true — resuming async swarm after restart",
      );
      agentLog(
        "dashboard",
        "info",
        "worker_status.async_swarm_running=true — resuming async swarm after restart",
      );
    }
  }

  const shouldStart = shouldResumeAsyncSwarmAfterRestart({
    swarmActiveOnHost: swarmActiveOnThisHost(),
    envAutoStart: envAutoStartSwarm(),
    workerAsyncSwarmRunning,
  });

  const deferMs = Number(process.env.LI_SWARM_RECONCILE_DEFER_MS ?? 0);
  workerConsole(
    "reconcile",
    "info",
    `shouldStart=${shouldStart} deferMs=${deferMs} envAutoStart=${envAutoStartSwarm()}`,
  );

  if (shouldStart && externalSwarmRunnerEnabled() && !detachedSwarmEnabled()) {
    workerConsole(
      "reconcile",
      "info",
      "LI_SWARM_EXTERNAL=1 — swarm-dev.sh / agents:async-swarm owns startup",
    );
    await flushWorkerHeartbeat();
    return;
  }

  if (shouldStart) {
    const launch = async (): Promise<void> => {
      if (detachedSwarmEnabled()) {
        workerConsole("reconcile", "info", "spawning detached async swarm process…");
        const r = spawnDetachedAsyncSwarm();
        workerConsole("reconcile", "info", `detached async swarm: ${r.message}`);
        agentLog("dashboard", "info", `detached async swarm: ${r.message}`);
        await flushWorkerHeartbeat();
        return;
      }
      workerConsole("reconcile", "info", "starting async swarm (lanes + worker pool)…");
      const r = await startAsyncSwarm({ stopSupervisor: true });
      workerConsole("reconcile", "info", `async swarm: ${r.message}`);
      agentLog("dashboard", "info", `async swarm startup: ${r.message}`);
      await flushWorkerHeartbeat();
    };
    if (deferMs > 0) {
      workerConsole("reconcile", "info", `deferring swarm start ${deferMs}ms for API readiness`);
      setTimeout(() => {
        void launch().catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          workerConsole("reconcile", "ERROR", `deferred swarm start failed: ${msg}`);
          agentLog("dashboard", "ERROR", `deferred swarm start: ${msg}`);
        });
      }, deferMs).unref();
      return;
    }
    await launch();
    return;
  }

  workerConsole(
    "reconcile",
    "info",
    "swarm not auto-started — use dashboard Start agents or LI_AUTO_START_ASYNC_SWARM=1",
  );
  await flushWorkerHeartbeat();
}
