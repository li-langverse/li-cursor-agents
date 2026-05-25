import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type SystemdActiveState = string;

export async function systemctlUserIsActive(unit: string): Promise<SystemdActiveState> {
  try {
    const { stdout } = await execFileAsync("systemctl", ["--user", "is-active", unit], {
      timeout: 8_000,
    });
    return stdout.trim() || "unknown";
  } catch (err: unknown) {
    const e = err as { stdout?: Buffer | string; code?: number };
    const out = e.stdout != null ? String(e.stdout).trim() : "";
    if (out) return out;
    if (e.code === 4) return "not-found";
    return "unknown";
  }
}

export async function listUserPlanLoopUnits(): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      "systemctl",
      ["--user", "list-units", "li-*-plan-loop.service", "--no-legend", "--plain"],
      { timeout: 10_000 },
    );
    const units: string[] = [];
    for (const line of stdout.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const unit = trimmed.split(/\s+/)[0];
      if (unit?.endsWith(".service")) units.push(unit);
    }
    return [...new Set(units)].sort();
  } catch {
    return [];
  }
}

export async function probePlanLoopUnits(): Promise<
  Array<{ unit: string; active_state: SystemdActiveState }>
> {
  const units = await listUserPlanLoopUnits();
  const rows: Array<{ unit: string; active_state: SystemdActiveState }> = [];
  for (const unit of units) {
    rows.push({ unit, active_state: await systemctlUserIsActive(unit) });
  }
  return rows;
}
