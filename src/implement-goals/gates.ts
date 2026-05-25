import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ImplementGoal } from "./types.js";
import { resolveImplementGoalLicRoot } from "./lic-root.js";

export interface GateRunResult {
  ok: boolean;
  exitCode: number;
  skipped: boolean;
  detail: string;
}

export function runImplementGoalGates(goal: ImplementGoal): GateRunResult {
  const licRoot = resolveImplementGoalLicRoot(goal);
  if (!licRoot) {
    return { ok: false, exitCode: 1, skipped: true, detail: "lic root not found" };
  }
  const scriptPath = join(licRoot, goal.gates_script);
  if (!existsSync(scriptPath)) {
    return { ok: false, exitCode: 1, skipped: true, detail: `missing gates: ${scriptPath}` };
  }

  const proc = spawnSync("bash", [scriptPath], {
    cwd: licRoot,
    env: { ...process.env, LIC_ROOT: licRoot },
    encoding: "utf8",
    timeout: Number(process.env.LI_IMPLEMENT_GATES_TIMEOUT_MS ?? 1_800_000),
  });
  const exitCode = proc.status ?? 1;
  return {
    ok: exitCode === 0,
    exitCode,
    skipped: false,
    detail: exitCode === 0 ? "gates passed" : `gates exit ${exitCode}`,
  };
}
