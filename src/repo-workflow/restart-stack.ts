import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { agentsPackageRoot } from "../runner.js";
import {
  controlPlaneManagedBySystemd,
  restartControlPlaneSystemdUnits,
} from "./control-plane-systemd.js";

export type RestartControlPlaneDeps = {
  probeSystemd?: typeof controlPlaneManagedBySystemd;
  restartSystemd?: typeof restartControlPlaneSystemdUnits;
};

/** Restart dashboard + supervisor after a successful workspace sweep (keep-agents-running.sh). */
export async function restartControlPlaneStack(
  options?: {
    agentsRoot?: string;
    dryRun?: boolean;
  } & RestartControlPlaneDeps,
): Promise<{ ok: boolean; message: string; skipped?: boolean }> {
  if (process.env.LI_WORKSPACE_SWEEP_RESTART === "0") {
    return { ok: true, skipped: true, message: "restart skipped (LI_WORKSPACE_SWEEP_RESTART=0)" };
  }

  const probe = options?.probeSystemd ?? controlPlaneManagedBySystemd;
  const restartSystemd = options?.restartSystemd ?? restartControlPlaneSystemdUnits;

  if (await probe()) {
    if (options?.dryRun) {
      return {
        ok: true,
        message:
          "[dry-run] would systemctl --user try-restart li-agents-dashboard li-agents-async-swarm",
      };
    }
    return restartSystemd();
  }

  const root = options?.agentsRoot ?? agentsPackageRoot();
  const script = join(root, "scripts", "keep-agents-running.sh");
  if (!existsSync(script)) {
    return { ok: false, message: `missing ${script}` };
  }
  if (options?.dryRun) {
    return { ok: true, message: `[dry-run] would run ${script}` };
  }

  const child = spawn("bash", [script], {
    cwd: root,
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      LI_KEEP_AGENTS_RESTART: process.env.LI_KEEP_AGENTS_RESTART ?? "1",
    },
  });
  child.unref();
  return { ok: true, message: `restarted control plane via ${script} (pid ${child.pid ?? "?"})` };
}
