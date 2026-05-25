import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { controlPlaneRoot } from "../control-plane/paths.js";
import type { SystemdActiveState } from "./systemd-probe.js";

export interface SwarmInfrastructureHealth {
  written_at: string;
  disable_autostart: boolean;
  async_swarm: {
    process_active: boolean;
    detached_child_active: boolean;
    systemd_dashboard: SystemdActiveState | null;
    systemd_async_swarm: SystemdActiveState | null;
  };
  plan_loops: Array<{ unit: string; active_state: SystemdActiveState }>;
  plan_loops_healthy: boolean;
}

export function swarmHealthJsonPath(): string {
  return join(controlPlaneRoot(), "swarm-health.json");
}

export function disableAutostartFilePath(): string {
  return join(controlPlaneRoot(), "DISABLE_AUTOSTART");
}

export function isDisableAutostartSet(): boolean {
  return existsSync(disableAutostartFilePath());
}

export function writeSwarmHealthJson(payload: SwarmInfrastructureHealth): string {
  const path = swarmHealthJsonPath();
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return path;
}

export function planLoopsHealthy(
  rows: Array<{ unit: string; active_state: SystemdActiveState }>,
): boolean {
  if (rows.length === 0) return true;
  return rows.every((r) => r.active_state === "active" || r.active_state === "activating");
}
