import { agentLog } from "../agent-log.js";
import { isAsyncSwarmRunning, startAsyncSwarm } from "../async-swarm/async-swarm-runtime.js";
import { dbEnabled } from "../db/client.js";
import { loadWorkerStatusFromDb, saveWorkerStatusToDb } from "../db/worker-status.js";
import { systemctlUserIsActive } from "./systemd-probe.js";
import { workerConsole } from "../worker/worker-console.js";
import {
  detachedSwarmEnabled,
  externalSwarmRunnerEnabled,
  isDetachedSwarmChildRunning,
  spawnDetachedAsyncSwarm,
} from "./detached-swarm-process.js";
import { isDisableAutostartSet } from "./swarm-health-file.js";

function envAutoStartSwarm(): boolean {
  return (
    process.env.LI_AUTO_START_ASYNC_SWARM === "1" ||
    process.env.LI_AUTO_START_ASYNC_SWARM === "true"
  );
}

function swarmActiveOnThisHost(): boolean {
  return isAsyncSwarmRunning() || isDetachedSwarmChildRunning();
}

const ASYNC_SWARM_SYSTEMD_UNIT = "li-agents-async-swarm.service";

async function systemdAsyncSwarmUnitActive(): Promise<boolean> {
  try {
    const state = await systemctlUserIsActive(ASYNC_SWARM_SYSTEMD_UNIT);
    return state === "active" || state === "activating";
  } catch {
    return false;
  }
}

export async function markDetachedSwarmStopped(
  reason: string,
  deps?: { systemdUnitActive?: () => Promise<boolean> },
): Promise<void> {
  if (!dbEnabled()) return;
  const unitActive = deps?.systemdUnitActive ?? systemdAsyncSwarmUnitActive;
  if (await unitActive()) {
    workerConsole(
      "watchdog",
      "info",
      `skip markDetachedSwarmStopped (${reason}): ${ASYNC_SWARM_SYSTEMD_UNIT} is active`,
    );
    return;
  }
  try {
    const worker = await loadWorkerStatusFromDb();
    if (!worker?.async_swarm_running) return;
    await saveWorkerStatusToDb({
      ...worker,
      async_swarm_running: false,
      active_runs: [],
    });
    workerConsole("watchdog", "info", `marked swarm stopped in DB: ${reason}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    agentLog("watchdog", "warn", `markDetachedSwarmStopped failed: ${msg}`);
  }
}

export async function ensureSwarmRunningIfConfigured(): Promise<{
  action: "none" | "already_running" | "spawned" | "started_in_process";
  message: string;
}> {
  if (!envAutoStartSwarm()) {
    return { action: "none", message: "LI_AUTO_START_ASYNC_SWARM not set" };
  }
  if (isDisableAutostartSet()) {
    return { action: "none", message: "DISABLE_AUTOSTART set" };
  }
  if (swarmActiveOnThisHost()) {
    return { action: "already_running", message: "swarm process alive" };
  }
  if (externalSwarmRunnerEnabled() && !detachedSwarmEnabled()) {
    return { action: "none", message: "external swarm runner owns startup" };
  }
  if (detachedSwarmEnabled()) {
    workerConsole("watchdog", "info", "detached swarm missing — respawning");
    const r = spawnDetachedAsyncSwarm();
    agentLog("watchdog", "info", `respawn detached swarm: ${r.message}`);
    return { action: r.started ? "spawned" : "none", message: r.message };
  }
  const r = await startAsyncSwarm({ stopSupervisor: true });
  return {
    action: r.started ? "started_in_process" : "none",
    message: r.message,
  };
}

export function isSwarmActiveOnHost(): boolean {
  return swarmActiveOnThisHost();
}
