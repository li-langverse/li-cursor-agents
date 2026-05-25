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

export async function restartAsyncSwarmUnit(reason: string): Promise<{
  ok: boolean;
  message: string;
}> {
  if (isDisableAutostartSet()) {
    return { ok: false, message: "DISABLE_AUTOSTART set — skip restart" };
  }
  const unitState = await systemctlUserIsActive(ASYNC_SWARM_UNIT);
  if (unitState !== "not-found") {
    if (unitState === "active" || unitState === "activating") {
      return { ok: true, message: `${ASYNC_SWARM_UNIT} already ${unitState}` };
    }
    try {
      await systemctlUserRestart(ASYNC_SWARM_UNIT);
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
