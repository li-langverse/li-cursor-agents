import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { systemctlUserIsActive, type SystemdActiveState } from "../swarm/systemd-probe.js";

const execFileAsync = promisify(execFile);

export const DASHBOARD_SYSTEMD_UNIT = "li-agents-dashboard.service";
export const ASYNC_SWARM_SYSTEMD_UNIT = "li-agents-async-swarm.service";

export type SystemdIsActiveFn = (unit: string) => Promise<SystemdActiveState>;

export function controlPlaneSystemdForced(): boolean {
  const v = process.env.LI_CONTROL_PLANE_SYSTEMD?.trim().toLowerCase();
  return v === "1" || v === "true";
}

/** True when user systemd owns the dashboard (or forced via env). */
export async function controlPlaneManagedBySystemd(
  isActive: SystemdIsActiveFn = systemctlUserIsActive,
): Promise<boolean> {
  if (controlPlaneSystemdForced()) return true;
  const dash = await isActive(DASHBOARD_SYSTEMD_UNIT);
  return dash === "active" || dash === "activating";
}

export type SystemdExecFile = (
  cmd: string,
  args: string[],
  opts?: { timeout?: number },
) => Promise<unknown>;

export type SystemdRestartDeps = {
  isActive?: SystemdIsActiveFn;
  execFile?: SystemdExecFile;
};

/** `systemctl --user try-restart` dashboard + async-swarm units. */
export async function restartControlPlaneSystemdUnits(
  deps: SystemdRestartDeps = {},
): Promise<{ ok: boolean; message: string }> {
  const exec = deps.execFile ?? execFileAsync;
  const units = [DASHBOARD_SYSTEMD_UNIT, ASYNC_SWARM_SYSTEMD_UNIT];
  const restarted: string[] = [];
  for (const unit of units) {
    try {
      await exec("systemctl", ["--user", "try-restart", unit], { timeout: 30_000 });
      restarted.push(unit);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, message: `systemctl try-restart ${unit} failed: ${msg}` };
    }
  }
  return {
    ok: true,
    message: `restarted via systemd: ${restarted.join(", ")}`,
  };
}
