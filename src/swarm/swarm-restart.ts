import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { agentLog } from "../agent-log.js";
import { isDisableAutostartSet } from "./swarm-health-file.js";
import { systemctlUserIsActive } from "./systemd-probe.js";
import { ensureSwarmRunningIfConfigured } from "./swarm-watchdog-core.js";

const execFileAsync = promisify(execFile);
const ASYNC_SWARM_UNIT = "li-agents-async-swarm.service";

async function systemctlUserRestart(unit: string): Promise<void> {
  await execFileAsync("systemctl", ["--user", "restart", unit], { timeout: 30_000 });
}

async function systemctlUserKill(unit: string, signal: "SIGTERM" | "SIGKILL"): Promise<void> {
  await execFileAsync("systemctl", ["--user", "kill", `-s`, signal, unit], { timeout: 15_000 });
}

async function systemctlUserStart(unit: string): Promise<void> {
  await execFileAsync("systemctl", ["--user", "start", unit], { timeout: 30_000 });
}

export async function restartAsyncSwarmUnit(
  reason: string,
  options?: { force?: boolean },
): Promise<{
  ok: boolean;
  message: string;
}> {
  if (isDisableAutostartSet()) {
    return { ok: false, message: "DISABLE_AUTOSTART set — skip restart" };
  }
  const unitState = await systemctlUserIsActive(ASYNC_SWARM_UNIT);
  if (unitState !== "not-found") {
    if ((unitState === "active" || unitState === "activating") && !options?.force) {
      return { ok: true, message: `${ASYNC_SWARM_UNIT} already ${unitState}` };
    }
    try {
      if (unitState === "deactivating" || options?.force) {
        await systemctlUserKill(ASYNC_SWARM_UNIT, "SIGKILL");
        await new Promise((r) => setTimeout(r, 500));
        await systemctlUserStart(ASYNC_SWARM_UNIT);
      } else {
        await systemctlUserRestart(ASYNC_SWARM_UNIT);
      }
      agentLog("watchdog", "info", `systemctl restart ${ASYNC_SWARM_UNIT}: ${reason}`);
      return { ok: true, message: `restarted ${ASYNC_SWARM_UNIT}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      agentLog("watchdog", "warn", `systemctl restart ${ASYNC_SWARM_UNIT} failed: ${msg}`);
    }
  }
  const r = await ensureSwarmRunningIfConfigured();
  const ok =
    r.action === "spawned" ||
    r.action === "started_in_process" ||
    r.action === "already_running";
  return { ok, message: r.message };
}
