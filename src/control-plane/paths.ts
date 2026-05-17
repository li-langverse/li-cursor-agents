import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";

export function controlPlaneRoot(): string {
  const env = process.env.LI_CONTROL_PLANE_DIR;
  const base = env ?? join(agentsPackageRoot(), "data", "control-plane");
  mkdirSync(base, { recursive: true });
  return base;
}

export function statePath(): string {
  return join(controlPlaneRoot(), "state.json");
}

export function reportPath(): string {
  return join(controlPlaneRoot(), "latest-report.json");
}

export function interventionsPath(): string {
  return join(controlPlaneRoot(), "interventions.json");
}

export function runsDir(): string {
  const env = process.env.LI_RUNS_DIR;
  const dir = env ?? join(agentsPackageRoot(), "data", "runs");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function ensureControlPlaneDirs(): void {
  controlPlaneRoot();
  runsDir();
  const web = join(agentsPackageRoot(), "web");
  if (!existsSync(web)) {
    throw new Error(`Missing web UI directory: ${web}`);
  }
}
